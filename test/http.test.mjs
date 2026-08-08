import test from "node:test";
import assert from "node:assert/strict";
import { CollectorError } from "../src/core/errors.mjs";
import { httpRequest } from "../src/core/http.mjs";

async function withFetch(mock, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = original;
  }
}

test("幂等请求遇到临时状态码会自动重试", { concurrency: false }, async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls += 1;
      return calls === 1
        ? new Response("busy", { status: 503 })
        : new Response("ok", { status: 200 });
    },
    async () => {
      const response = await httpRequest(
        "https://example.test/data",
        {},
        { maxRetries: 1, retryBaseMs: 0, random: () => 0.5 },
      );
      assert.equal(response.status, 200);
      assert.equal(calls, 2);
    },
  );
});

test("非幂等请求默认不会自动重放", { concurrency: false }, async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls += 1;
      return new Response("busy", { status: 503 });
    },
    async () => {
      const response = await httpRequest("https://example.test/tasks", {
        method: "POST",
      });
      assert.equal(response.status, 503);
      assert.equal(calls, 1);
    },
  );
});

test("网络异常统一转换为可分类错误", { concurrency: false }, async () => {
  await withFetch(
    async () => {
      throw new Error("offline");
    },
    async () => {
      await assert.rejects(
        httpRequest(
          "https://example.test/data",
          {},
          { maxRetries: 0 },
        ),
        (error) =>
          error instanceof CollectorError &&
          error.code === "http_request_failed" &&
          error.retryable,
      );
    },
  );
});

test("请求超时统一转换为超时错误", { concurrency: false }, async () => {
  await withFetch(
    async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    async () => {
      const keepEventLoopAlive = setTimeout(() => {}, 100);
      try {
        await assert.rejects(
          httpRequest(
            "https://example.test/slow",
            {},
            { timeoutMs: 10, maxRetries: 0 },
          ),
          (error) =>
            error instanceof CollectorError &&
            error.code === "http_timeout" &&
            error.retryable,
        );
      } finally {
        clearTimeout(keepEventLoopAlive);
      }
    },
  );
});
