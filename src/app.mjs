import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./config/env.mjs";
import { runWatcher } from "./watch-feishu.mjs";
import { startWebServer } from "./web/server.mjs";

export async function runApp() {
  loadLocalEnv();
  const { server, url } = await startWebServer();
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(`请在浏览器打开 ${url}`);
  await runWatcher();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runApp().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
