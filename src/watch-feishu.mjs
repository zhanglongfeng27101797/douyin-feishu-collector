import { fileURLToPath } from "node:url";
import { getFeishuConfig, loadLocalEnv } from "./config/env.mjs";
import {
  findTable,
  listAllRecords,
  listFields,
  tenantToken,
} from "./feishu/client.mjs";
import { needsProcessing, processRecord } from "./pipeline/record-pipeline.mjs";

const DEFAULT_INTERVAL_SECONDS = 10;
const TOKEN_REFRESH_MS = 60 * 60 * 1000;

export async function buildContext() {
  loadLocalEnv();
  const { appId, appSecret, appToken, tableName } = getFeishuConfig();
  const token = await tenantToken(appId, appSecret);
  const table = await findTable(token, appToken, tableName);
  const fields = await listFields(token, appToken, table.table_id);
  return {
    token,
    appToken,
    table,
    fields,
    fieldNames: fields.map((field) => field.field_name),
  };
}

export async function runOnce(context, retryAfter = new Map()) {
  const records = await listAllRecords(
    context.token,
    context.appToken,
    context.table.table_id,
  );
  const existingIds = new Map();
  for (const item of records) {
    const id = item.fields?.["作品ID"];
    if (id) existingIds.set(String(id), item.record_id);
  }

  const pending = records.filter((item) => needsProcessing(item, context, retryAfter));
  if (pending.length === 0) {
    console.log(`[监听] 未发现待采集链接，共检查 ${records.length} 行`);
    return 0;
  }

  for (const item of pending) {
    await processRecord({ context, item, existingIds, retryAfter });
  }
  return pending.length;
}

function intervalSeconds(argv) {
  const intervalArg = argv.find((arg) => arg.startsWith("--interval="));
  return Math.max(5, Number(intervalArg?.split("=")[1] || DEFAULT_INTERVAL_SECONDS));
}

export async function runWatcher(argv = process.argv.slice(2)) {
  let context = await buildContext();
  const retryAfter = new Map();
  if (argv.includes("--once")) {
    await runOnce(context, retryAfter);
    return;
  }

  const interval = intervalSeconds(argv);
  console.log(`已开始监听“${context.table.name}”，每 ${interval} 秒检查一次`);
  let contextCreatedAt = Date.now();
  while (true) {
    if (Date.now() - contextCreatedAt > TOKEN_REFRESH_MS) {
      context = await buildContext();
      contextCreatedAt = Date.now();
      console.log("[监听] 已自动刷新飞书访问凭证");
    }
    try {
      await runOnce(context, retryAfter);
    } catch (error) {
      if (!String(error.message).includes("Invalid access token")) throw error;
      context = await buildContext();
      contextCreatedAt = Date.now();
      console.log("[监听] 飞书访问凭证已失效，刷新后重试");
      await runOnce(context, retryAfter);
    }
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runWatcher().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
