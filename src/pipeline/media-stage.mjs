import { parseDouyinShare } from "../parse-douyin.mjs";
import {
  downloadAndUploadCover,
  downloadAndUploadVideo,
} from "../feishu-media.mjs";
import { updateRecord } from "../feishu/client.mjs";
import { fieldsSubset, getLinkValue, mapRecord } from "../feishu/fields.mjs";

export async function uploadCover({ context, item, row }) {
  const { token, appToken, table, fields, fieldNames } = context;
  if (
    !fieldNames.includes("封面") ||
    !row["作品ID"] ||
    !getLinkValue(row["封面链接"]) ||
    row["封面"] ||
    String(row["错误原因"] || "").includes("封面上传失败")
  ) {
    return row;
  }

  try {
    console.log(`[封面] ${row["作品ID"]} 正在上传封面`);
    const uploaded = await downloadAndUploadCover(getLinkValue(row["封面链接"]), {
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
    return { ...row, "封面": cover };
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
    return { ...row, "错误原因": message };
  }
}

export async function uploadVideo({ context, item, row, source }) {
  const { token, appToken, table, fields, fieldNames } = context;
  const previousError = String(row["错误原因"] || "");
  if (
    !fieldNames.includes("视频附件") ||
    !row["作品ID"] ||
    !getLinkValue(row["视频链接"]) ||
    row["视频附件"] ||
    (previousError.includes("视频附件上传失败") && !previousError.includes("HTTP 403"))
  ) {
    return row;
  }

  let current = row;
  try {
    console.log(`[视频附件] ${current["作品ID"]} 正在上传原视频`);
    let uploaded;
    try {
      uploaded = await downloadAndUploadVideo(getLinkValue(current["视频链接"]), {
        token,
        appToken,
        awemeId: current["作品ID"],
      });
    } catch (downloadError) {
      const refreshSource = source || getLinkValue(current["标准链接"]);
      if (!String(downloadError.message).includes("HTTP 403") || !refreshSource) {
        throw downloadError;
      }
      console.log(`[视频附件] ${current["作品ID"]} 播放地址已过期，正在重新解析`);
      const refreshed = await parseDouyinShare(refreshSource);
      current = { ...current, ...refreshed };
      await updateRecord(
        token,
        appToken,
        table.table_id,
        item.record_id,
        mapRecord(refreshed, fields),
      );
      uploaded = await downloadAndUploadVideo(getLinkValue(refreshed["视频链接"]), {
        token,
        appToken,
        awemeId: current["作品ID"],
      });
    }

    const attachment = [{ file_token: uploaded.fileToken }];
    await updateRecord(
      token,
      appToken,
      table.table_id,
      item.record_id,
      mapRecord({ "视频附件": attachment, "错误原因": "" }, fields),
    );
    console.log(
      `[视频附件成功] ${current["作品ID"]} ${(uploaded.size / 1024 / 1024).toFixed(1)} MB`,
    );
    return { ...current, "视频附件": attachment, "错误原因": "" };
  } catch (error) {
    const message = `视频附件上传失败：${error.message}`;
    await updateRecord(
      token,
      appToken,
      table.table_id,
      item.record_id,
      fieldsSubset({ "错误原因": message }, fieldNames),
    ).catch(() => {});
    console.error(`[视频附件失败] ${current["作品ID"]}: ${error.message}`);
    return { ...current, "错误原因": message };
  }
}
