import { updateRecord } from "../feishu/client.mjs";
import { mapRecord } from "../feishu/fields.mjs";
import { getPipelineSettings } from "../config/env.mjs";

export const JOB_STATUS = Object.freeze({
  RUNNING: "running",
  RETRY_WAIT: "retry_wait",
  SUCCEEDED: "succeeded",
  PERMANENT_FAILED: "permanent_failed",
});

export const JOB_STAGE = Object.freeze({
  METADATA: "metadata",
  MEDIA: "media",
  TRANSCRIPT: "transcript",
  PROOFREAD: "proofread",
  ANALYSIS: "analysis",
  ARCHIVE: "archive",
  COMPLETED: "completed",
});

export const JOB_FIELDS = Object.freeze({
  STATUS: "任务状态",
  STAGE: "处理阶段",
  EXECUTION_ID: "任务执行ID",
  LEASE_UNTIL: "租约到期时间",
  ATTEMPTS: "尝试次数",
  NEXT_RETRY_AT: "下次重试时间",
  ERROR_CODE: "错误代码",
});

export const JOB_FIELD_DEFINITIONS = Object.freeze([
  { field_name: JOB_FIELDS.STATUS, type: 1 },
  { field_name: JOB_FIELDS.STAGE, type: 1 },
  { field_name: JOB_FIELDS.EXECUTION_ID, type: 1 },
  { field_name: JOB_FIELDS.LEASE_UNTIL, type: 5 },
  { field_name: JOB_FIELDS.ATTEMPTS, type: 2 },
  { field_name: JOB_FIELDS.NEXT_RETRY_AT, type: 5 },
  { field_name: JOB_FIELDS.ERROR_CODE, type: 1 },
]);

function timestamp(value) {
  if (value == null || value === "") return 0;
  const numeric = Number(value);
  const parsed = Number.isFinite(numeric) ? numeric : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function attempts(row) {
  const value = Number(row?.[JOB_FIELDS.ATTEMPTS] || 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function isJobRunnable(row, now = Date.now()) {
  const status = String(row?.[JOB_FIELDS.STATUS] || "");
  if (status === JOB_STATUS.PERMANENT_FAILED) return false;
  if (status === JOB_STATUS.RUNNING) {
    return timestamp(row?.[JOB_FIELDS.LEASE_UNTIL]) <= now;
  }
  if (status === JOB_STATUS.RETRY_WAIT) {
    return timestamp(row?.[JOB_FIELDS.NEXT_RETRY_AT]) <= now;
  }
  return true;
}

export function hasUnfinishedJobState(row) {
  const status = String(row?.[JOB_FIELDS.STATUS] || "");
  return status === JOB_STATUS.RUNNING || status === JOB_STATUS.RETRY_WAIT;
}

export function startAttempt(row, { now = Date.now(), executionId = crypto.randomUUID() } = {}) {
  const { leaseSeconds } = getPipelineSettings();
  return {
    [JOB_FIELDS.STATUS]: JOB_STATUS.RUNNING,
    [JOB_FIELDS.STAGE]: JOB_STAGE.METADATA,
    [JOB_FIELDS.EXECUTION_ID]: executionId,
    [JOB_FIELDS.LEASE_UNTIL]: now + leaseSeconds * 1000,
    [JOB_FIELDS.ATTEMPTS]: attempts(row) + 1,
    [JOB_FIELDS.NEXT_RETRY_AT]: null,
    [JOB_FIELDS.ERROR_CODE]: null,
  };
}

export function runningStage(stage, executionId, now = Date.now()) {
  const { leaseSeconds } = getPipelineSettings();
  return {
    [JOB_FIELDS.STATUS]: JOB_STATUS.RUNNING,
    [JOB_FIELDS.STAGE]: stage,
    [JOB_FIELDS.EXECUTION_ID]: executionId,
    [JOB_FIELDS.LEASE_UNTIL]: now + leaseSeconds * 1000,
  };
}

export function normalizeFailure(error, stage = "unknown") {
  const message = String(error?.message || error || "未知错误");
  const explicitRetryable = error && typeof error.retryable === "boolean"
    ? error.retryable
    : null;
  const retryable = explicitRetryable ?? true;
  return {
    stage,
    code: String(error?.code || `${stage}_failed`),
    message,
    retryable,
  };
}

export function retryDelayMs(attempt, random = Math.random) {
  const { retryBaseSeconds, retryMaxSeconds } = getPipelineSettings();
  const exponential = retryBaseSeconds * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(retryMaxSeconds, exponential);
  const jitter = 0.8 + Math.max(0, Math.min(1, random())) * 0.4;
  return Math.round(capped * jitter * 1000);
}

export function failedState(row, failures, { now = Date.now(), random = Math.random } = {}) {
  const attempt = attempts(row);
  const { maxAttempts } = getPipelineSettings();
  const retryable = failures.every((failure) => failure.retryable) && attempt < maxAttempts;
  const primary = failures[0];
  return {
    [JOB_FIELDS.STATUS]: retryable
      ? JOB_STATUS.RETRY_WAIT
      : JOB_STATUS.PERMANENT_FAILED,
    [JOB_FIELDS.STAGE]: primary.stage,
    [JOB_FIELDS.LEASE_UNTIL]: null,
    [JOB_FIELDS.NEXT_RETRY_AT]: retryable
      ? now + retryDelayMs(attempt, random)
      : null,
    [JOB_FIELDS.ERROR_CODE]: failures.map((failure) => failure.code).join(","),
  };
}

export function succeededState() {
  return {
    [JOB_FIELDS.STATUS]: JOB_STATUS.SUCCEEDED,
    [JOB_FIELDS.STAGE]: JOB_STAGE.COMPLETED,
    [JOB_FIELDS.LEASE_UNTIL]: null,
    [JOB_FIELDS.ATTEMPTS]: 0,
    [JOB_FIELDS.NEXT_RETRY_AT]: null,
    [JOB_FIELDS.ERROR_CODE]: null,
  };
}

export async function persistJobState({ context, item, row, state }) {
  const fields = mapRecord(state, context.fields, { includeEmpty: true });
  if (Object.keys(fields).length > 0) {
    await updateRecord(
      context.token,
      context.appToken,
      context.table.table_id,
      item.record_id,
      fields,
    );
  }
  return { ...row, ...state };
}

export function missingJobFields(fieldNames) {
  const available = new Set(fieldNames);
  return JOB_FIELD_DEFINITIONS
    .map((definition) => definition.field_name)
    .filter((name) => !available.has(name));
}
