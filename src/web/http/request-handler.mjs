import { readJson, sendJson } from "./response.mjs";

export function createRequestHandler({
  host,
  service,
  settingsService,
  serveStatic,
  logger = console,
}) {
  const routes = new Map([
    ["POST /api/records/list", async () => ({ status: 200, data: await service.list() })],
    [
      "POST /api/records/get",
      async (request) => {
        const body = await readJson(request);
        return { status: 200, data: await service.get(body.recordId) };
      },
    ],
    [
      "POST /api/records/create",
      async (request) => {
        const body = await readJson(request);
        return { status: 201, data: await service.create(body.input) };
      },
    ],
    [
      "POST /api/records/retry",
      async (request) => {
        const body = await readJson(request);
        return { status: 200, data: await service.retry(body.recordId) };
      },
    ],
    [
      "POST /api/settings/get",
      async () => ({ status: 200, data: await settingsService.read() }),
    ],
    [
      "POST /api/settings/save",
      async (request) => ({
        status: 200,
        data: await settingsService.save(await readJson(request)),
      }),
    ],
    [
      "POST /api/settings/setup",
      async (request) => ({
        status: 200,
        data: await settingsService.setup(await readJson(request)),
      }),
    ],
  ]);

  return async function handleRequest(request, response) {
    const url = new URL(request.url || "/", `http://${request.headers.host || host}`);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, service: "douyin-feishu-dashboard" });
        return;
      }
      const route = routes.get(`${request.method} ${url.pathname}`);
      if (route) {
        const result = await route(request);
        sendJson(response, result.status, { ok: true, data: result.data });
        return;
      }
      if (request.method === "GET" && (await serveStatic(url.pathname, response))) return;
      sendJson(response, 404, { ok: false, error: "页面或接口不存在" });
    } catch (error) {
      logger.error?.(`[Web] ${error.message}`);
      sendJson(response, 400, { ok: false, error: error.message });
    }
  };
}
