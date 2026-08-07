import fs from "node:fs";
import { CollectorError } from "../core/errors.mjs";

export function loadEnvFile(path, { override = false } = {}) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && (override || !process.env[match[1]])) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

export function loadLocalEnv() {
  const path = process.env.ENV_FILE || ".env.local";
  if (path !== ".env.local") loadEnvFile(".env.local");
  loadEnvFile(path, { override: path !== ".env.local" });
}

export function getFeishuConfig() {
  const config = {
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    appToken: process.env.FEISHU_APP_TOKEN,
    tableName: process.env.FEISHU_TABLE_NAME || "采集库",
  };
  if (!config.appId || !config.appSecret || !config.appToken) {
    throw new CollectorError(
      "缺少 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_APP_TOKEN",
      { code: "missing_feishu_config", retryable: false },
    );
  }
  return config;
}

function integerSetting(
  name,
  fallback,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
) {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function enumSetting(name, fallback, allowed) {
  const value = String(process.env[name] || fallback).trim().toLowerCase();
  if (!allowed.includes(value)) {
    throw new CollectorError(
      `${name}=${value} 无效，可选值：${allowed.join("、")}`,
      { code: "invalid_runtime_config", retryable: false },
    );
  }
  return value;
}

export function getHttpSettings() {
  return {
    timeoutMs: integerSetting("HTTP_TIMEOUT_MS", 30_000, {
      min: 1_000,
      max: 10 * 60_000,
    }),
    maxRetries: integerSetting("HTTP_MAX_RETRIES", 2, { max: 5 }),
    retryBaseMs: integerSetting("HTTP_RETRY_BASE_MS", 500, {
      min: 50,
      max: 60_000,
    }),
    retryMaxMs: integerSetting("HTTP_RETRY_MAX_MS", 30_000, {
      min: 50,
      max: 10 * 60_000,
    }),
    aiTimeoutMs: integerSetting("AI_HTTP_TIMEOUT_MS", 3 * 60_000, {
      min: 1_000,
      max: 10 * 60_000,
    }),
    mediaTimeoutMs: integerSetting("MEDIA_HTTP_TIMEOUT_MS", 10 * 60_000, {
      min: 1_000,
      max: 60 * 60_000,
    }),
  };
}

export function getPipelineSettings() {
  const retryBaseSeconds = integerSetting("PIPELINE_RETRY_BASE_SECONDS", 60, {
    min: 1,
    max: 24 * 60 * 60,
  });
  return {
    leaseSeconds: integerSetting("PIPELINE_LEASE_SECONDS", 15 * 60, {
      min: 60,
      max: 24 * 60 * 60,
    }),
    maxAttempts: integerSetting("PIPELINE_MAX_ATTEMPTS", 5, {
      min: 1,
      max: 20,
    }),
    retryBaseSeconds,
    retryMaxSeconds: Math.max(
      retryBaseSeconds,
      integerSetting("PIPELINE_RETRY_MAX_SECONDS", 60 * 60, {
        min: 1,
        max: 7 * 24 * 60 * 60,
      }),
    ),
  };
}

export function getWatcherSettings() {
  return {
    concurrency: integerSetting("FEISHU_RECORD_CONCURRENCY", 2, {
      min: 1,
      max: 5,
    }),
  };
}

export function getMediaSettings() {
  return {
    videoStorageMode: enumSetting("VIDEO_STORAGE_MODE", "none", [
      "none",
      "feishu",
      "feishu_compressed",
    ]),
    archiveMaxWidth: integerSetting("VIDEO_ARCHIVE_MAX_WIDTH", 720, {
      min: 360,
      max: 2160,
    }),
    archiveCrf: integerSetting("VIDEO_ARCHIVE_CRF", 28, {
      min: 18,
      max: 40,
    }),
  };
}

export function getAsrSettings() {
  return {
    mode: enumSetting("ASR_MODE", "fallback", [
      "primary",
      "fallback",
      "compare",
    ]),
  };
}

export function isTextProofreadEnabled() {
  return process.env.ENABLE_TEXT_PROOFREAD === "true";
}
