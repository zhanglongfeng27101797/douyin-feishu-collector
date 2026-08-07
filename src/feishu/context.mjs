import { getFeishuConfig, loadLocalEnv } from "../config/env.mjs";
import { findTable, listFields, tenantToken } from "./client.mjs";

export async function createFeishuContext() {
  loadLocalEnv();
  const { appId, appSecret, appToken, tableName } = getFeishuConfig();
  const token = await tenantToken(appId, appSecret);
  const table = await findTable(token, appToken, tableName);
  const fields = await listFields(token, appToken, table.table_id);
  return {
    token,
    appToken,
    table,
    fields,
    fieldNames: fields.map((field) => field.field_name),
  };
}
