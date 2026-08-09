import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "../config/env.mjs";
import { createDashboardService } from "./application/dashboard-service.mjs";
import { createSettingsService } from "./application/settings-service.mjs";
import { createWorkerApiService } from "./application/worker-api-service.mjs";
import { createRequestHandler } from "./http/request-handler.mjs";
import { createStaticFileHandler } from "./http/static-files.mjs";
import { createWorkerRouteHandler } from "./http/worker-routes.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(MODULE_DIR, "public");
export async function startWebServer({
  host = process.env.WEB_HOST || "127.0.0.1",
  port = Number(process.env.WEB_PORT || 3210),
  service = createDashboardService(),
  settingsService = createSettingsService({ onChange: () => service.invalidate?.() }),
  workerService = createWorkerApiService({ dashboardService: service }),
  logger = console,
} = {}) {
  if (host !== "127.0.0.1" && host !== "localhost" && process.env.WEB_ALLOW_REMOTE !== "true") {
    throw new Error("管理页面默认只允许本机访问；远程监听需显式设置 WEB_ALLOW_REMOTE=true");
  }

  const serveStatic = createStaticFileHandler(PUBLIC_DIR);
  const allowDashboardAPI = host === "127.0.0.1" || host === "localhost";
  const handleWorkerRoute = createWorkerRouteHandler({
    service: workerService,
    apiKey: process.env.WORKER_API_KEY,
  });
  const handler = createRequestHandler({
    host,
    service,
    settingsService,
    serveStatic,
    handleWorkerRoute,
    allowDashboardAPI,
    logger,
  });
  const server = createServer(handler);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" ? address.port : port;
  const url = `http://${host}:${actualPort}`;
  logger.log?.(`管理页面已启动：${url}`);
  return { server, url };
}

async function main() {
  loadLocalEnv();
  await startWebServer();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
