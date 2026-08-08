import { getInputLink, getLinkValue } from "../feishu/fields.mjs";
import { isTextProofreadEnabled } from "../config/env.mjs";
import { analyzeContent, needsContentAnalysis } from "./analysis-stage.mjs";
import {
  archivePreparedVideo,
  isFeishuVideoArchiveEnabled,
  prepareRecordMedia,
  uploadCover,
} from "./media-stage.mjs";
import { collectMetadata } from "./metadata-stage.mjs";
import {
  hasSuccessfulProofread,
  proofreadExisting,
  transcribeMissing,
} from "./transcript-stage.mjs";
import {
  JOB_FIELDS,
  JOB_STAGE,
  JOB_STATUS,
  failedState,
  hasUnfinishedJobState,
  isJobRunnable,
  normalizeFailure,
  persistJobState,
  runningStage,
  startAttempt,
  succeededState,
} from "./job-state.mjs";

export function needsProcessing(item, context, retryAfter) {
  const row = item.fields || {};
  const input = getInputLink(row);
  const now = Date.now();
  if (!isJobRunnable(row, now)) return false;
  if (now < (retryAfter.get(item.record_id) || 0)) return false;

  const needsMetadata = input && !row["作品ID"];
  const needsTranscript =
    row["作品ID"] &&
    getLinkValue(row["视频链接"]) &&
    !row["视频逐字稿"];
  const needsAudit =
    isTextProofreadEnabled() &&
    row["视频逐字稿"] &&
    !hasSuccessfulProofread(row["转写来源"]);
  const needsAttachment =
    isFeishuVideoArchiveEnabled() &&
    row["作品ID"] &&
    getLinkValue(row["视频链接"]) &&
    !row["视频附件"];
  const needsCover =
    context.fieldNames.includes("封面") &&
    row["作品ID"] &&
    getLinkValue(row["封面链接"]) &&
    !row["封面"];
  const needsAnalysis = needsContentAnalysis(row, context.fieldNames);
  const needsStateFinalization =
    hasUnfinishedJobState(row) && Boolean(input || row["作品ID"]);

  return Boolean(
    needsMetadata ||
      needsTranscript ||
      needsAudit ||
      needsAttachment ||
      needsCover ||
      needsAnalysis ||
      needsStateFinalization,
  );
}

function failureMessage(failures) {
  return failures
    .map((failure) => `[${failure.stage}] ${failure.message}`)
    .join("；")
    .slice(0, 2000);
}

function enterStage({ context, item, row, stage, executionId, status }) {
  return persistJobState({
    context,
    item,
    row,
    state: {
      ...runningStage(stage, executionId),
      ...(status ? { "采集状态": status } : {}),
    },
  });
}

async function finishWithFailures({ context, item, row, failures, retryAfter }) {
  const state = failedState(row, failures);
  const retryAt = state[JOB_FIELDS.NEXT_RETRY_AT];
  if (state[JOB_FIELDS.STATUS] === JOB_STATUS.RETRY_WAIT && retryAt) {
    retryAfter.set(item.record_id, retryAt);
  } else {
    retryAfter.delete(item.record_id);
  }
  return persistJobState({
    context,
    item,
    row,
    state: {
      ...state,
      "采集状态": row["作品ID"] ? "部分成功" : "失败",
      "错误原因": failureMessage(failures),
    },
  });
}

export async function processRecord({ context, item, existingIds, retryAfter }) {
  const originalRow = item.fields || {};
  const source = getInputLink(originalRow);
  let row = originalRow;
  let stage = JOB_STAGE.METADATA;
  let preparedMedia = null;
  try {
    const attempt = startAttempt(row);
    row = await persistJobState({ context, item, row, state: attempt });
    const executionId = attempt[JOB_FIELDS.EXECUTION_ID];

    row = await collectMetadata({ context, item, row, source, existingIds });

    stage = JOB_STAGE.MEDIA;
    row = await enterStage({
      context,
      item,
      row,
      stage,
      executionId,
      status: row["视频逐字稿"] ? "准备可选归档" : "提取压缩音频中",
    });
    const failures = [];
    const warnings = [];
    const needsAudio = !row["视频逐字稿"];
    try {
      const media = await prepareRecordMedia({ context, item, row, source });
      preparedMedia = media.prepared;
      row = media.row;
    } catch (error) {
      if (needsAudio) throw error;
      warnings.push(`[archive] ${error.message}`);
    }

    stage = JOB_STAGE.TRANSCRIPT;
    row = await enterStage({
      context,
      item,
      row,
      stage,
      executionId,
      status: row["视频逐字稿"] ? "逐字稿已存在" : "语音转写中",
    });
    const transcription = await transcribeMissing({
      context,
      item,
      row,
      preparedMedia,
    });
    row = transcription.row;
    if (transcription.error) {
      failures.push(normalizeFailure(transcription.error, stage));
      return await finishWithFailures({ context, item, row, failures, retryAfter });
    }

    stage = JOB_STAGE.PROOFREAD;
    row = await enterStage({
      context,
      item,
      row,
      stage,
      executionId,
      status: "逐字稿校对中",
    });
    const proofread = await proofreadExisting({ context, item, row });
    row = proofread.row;
    if (proofread.error) failures.push(normalizeFailure(proofread.error, stage));

    stage = JOB_STAGE.ANALYSIS;
    row = await enterStage({
      context,
      item,
      row,
      stage,
      executionId,
      status: "内容分析中",
    });
    const analysis = await analyzeContent({ context, item, row });
    row = analysis.row;
    if (analysis.error) failures.push(normalizeFailure(analysis.error, stage));

    if (failures.length > 0) {
      return await finishWithFailures({ context, item, row, failures, retryAfter });
    }

    stage = JOB_STAGE.ARCHIVE;
    row = await enterStage({
      context,
      item,
      row,
      stage,
      executionId,
      status: isFeishuVideoArchiveEnabled() ? "可选附件归档中" : "整理结果中",
    });
    const cover = await uploadCover({ context, item, row });
    row = cover.row;
    if (cover.error) warnings.push(`[cover] ${cover.error.message}`);

    const archived = await archivePreparedVideo({
      context,
      item,
      row,
      prepared: preparedMedia,
    });
    row = archived.row;
    if (archived.error) warnings.push(`[archive] ${archived.error.message}`);

    retryAfter.delete(item.record_id);
    return await persistJobState({
      context,
      item,
      row,
      state: {
        ...succeededState(),
        "采集状态": warnings.length > 0 ? "成功（可选归档有警告）" : "成功",
        "错误原因": warnings.join("；").slice(0, 2000),
      },
    });
  } catch (error) {
    const failure = normalizeFailure(error, stage);
    const failedRow = await finishWithFailures({
      context,
      item,
      row,
      failures: [failure],
      retryAfter,
    }).catch(() => row);
    console.error(`[失败] ${source}: ${failure.message}`);
    return failedRow;
  } finally {
    await preparedMedia?.cleanup().catch(() => {});
  }
}
