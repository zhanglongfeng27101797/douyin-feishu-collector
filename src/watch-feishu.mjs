import { fileURLToPath } from "node:url";
import { listAllRecords } from "./feishu/client.mjs";
import { createFeishuContext } from "./feishu/context.mjs";
import { needsProcessing, processRecord } from "./pipeline/record-pipeline.mjs";
import { missingJobFields } from "./pipeline/job-state.mjs";
import {
  getAsrSettings,
  getMediaSettings,
  getWatcherSettings,
  loadLocalEnv,
} from "./config/env.mjs";
import { assertMediaRuntime } from "./media/ffmpeg.mjs";

const DEFAULT_INTERVAL_SECONDS = 10;
const TOKEN_REFRESH_MS = 60 * 60 * 1000;

async function processWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );
}

export async function buildContext() {
  loadLocalEnv();
  await assertMediaRuntime();
  getMediaSettings();
  getAsrSettings();
  const context = await createFeishuContext();
  const { fieldNames } = context;
  const missingStateFields = missingJobFields(fieldNames);
  if (missingStateFields.length > 0) {
    console.warn(
      `[配置提醒] 缺少任务状态字段：${missingStateFields.join("、")}。` +
        "请运行 npm run setup:pipeline；当前进程仅使用内存退避。",
    );
  }
  return context;
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

  const { concurrency } = getWatcherSettings();
  console.log(`[监听] 发现 ${pending.length} 条待处理记录，并发数 ${concurrency}`);
  await processWithConcurrency(pending, concurrency, (item) =>
    processRecord({ context, item, existingIds, retryAfter }),
  );
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
