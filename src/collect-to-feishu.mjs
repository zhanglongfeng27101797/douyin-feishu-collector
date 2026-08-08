import { fileURLToPath } from "node:url";
import { createRecord, findExistingRecord, updateRecord } from "./feishu/client.mjs";
import { createFeishuContext } from "./feishu/context.mjs";
import { mapRecord } from "./feishu/fields.mjs";
import { parseDouyinShare } from "./parse-douyin.mjs";

export async function collectToFeishu(input, { dryRun = false } = {}) {
  const record = await parseDouyinShare(input);
  if (dryRun) return { status: "dry-run", record };

  const { token, appToken, table, fields } = await createFeishuContext();
  const mappedFields = mapRecord(record, fields);
  const existing = await findExistingRecord(
    token,
    appToken,
    table.table_id,
    record["作品ID"],
  );

  if (existing) {
    const data = await updateRecord(
      token,
      appToken,
      table.table_id,
      existing.record_id,
      mappedFields,
    );
    return {
      status: "updated",
      tableId: table.table_id,
      recordId: existing.record_id,
      record: data.record,
    };
  }

  const data = await createRecord(token, appToken, table.table_id, mappedFields);
  return { status: "created", tableId: table.table_id, record: data.record };
}

async function main() {
  const input = process.argv
    .slice(2)
    .filter((arg) => arg !== "--dry-run")
    .join(" ")
    .trim();
  if (!input) throw new Error("请提供抖音分享文案或链接");
  const result = await collectToFeishu(input, {
    dryRun: process.argv.includes("--dry-run"),
  });
  console.log(JSON.stringify(result.status === "dry-run" ? result.record : result, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
