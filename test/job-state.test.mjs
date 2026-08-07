import test from "node:test";
import assert from "node:assert/strict";
import { CollectorError } from "../src/core/errors.mjs";
import {
  JOB_FIELDS,
  JOB_STAGE,
  JOB_STATUS,
  failedState,
  isJobRunnable,
  normalizeFailure,
  startAttempt,
  succeededState,
} from "../src/pipeline/job-state.mjs";
import { hasSuccessfulProofread } from "../src/pipeline/transcript-stage.mjs";

test("有效租约会阻止重复处理，过期租约会自动恢复", () => {
  const now = Date.parse("2026-08-06T12:00:00+08:00");
  assert.equal(
    isJobRunnable(
      {
        [JOB_FIELDS.STATUS]: JOB_STATUS.RUNNING,
        [JOB_FIELDS.LEASE_UNTIL]: now + 1000,
      },
      now,
    ),
    false,
  );
  assert.equal(
    isJobRunnable(
      {
        [JOB_FIELDS.STATUS]: JOB_STATUS.RUNNING,
        [JOB_FIELDS.LEASE_UNTIL]: now - 1,
      },
      now,
    ),
    true,
  );
});

test("旧版采集中记录没有租约时可以重新处理", () => {
  assert.equal(isJobRunnable({ "采集状态": "采集中" }), true);
  assert.equal(isJobRunnable({ "转写状态": "转写中" }), true);
});

test("开始任务会生成执行ID、租约并增加尝试次数", () => {
  const now = Date.parse("2026-08-06T12:00:00+08:00");
  const state = startAttempt(
    { [JOB_FIELDS.ATTEMPTS]: 2 },
    { now, executionId: "execution-1" },
  );
  assert.equal(state[JOB_FIELDS.STATUS], JOB_STATUS.RUNNING);
  assert.equal(state[JOB_FIELDS.STAGE], JOB_STAGE.METADATA);
  assert.equal(state[JOB_FIELDS.EXECUTION_ID], "execution-1");
  assert.equal(state[JOB_FIELDS.ATTEMPTS], 3);
  assert.ok(state[JOB_FIELDS.LEASE_UNTIL] > now);
});

test("临时失败进入退避，达到最大次数后停止自动重试", () => {
  const now = Date.parse("2026-08-06T12:00:00+08:00");
  const failure = normalizeFailure(new Error("HTTP 503"), JOB_STAGE.MEDIA);
  const retry = failedState(
    { [JOB_FIELDS.ATTEMPTS]: 1 },
    [failure],
    { now, random: () => 0.5 },
  );
  assert.equal(retry[JOB_FIELDS.STATUS], JOB_STATUS.RETRY_WAIT);
  assert.ok(retry[JOB_FIELDS.NEXT_RETRY_AT] > now);

  const stopped = failedState(
    { [JOB_FIELDS.ATTEMPTS]: 5 },
    [failure],
    { now, random: () => 0.5 },
  );
  assert.equal(stopped[JOB_FIELDS.STATUS], JOB_STATUS.PERMANENT_FAILED);
  assert.equal(stopped[JOB_FIELDS.NEXT_RETRY_AT], null);
});

test("无效输入直接标记为不可重试错误", () => {
  const failure = normalizeFailure(
    new CollectorError("分享内容中未找到有效的抖音链接", {
      code: "invalid_douyin_source",
      retryable: false,
    }),
    JOB_STAGE.METADATA,
  );
  assert.equal(failure.retryable, false);
  assert.equal(failure.code, "invalid_douyin_source");
});

test("任务完整成功后重置连续尝试次数", () => {
  assert.equal(succeededState()[JOB_FIELDS.ATTEMPTS], 0);
});

test("失败标记不会被误认为已经完成校对", () => {
  assert.equal(hasSuccessfulProofread("火山；通义双模型校对失败"), false);
  assert.equal(hasSuccessfulProofread("火山；通义双模型校对 qwen"), true);
  assert.equal(hasSuccessfulProofread("火山；证据校对 qwen"), true);
});
