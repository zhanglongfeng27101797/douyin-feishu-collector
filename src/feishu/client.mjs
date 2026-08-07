import { httpRequest } from "../core/http.mjs";

const API_ROOT = "https://open.feishu.cn/open-apis";

export async function api(url, { token, method = "GET", body } = {}) {
  const response = await httpRequest(url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json; charset=utf-8" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code) {
    throw new Error(
      `飞书接口失败 HTTP ${response.status}: ${payload.msg || JSON.stringify(payload)}`,
    );
  }
  return payload.data;
}

export async function tenantToken(appId, appSecret) {
  const response = await httpRequest(
    `${API_ROOT}/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
    { maxRetries: 2 },
  );
  const payload = await response.json();
  if (!response.ok || payload.code) {
    throw new Error(`获取飞书凭证失败: ${payload.msg || response.status}`);
  }
  return payload.tenant_access_token;
}

export async function createBitable(token, { name, folderToken = "" }) {
  const data = await api(`${API_ROOT}/bitable/v1/apps`, {
    token,
    method: "POST",
    body: {
      name,
      time_zone: "Asia/Shanghai",
      ...(folderToken ? { folder_token: folderToken } : {}),
    },
  });
  return data.app;
}

export async function listTables(token, appToken) {
  const data = await api(
    `${API_ROOT}/bitable/v1/apps/${appToken}/tables?page_size=100`,
    { token },
  );
  return data.items || [];
}

export async function findTable(token, appToken, tableName) {
  const tables = await listTables(token, appToken);
  const table = tables.find((item) => item.name === tableName);
  if (!table) {
    const available = tables.map((item) => item.name).join("、");
    throw new Error(`未找到数据表“${tableName}”，当前表: ${available}`);
  }
  return table;
}

export async function createTable(token, appToken, name) {
  return api(`${API_ROOT}/bitable/v1/apps/${appToken}/tables`, {
    token,
    method: "POST",
    body: { table: { name } },
  });
}

export function renameTable(token, appToken, tableId, name) {
  return api(`${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}`, {
    token,
    method: "PATCH",
    body: { name },
  });
}

export async function listFields(token, appToken, tableId) {
  const data = await api(
    `${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`,
    { token },
  );
  return data.items || [];
}

export function createField(token, appToken, tableId, definition) {
  return api(
    `${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    { token, method: "POST", body: definition },
  );
}

export function updateField(token, appToken, tableId, fieldId, definition) {
  return api(
    `${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${fieldId}`,
    { token, method: "PUT", body: definition },
  );
}

export async function listAllRecords(
  token,
  appToken,
  tableId,
  { fieldNames = [] } = {},
) {
  const records = [];
  let pageToken = "";
  do {
    const url = new URL(
      `${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    );
    url.searchParams.set("page_size", "500");
    if (fieldNames.length > 0) {
      url.searchParams.set("field_names", JSON.stringify(fieldNames));
    }
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const data = await api(url.toString(), { token });
    records.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token || "" : "";
  } while (pageToken);
  return records;
}

export async function getRecord(token, appToken, tableId, recordId) {
  const data = await api(
    `${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    { token },
  );
  return data.record;
}

export function updateRecord(token, appToken, tableId, recordId, fields) {
  return api(
    `${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    { token, method: "PUT", body: { fields } },
  );
}

export function createRecord(token, appToken, tableId, fields) {
  return api(
    `${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    { token, method: "POST", body: { fields } },
  );
}

export async function findExistingRecord(token, appToken, tableId, awemeId) {
  const url = new URL(
    `${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
  );
  url.searchParams.set("page_size", "1");
  url.searchParams.set("filter", `CurrentValue.[作品ID] = "${awemeId}"`);
  url.searchParams.set("field_names", JSON.stringify(["作品ID"]));
  const data = await api(url.toString(), { token });
  return (data.items || [])[0] || null;
}
