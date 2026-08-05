const API_ROOT = "https://open.feishu.cn/open-apis";

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
    throw new Error(
      `飞书接口失败 HTTP ${response.status}: ${payload.msg || JSON.stringify(payload)}`,
    );
  }
  return payload.data;
}

export async function tenantToken(appId, appSecret) {
  const response = await fetch(`${API_ROOT}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const payload = await response.json();
  if (!response.ok || payload.code) {
    throw new Error(`获取飞书凭证失败: ${payload.msg || response.status}`);
  }
  return payload.tenant_access_token;
}

export async function findTable(token, appToken, tableName) {
  const data = await api(`${API_ROOT}/bitable/v1/apps/${appToken}/tables?page_size=100`, {
    token,
  });
  const table = (data.items || []).find((item) => item.name === tableName);
  if (!table) {
    const available = (data.items || []).map((item) => item.name).join("、");
    throw new Error(`未找到数据表“${tableName}”，当前表: ${available}`);
  }
  return table;
}

export async function listFields(token, appToken, tableId) {
  const data = await api(
    `${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`,
    { token },
  );
  return data.items || [];
}

export async function listAllRecords(token, appToken, tableId) {
  const records = [];
  let pageToken = "";
  do {
    const url = new URL(
      `${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    );
    url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const data = await api(url.toString(), { token });
    records.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token || "" : "";
  } while (pageToken);
  return records;
}

export function updateRecord(token, appToken, tableId, recordId, fields) {
  return api(
    `${API_ROOT}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    { token, method: "PUT", body: { fields } },
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
