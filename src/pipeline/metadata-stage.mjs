import { parseDouyinShare } from "../parse-douyin.mjs";
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
    throw new Error(`该作品已存在，记录ID: ${duplicateId}`);
  }
  await updateRecord(
    token,
    appToken,
    table.table_id,
    item.record_id,
    mapRecord(
      { ...metadata, "采集状态": "基础信息成功，转写中", "错误原因": "" },
      fields,
    ),
  );
  existingIds.set(String(metadata["作品ID"]), item.record_id);
  return { ...row, ...metadata };
}
