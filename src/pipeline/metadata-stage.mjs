import { parseDouyinShare } from "../parse-douyin.mjs";
import { CollectorError } from "../core/errors.mjs";
import { updateRecord } from "../feishu/client.mjs";
import { fieldsSubset, mapRecord } from "../feishu/fields.mjs";

export async function collectMetadata({ context, item, row, source, existingIds }) {
  if (row["作品ID"]) return row;
  const { token, appToken, table, fields, fieldNames } = context;

  await updateRecord(
    token,
    appToken,
    table.table_id,
    item.record_id,
    fieldsSubset({ "采集状态": "采集中", "错误原因": "" }, fieldNames),
  );
  const metadata = await parseDouyinShare(source);
  const duplicateId = existingIds.get(String(metadata["作品ID"]));
  if (duplicateId && duplicateId !== item.record_id) {
    throw new CollectorError(`该作品已存在，记录ID: ${duplicateId}`, {
      code: "duplicate_aweme",
      retryable: false,
    });
  }
  // 在第一个异步写入前先占用作品 ID，避免并发采集相同链接时产生重复记录。
  existingIds.set(String(metadata["作品ID"]), item.record_id);
  try {
    await updateRecord(
      token,
      appToken,
      table.table_id,
      item.record_id,
      mapRecord(
        { ...metadata, "采集状态": "基础信息成功", "错误原因": "" },
        fields,
      ),
    );
  } catch (error) {
    if (existingIds.get(String(metadata["作品ID"])) === item.record_id) {
      existingIds.delete(String(metadata["作品ID"]));
    }
    throw error;
  }
  return { ...row, ...metadata };
}
