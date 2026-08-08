import { getHttpSettings } from "../config/env.mjs";
import { CollectorError } from "./errors.mjs";

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requestName(url, method) {
  try {
    return `${method} ${new URL(url).hostname}`;
  } catch {
    return method;
  }
}

function retryAfterMs(response) {
  const value = response.headers.get("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = new Date(value).getTime();
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function backoffMs(attempt, baseMs, random) {
  const jitter = 0.8 + Math.max(0, Math.min(1, random())) * 0.4;
  return Math.round(baseMs * 2 ** attempt * jitter);
}

export async function httpRequest(
  url,
  options = {},
  { timeoutMs, maxRetries, retryBaseMs, retryMaxMs, random = Math.random } = {},
) {
  const settings = getHttpSettings();
  const method = String(options.method || "GET").toUpperCase();
  const retries = maxRetries ?? (IDEMPOTENT_METHODS.has(method) ? settings.maxRetries : 0);
  const timeout = timeoutMs ?? settings.timeoutMs;
  const retryBase = retryBaseMs ?? settings.retryBaseMs;
  const retryCap = retryMaxMs ?? settings.retryMaxMs;
  const name = requestName(url, method);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || AbortSignal.timeout(timeout),
      });
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === retries) {
        return response;
      }
      await response.body?.cancel().catch(() => {});
      const wait = retryAfterMs(response) || backoffMs(attempt, retryBase, random);
      await delay(Math.min(retryCap, wait));
    } catch (error) {
      if (attempt < retries) {
        await delay(Math.min(retryCap, backoffMs(attempt, retryBase, random)));
        continue;
      }
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      throw new CollectorError(
        timedOut ? `${name} 请求超时` : `${name} 请求失败：${error.message}`,
        {
          code: timedOut ? "http_timeout" : "http_request_failed",
          retryable: true,
          cause: error,
        },
      );
    }
  }

  throw new CollectorError(`${name} 请求失败`, {
    code: "http_request_failed",
    retryable: true,
  });
}

export function aiHttpRequest(url, options = {}, policy = {}) {
  return httpRequest(url, options, {
    timeoutMs: getHttpSettings().aiTimeoutMs,
    ...policy,
  });
}

export function mediaHttpRequest(url, options = {}, policy = {}) {
  return httpRequest(url, options, {
    timeoutMs: getHttpSettings().mediaTimeoutMs,
    ...policy,
  });
}
