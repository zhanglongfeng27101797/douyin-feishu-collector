import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parseDouyinShare } from "./parse-douyin.mjs";

function loadEnvFile(path, { override = false } = {}) {
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
  // 第二个企业只覆盖飞书相关配置，语音服务密钥继续复用主配置。
  if (path !== ".env.local") loadEnvFile(".env.local");
  loadEnvFile(path, { override: path !== ".env.local" });
}

export async function api(url, { token, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json; charset=utf-8" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code) {
    throw new Error(`飞书接口失败 HTTP ${response.status}: ${payload.msg || JSON.stringify(payload)}`);
  }
  return payload.data;
}

export async function tenantToken(appId, appSecret) {
  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
  );
  const payload = await response.json();
  if (!response.ok || payload.code) {
    throw new Error(`获取飞书凭证失败: ${payload.msg || response.status}`);
  }
  return payload.tenant_access_token;
}

export async function findTable(token, appToken, tableName) {
  const data = await api(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables?page_size=100`,
    { token },
  );
  const table = (data.items || []).find((item) => item.name === tableName);
  if (!table) {
    throw new Error(`未找到数据表“${tableName}”，当前表: ${(data.items || []).map((x) => x.name).join("、")}`);
  }
  return table;
}

export async function listFields(token, appToken, tableId) {
  const data = await api(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`,
    { token },
  );
  return data.items || [];
}

function adaptValue(value, field) {
  if (value == null || value === "") return undefined;
  if (field.type === 4) return Array.isArray(value) ? value : [String(value)];
  if (field.type === 17) return Array.isArray(value) ? value : [value];
  if (field.type === 5) return new Date(value).getTime();
  if (field.type === 15) return { link: String(value), text: String(value) };
  if (field.type === 2) return Number(value);
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

export function mapRecord(record, fields) {
  const byName = new Map(fields.map((field) => [field.field_name, field]));
  const mapped = {};
  for (const [name, value] of Object.entries(record)) {
    const field = byName.get(name);
    if (!field) continue;
    const adapted = adaptValue(value, field);
    if (adapted !== undefined) mapped[name] = adapted;
  }
  return mapped;
}

async function findExistingRecord(token, appToken, tableId, awemeId) {
  const filter = `CurrentValue.[作品ID] = "${awemeId}"`;
  const url = new URL(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
  );
  url.searchParams.set("page_size", "1");
  url.searchParams.set("filter", filter);
  url.searchParams.set("field_names", JSON.stringify(["作品ID"]));
  const data = await api(url.toString(), { token });
  return (data.items || [])[0] || null;
}

async function main() {
  loadLocalEnv();
  const input = process.argv.slice(2).join(" ").trim();
  if (!input) throw new Error("请提供抖音分享文案或链接");

  const record = await parseDouyinShare(input);
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_APP_TOKEN || "ZE6HbfAUramYWbs0WWBcW94qn5f";
  const tableName = process.env.FEISHU_TABLE_NAME || "采集库";
  if (!appId || !appSecret) {
    throw new Error("缺少 FEISHU_APP_ID / FEISHU_APP_SECRET，请配置 .env.local");
  }

  const token = await tenantToken(appId, appSecret);
  const table = await findTable(token, appToken, tableName);
  const fields = await listFields(token, appToken, table.table_id);
  const mappedFields = mapRecord(record, fields);
  const existing = await findExistingRecord(
    token,
    appToken,
    table.table_id,
    record["作品ID"],
  );
  if (existing) {
    const data = await api(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${table.table_id}/records/${existing.record_id}`,
      { token, method: "PUT", body: { fields: mappedFields } },
    );
    console.log(JSON.stringify({
      status: "updated",
      tableId: table.table_id,
      recordId: existing.record_id,
      record: data.record,
    }, null, 2));
    return;
  }

  const data = await api(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${table.table_id}/records`,
    { token, method: "POST", body: { fields: mappedFields } },
  );
  console.log(JSON.stringify({ status: "created", tableId: table.table_id, record: data.record }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
