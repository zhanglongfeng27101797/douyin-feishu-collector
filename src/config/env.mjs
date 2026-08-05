import fs from "node:fs";

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
    throw new Error("缺少 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_APP_TOKEN");
  }
  return config;
}
