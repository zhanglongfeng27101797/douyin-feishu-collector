import test from "node:test";
import assert from "node:assert/strict";
import { toDashboardRecord } from "../src/web/domain/dashboard-record.mjs";
import { startWebServer } from "../src/web/server.mjs";

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("飞书记录转换为用户可读的阶段进度", () => {
  const record = toDashboardRecord({
    record_id: "rec123",
    last_modified_time: "1720000000",
    fields: {
      "作品ID": "7642",
      "标题": "测试作品",
      "任务状态": "retry_wait",
      "处理阶段": "analysis",
      "尝试次数": 2,
      "下次重试时间": 1720000060000,
      "视频逐字稿": "逐字稿",
      "错误原因": "模型暂不可用",
    },
  });
  assert.equal(record.task.kind, "waiting");
  assert.equal(record.task.label, "等待重试");
  assert.equal(record.task.stage.label, "内容分析");
  assert.equal(record.task.progress, 82);
  assert.equal(record.outputs.transcript, "逐字稿");
  assert.equal(record.modifiedAt, 1720000000000);
});

test("本地页面提供列表、创建和重试交互", async () => {
  const calls = [];
  const service = {
    async list() {
      calls.push(["list"]);
      return {
        tableName: "采集库",
        items: [],
        summary: { total: 0, running: 0, waiting: 0, failed: 0, completed: 0 },
      };
    },
    async create(input) {
      calls.push(["create", input]);
      return { recordId: "rec123", status: "queued" };
    },
    async get(recordId) {
      calls.push(["get", recordId]);
      return { id: recordId, title: "详情" };
    },
    async retry(recordId) {
      calls.push(["retry", recordId]);
      return { recordId, status: "retry_wait" };
    },
  };
  const settingsService = {
    async read() {
      calls.push(["settings-read"]);
      return { values: { feishuTableName: "采集库" }, secrets: {} };
    },
    async save(input) {
      calls.push(["settings-save", input.feishuAppId]);
      return { values: input, secrets: {} };
    },
    async setup(input) {
      calls.push(["settings-setup", input.feishuTableName]);
      return { appToken: "app123", settings: { values: input, secrets: {} } };
    },
  };
  const { server, url } = await startWebServer({
    port: 0,
    service,
    settingsService,
    logger: { log() {}, error() {} },
  });
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /流光 · 内容采集工作台/);
    assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);

    const browserModule = await fetch(`${url}/scripts/ui.js`);
    assert.equal(browserModule.status, 200);
    assert.match(browserModule.headers.get("content-type"), /text\/javascript/);

    const componentStyles = await fetch(`${url}/styles/foundation.css`);
    assert.equal(componentStyles.status, 200);
    assert.match(componentStyles.headers.get("content-type"), /text\/css/);

    const listed = await fetch(`${url}/api/records/list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).data.tableName, "采集库");

    const detail = await fetch(`${url}/api/records/get`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recordId: "rec123" }),
    });
    assert.equal((await detail.json()).data.title, "详情");

    const created = await fetch(`${url}/api/records/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "https://v.douyin.com/test/" }),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).data.recordId, "rec123");

    const retried = await fetch(`${url}/api/records/retry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recordId: "rec123" }),
    });
    assert.equal(retried.status, 200);
    assert.equal((await retried.json()).data.status, "retry_wait");

    const settings = await fetch(`${url}/api/settings/get`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal((await settings.json()).data.values.feishuTableName, "采集库");

    await fetch(`${url}/api/settings/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feishuAppId: "cli_test" }),
    });
    await fetch(`${url}/api/settings/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feishuTableName: "新采集库" }),
    });
    assert.deepEqual(calls, [
      ["list"],
      ["get", "rec123"],
      ["create", "https://v.douyin.com/test/"],
      ["retry", "rec123"],
      ["settings-read"],
      ["settings-save", "cli_test"],
      ["settings-setup", "新采集库"],
    ]);
  } finally {
    await close(server);
  }
});
