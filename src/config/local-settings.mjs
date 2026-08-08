import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { loadLocalEnv } from "./env.mjs";

const SETTINGS = Object.freeze({
  feishuAppId: { env: "FEISHU_APP_ID", fallback: "", maxLength: 128 },
  feishuAppSecret: { env: "FEISHU_APP_SECRET", secret: true, maxLength: 512 },
  feishuAppToken: { env: "FEISHU_APP_TOKEN", fallback: "", maxLength: 256 },
  feishuBaseName: { env: "FEISHU_BASE_NAME", fallback: "抖音内容采集库", maxLength: 100 },
  feishuTableName: { env: "FEISHU_TABLE_NAME", fallback: "采集库", maxLength: 100 },
  aiProvider: {
    env: "AI_PROVIDER",
    fallback: "auto",
    options: ["auto", "openrouter", "dashscope"],
  },
  openrouterApiKey: { env: "OPENROUTER_API_KEY", secret: true, maxLength: 512 },
  openrouterAsrModel: {
    env: "OPENROUTER_ASR_MODEL",
    fallback: "openai/whisper-large-v3-turbo",
    maxLength: 160,
  },
  openrouterAnalysisModel: {
    env: "OPENROUTER_ANALYSIS_MODEL",
    fallback: "qwen/qwen3.7-flash",
    maxLength: 160,
  },
  videoStorageMode: {
    env: "VIDEO_STORAGE_MODE",
    fallback: "none",
    options: ["none", "feishu_compressed", "feishu"],
  },
  concurrency: { env: "FEISHU_RECORD_CONCURRENCY", fallback: "2", integer: [1, 5] },
});

function activeEnvFile(filePath) {
  return resolve(filePath || process.env.ENV_FILE || ".env.local");
}

async function readEnvValues(filePath) {
  try {
    const source = await readFile(filePath, "utf8");
    return new Map(
      source
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter(Boolean)
        .map((match) => [match[1], match[2].trim()]),
    );
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
}

function validateValue(key, value, definition) {
  const normalized = String(value ?? "").trim();
  if (normalized.includes("\n") || normalized.includes("\r")) {
    throw new Error(`${key} 不能包含换行符`);
  }
  if (definition.maxLength && normalized.length > definition.maxLength) {
    throw new Error(`${key} 内容过长`);
  }
  if (definition.options && !definition.options.includes(normalized)) {
    throw new Error(`${key} 的选项无效`);
  }
  if (definition.integer) {
    const number = Number(normalized);
    const [minimum, maximum] = definition.integer;
    if (!Number.isInteger(number) || number < minimum || number > maximum) {
      throw new Error(`${key} 需要是 ${minimum}～${maximum} 的整数`);
    }
  }
  if (["feishuBaseName", "feishuTableName"].includes(key) && /[\\/?*:[\]]/.test(normalized)) {
    throw new Error(`${key} 不能包含 \\ / ? * : [ ]`);
  }
  return normalized;
}

async function updateEnvFile(filePath, updates) {
  let source = "";
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const remaining = new Map(updates);
  const lines = source.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match || !remaining.has(match[1])) return line;
    const value = remaining.get(match[1]);
    remaining.delete(match[1]);
    return `${match[1]}=${value}`;
  });
  if (lines.length === 1 && lines[0] === "") lines.length = 0;
  if (lines.length && lines.at(-1) !== "") lines.push("");
  for (const [name, value] of remaining) lines.push(`${name}=${value}`);
  lines.push("");

  await mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, lines.join("\n"), { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, filePath);
}

export async function readLocalSettings({ filePath } = {}) {
  if (!filePath) loadLocalEnv();
  const resolvedFile = activeEnvFile(filePath);
  const fileValues = await readEnvValues(resolvedFile);
  const values = {};
  const secrets = {};
  for (const [key, definition] of Object.entries(SETTINGS)) {
    const value = process.env[definition.env] ?? fileValues.get(definition.env) ?? definition.fallback ?? "";
    if (definition.secret) secrets[key] = Boolean(String(value).trim());
    else values[key] = String(value);
  }
  return {
    values,
    secrets,
    source: basename(resolvedFile),
    requiresWatcherRestart: true,
  };
}

export async function saveLocalSettings(input, { filePath } = {}) {
  const resolvedFile = activeEnvFile(filePath);
  const updates = new Map();
  for (const [key, definition] of Object.entries(SETTINGS)) {
    if (!(key in input)) continue;
    const value = validateValue(key, input[key], definition);
    if (definition.secret && !value) continue;
    updates.set(definition.env, value);
  }
  if (!updates.has("FEISHU_APP_ID") || !updates.get("FEISHU_APP_ID")) {
    const existing = process.env.FEISHU_APP_ID || (await readEnvValues(resolvedFile)).get("FEISHU_APP_ID");
    if (!existing) throw new Error("请填写飞书 App ID");
  }
  await updateEnvFile(resolvedFile, updates);
  for (const [name, value] of updates) process.env[name] = value;
  return readLocalSettings({ filePath: resolvedFile });
}

export async function saveGeneratedFeishuConfig(
  { appToken, tableName },
  { filePath } = {},
) {
  const resolvedFile = activeEnvFile(filePath);
  const updates = new Map([
    ["FEISHU_APP_TOKEN", appToken],
    ["FEISHU_TABLE_NAME", tableName],
  ]);
  await updateEnvFile(resolvedFile, updates);
  for (const [name, value] of updates) process.env[name] = value;
}
