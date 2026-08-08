import test from "node:test";
import assert from "node:assert/strict";
import { toWorkerJob } from "../src/web/application/worker-api-service.mjs";
import { startWebServer } from "../src/web/server.mjs";

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("Dashboard 任务转换为 iOS 任务协议", () => {
  const job = toWorkerJob({
    id: "rec123",
    source: "https://v.douyin.com/test/",
    title: "测试视频",
    modifiedAt: 1_720_000_000_000,
    task: {
      kind: "running",
      stage: { id: "transcript" },
      progress: 52,
      error: "",
    },
  });
  assert.equal(job.id, "rec123");
  assert.equal(job.status, "running");
  assert.equal(job.stage, "transcript");
  assert.equal(job.progress, 52);
  assert.equal(job.createdAt, "2024-07-03T09:46:40.000Z");
});

test("iOS 任务接口要求 Bearer 令牌并支持完整生命周期", async () => {
  const previousKey = process.env.WORKER_API_KEY;
  process.env.WORKER_API_KEY = "test-worker-key-with-24-characters";
  const calls = [];
  const workerService = {
    verify() {
      return {
        ok: true,
        feishuConfigured: true,
        speechConfigured: true,
        analysisConfigured: true,
        tableName: "采集库",
      };
    },
    async list() {
      calls.push(["list"]);
      return { items: [] };
    },
    async create(source) {
      calls.push(["create", source]);
      return { job: { id: "rec123", status: "queued" } };
    },
    async get(id) {
      calls.push(["get", id]);
      return { job: { id, status: "running" } };
    },
    async retry(id) {
      calls.push(["retry", id]);
      return { job: { id, status: "retry_wait" } };
    },
  };
  const noOpService = {};
  const { server, url } = await startWebServer({
    port: 0,
    service: noOpService,
    settingsService: {},
    workerService,
    logger: { log() {}, error() {} },
  });
  const authorization = { authorization: `Bearer ${process.env.WORKER_API_KEY}` };
  try {
    const health = await fetch(`${url}/v1/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, "liuguang-worker");

    const denied = await fetch(`${url}/v1/jobs`);
    assert.equal(denied.status, 401);

    const verify = await fetch(`${url}/v1/session/verify`, {
      method: "POST",
      headers: authorization,
    });
    assert.equal((await verify.json()).tableName, "采集库");

    const created = await fetch(`${url}/v1/jobs`, {
      method: "POST",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ source: "https://v.douyin.com/test/" }),
    });
    assert.equal(created.status, 202);
    assert.equal((await created.json()).job.id, "rec123");

    const detail = await fetch(`${url}/v1/jobs/rec123`, { headers: authorization });
    assert.equal((await detail.json()).job.status, "running");

    const retried = await fetch(`${url}/v1/jobs/rec123/retry`, {
      method: "POST",
      headers: authorization,
    });
    assert.equal((await retried.json()).job.status, "retry_wait");
    assert.deepEqual(calls, [
      ["create", "https://v.douyin.com/test/"],
      ["get", "rec123"],
      ["retry", "rec123"],
    ]);
  } finally {
    await close(server);
    if (previousKey == null) delete process.env.WORKER_API_KEY;
    else process.env.WORKER_API_KEY = previousKey;
  }
});
