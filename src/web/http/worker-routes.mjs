import { timingSafeEqual } from "node:crypto";
import { readJson, sendJson } from "./response.mjs";

const JOB_PATH = /^\/v1\/jobs\/(rec[A-Za-z0-9]+)$/;
const RETRY_PATH = /^\/v1\/jobs\/(rec[A-Za-z0-9]+)\/retry$/;

function authorized(request, expected) {
  const header = String(request.headers.authorization || "");
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function errorPayload(code, message) {
  return { error: { code, message } };
}

export function createWorkerRouteHandler({ service, apiKey, version = "0.1.0" }) {
  const expected = String(apiKey || "").trim();

  return async function handleWorkerRoute(request, response, url) {
    if (!url.pathname.startsWith("/v1/")) return false;
    if (request.method === "GET" && url.pathname === "/v1/health") {
      sendJson(response, 200, { ok: true, service: "liuguang-worker", version });
      return true;
    }
    if (expected.length < 24) {
      sendJson(
        response,
        503,
        errorPayload("worker_not_configured", "任务节点尚未配置安全访问令牌"),
      );
      return true;
    }
    if (!authorized(request, expected)) {
      sendJson(response, 401, errorPayload("unauthorized", "访问令牌无效"));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/v1/session/verify") {
      sendJson(response, 200, service.verify());
      return true;
    }
    if (request.method === "GET" && url.pathname === "/v1/jobs") {
      sendJson(response, 200, await service.list());
      return true;
    }
    if (request.method === "POST" && url.pathname === "/v1/jobs") {
      const body = await readJson(request);
      const source = String(body.source || "").trim();
      if (!source || source.length > 5000) {
        sendJson(response, 400, errorPayload("invalid_source", "请提交有效的抖音分享内容"));
        return true;
      }
      sendJson(response, 202, await service.create(source));
      return true;
    }
    const retryMatch = request.method === "POST" && url.pathname.match(RETRY_PATH);
    if (retryMatch) {
      sendJson(response, 202, await service.retry(retryMatch[1]));
      return true;
    }
    const jobMatch = request.method === "GET" && url.pathname.match(JOB_PATH);
    if (jobMatch) {
      sendJson(response, 200, await service.get(jobMatch[1]));
      return true;
    }
    sendJson(response, 404, errorPayload("not_found", "任务接口不存在"));
    return true;
  };
}
