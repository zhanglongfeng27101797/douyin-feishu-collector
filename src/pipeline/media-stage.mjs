import { parseDouyinShare } from "../parse-douyin.mjs";
import {
  downloadAndUploadCover,
  uploadPreparedVideo,
} from "../feishu/media.mjs";
import { getMediaSettings } from "../config/env.mjs";
import { updateRecord } from "../feishu/client.mjs";
import { fieldsSubset, getLinkValue, mapRecord } from "../feishu/fields.mjs";
import { getCoverCandidates, getVideoCandidates } from "../media/candidates.mjs";
import { prepareMedia } from "../media/ffmpeg.mjs";

export function isFeishuVideoArchiveEnabled() {
  return getMediaSettings().videoStorageMode !== "none";
}

export async function uploadCover({ context, item, row }) {
  const { token, appToken, table, fields, fieldNames } = context;
  if (
    !fieldNames.includes("封面") ||
    !row["作品ID"] ||
    !getLinkValue(row["封面链接"]) ||
    row["封面"]
  ) {
    return { row, error: null };
  }

  try {
    console.log(`[封面] ${row["作品ID"]} 正在上传封面`);
    const uploaded = await downloadAndUploadCover(getCoverCandidates(row), {
      token,
      appToken,
      awemeId: row["作品ID"],
    });
    const cover = [{ file_token: uploaded.fileToken }];
    await updateRecord(
      token,
      appToken,
      table.table_id,
      item.record_id,
      mapRecord({ "封面": cover }, fields),
    );
    console.log(`[封面成功] ${row["作品ID"]}`);
    return { row: { ...row, "封面": cover }, error: null };
  } catch (error) {
    const message = `封面上传失败：${error.message}`;
    await updateRecord(
      token,
      appToken,
      table.table_id,
      item.record_id,
      fieldsSubset({ "错误原因": message }, fieldNames),
    ).catch(() => {});
    console.error(`[封面失败] ${row["作品ID"]}: ${error.message}`);
    return { row: { ...row, "错误原因": message }, error };
  }
}

export async function prepareRecordMedia({ context, item, row, source }) {
  const { videoStorageMode, archiveMaxWidth, archiveCrf } = getMediaSettings();
  const videoOptions = { maxWidth: archiveMaxWidth, crf: archiveCrf };
  const needAudio = !row["视频逐字稿"];
  const needVideo =
    videoStorageMode !== "none" &&
    context.fieldNames.includes("视频附件") &&
    !row["视频附件"];
  if (!needAudio && !needVideo) return { prepared: null, row };

  let current = row;
  try {
    const prepared = await prepareMedia(getVideoCandidates(current), {
      needAudio,
      needVideo,
      videoProfile:
        videoStorageMode === "feishu_compressed" ? "compressed" : "original",
      videoOptions,
    });
    return { prepared, row: current };
  } catch (error) {
    const refreshSource = source || getLinkValue(current["标准链接"]);
    if (error?.retryable === false || !refreshSource) throw error;
    console.log(`[媒体] ${current["作品ID"]} 播放地址不可用，正在重新解析`);
    const refreshed = await parseDouyinShare(refreshSource);
    current = { ...current, ...refreshed };
    await updateRecord(
      context.token,
      context.appToken,
      context.table.table_id,
      item.record_id,
      mapRecord(refreshed, context.fields),
    );
    const prepared = await prepareMedia(getVideoCandidates(refreshed), {
      needAudio,
      needVideo,
      videoProfile:
        videoStorageMode === "feishu_compressed" ? "compressed" : "original",
      videoOptions,
    });
    return { prepared, row: current };
  }
}

export async function archivePreparedVideo({ context, item, row, prepared }) {
  if (!prepared?.videoPath || row["视频附件"]) {
    return { row, error: null };
  }
  const { token, appToken, table, fields } = context;
  try {
    console.log(`[视频归档] ${row["作品ID"]} 正在上传飞书附件`);
    const uploaded = await uploadPreparedVideo(prepared.videoPath, {
      token,
      appToken,
      awemeId: row["作品ID"],
      sourceUrl: prepared.sourceUrl,
    });
    const updates = {
      "视频附件": [{ file_token: uploaded.fileToken }],
      "视频链接": uploaded.usedUrl || row["视频链接"],
    };
    await updateRecord(
      token,
      appToken,
      table.table_id,
      item.record_id,
      mapRecord(updates, fields),
    );
    console.log(
      `[视频归档成功] ${row["作品ID"]} ${(uploaded.size / 1024 / 1024).toFixed(1)} MB`,
    );
    return { row: { ...row, ...updates }, error: null };
  } catch (error) {
    console.error(`[视频归档失败] ${row["作品ID"]}: ${error.message}`);
    return { row, error };
  }
}
