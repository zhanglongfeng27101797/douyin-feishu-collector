import { fileURLToPath } from "node:url";
import { getFeishuConfig, loadLocalEnv } from "./config/env.mjs";
import {
  api,
  findExistingRecord,
  findTable,
  listFields,
  tenantToken,
} from "./feishu/client.mjs";
import { mapRecord } from "./feishu/fields.mjs";
import { parseDouyinShare } from "./parse-douyin.mjs";

// 兼容已有脚本的导入路径；新代码应直接从 config/ 和 feishu/ 导入。
export { loadLocalEnv } from "./config/env.mjs";
export {
  api,
  findExistingRecord,
  findTable,
  listAllRecords,
  listFields,
  tenantToken,
  updateRecord,
} from "./feishu/client.mjs";
export {
  fieldsSubset,
  getInputLink,
  getLinkValue,
  getShareText,
  mapRecord,
} from "./feishu/fields.mjs";

export async function collectToFeishu(input, { dryRun = false } = {}) {
  const record = await parseDouyinShare(input);
  if (dryRun) return { status: "dry-run", record };

  const { appId, appSecret, appToken, tableName } = getFeishuConfig();
  const token = await tenantToken(appId, appSecret);
  const table = await findTable(token, appToken, tableName);
  const fields = await listFields(token, appToken, table.table_id);
  const mappedFields = mapRecord(record, fields);
  const existing = await findExistingRecord(
    token,
    appToken,
    table.table_id,
    record["作品ID"],
  );

  const recordUrl =
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}` +
    `/tables/${table.table_id}/records`;
  if (existing) {
    const data = await api(`${recordUrl}/${existing.record_id}`, {
      token,
      method: "PUT",
      body: { fields: mappedFields },
    });
    return {
      status: "updated",
      tableId: table.table_id,
      recordId: existing.record_id,
      record: data.record,
    };
  }

  const data = await api(recordUrl, {
    token,
    method: "POST",
    body: { fields: mappedFields },
  });
  return { status: "created", tableId: table.table_id, record: data.record };
}

async function main() {
  loadLocalEnv();
  const input = process.argv.slice(2).filter((arg) => arg !== "--dry-run").join(" ").trim();
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
