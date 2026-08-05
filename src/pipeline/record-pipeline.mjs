import { updateRecord } from "../feishu/client.mjs";
import { fieldsSubset, getInputLink, getLinkValue } from "../feishu/fields.mjs";
import { analyzeContent, needsContentAnalysis } from "./analysis-stage.mjs";
import { uploadCover, uploadVideo } from "./media-stage.mjs";
import { collectMetadata } from "./metadata-stage.mjs";
import { proofreadExisting, transcribeMissing } from "./transcript-stage.mjs";

export function needsProcessing(item, context, retryAfter) {
  const row = item.fields || {};
  const input = getInputLink(row);
  const status = String(row["采集状态"] || "");
  const transcriptionStatus = String(row["转写状态"] || "");
  const error = String(row["错误原因"] || "");

  const needsMetadata = input && !row["作品ID"] && status !== "采集中";
  const needsTranscript =
    row["作品ID"] &&
    getLinkValue(row["视频链接"]) &&
    !row["视频逐字稿"] &&
    transcriptionStatus !== "转写中";
  const needsAudit =
    process.env.ENABLE_TEXT_PROOFREAD === "true" &&
    row["视频逐字稿"] &&
    !String(row["转写来源"] || "").includes("通义双模型校对") &&
    !String(row["转写来源"] || "").includes("证据校对");
  const needsAttachment =
    row["作品ID"] &&
    getLinkValue(row["视频链接"]) &&
    !row["视频附件"] &&
    (!error.includes("视频附件上传失败") || error.includes("HTTP 403"));
  const needsCover =
    context.fieldNames.includes("封面") &&
    row["作品ID"] &&
    getLinkValue(row["封面链接"]) &&
    !row["封面"] &&
    !error.includes("封面上传失败");
  const needsAnalysis =
    needsContentAnalysis(row, context.fieldNames) &&
    Date.now() >= (retryAfter.get(item.record_id) || 0);

  return Boolean(
    needsMetadata ||
      needsTranscript ||
      needsAudit ||
      needsAttachment ||
      needsCover ||
      needsAnalysis,
  );
}

export async function processRecord({ context, item, existingIds, retryAfter }) {
  const originalRow = item.fields || {};
  const source = getInputLink(originalRow);
  let row = originalRow;
  try {
    row = await collectMetadata({ context, item, row, source, existingIds });
    row = await uploadCover({ context, item, row });
    row = await uploadVideo({ context, item, row, source });

    const transcription = await transcribeMissing({ context, item, row });
    row = transcription.row;
    if (transcription.failed) return row;

    row = await proofreadExisting({ context, item, row });
    row = await analyzeContent({ context, item, row, retryAfter });
    return row;
  } catch (error) {
    await updateRecord(
      context.token,
      context.appToken,
      context.table.table_id,
      item.record_id,
      fieldsSubset(
        { "采集状态": "失败", "错误原因": error.message },
        context.fieldNames,
      ),
    ).catch(() => {});
    console.error(`[失败] ${source}: ${error.message}`);
    return row;
  }
}
