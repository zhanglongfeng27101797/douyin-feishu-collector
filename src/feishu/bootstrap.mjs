import {
  createBitable,
  createTable,
  listFields,
  listTables,
  renameTable,
  tenantToken,
} from "./client.mjs";
import { COLLECTION_FIELD_DEFINITIONS, INPUT_FIELD_NAME } from "./schema.mjs";
import { ensureFieldsInContext } from "./setup.mjs";

export async function provisionFeishuTable(
  {
    appId,
    appSecret,
    appToken = "",
    baseName = "抖音内容采集库",
    tableName = "采集库",
  },
  dependencies = {},
) {
  const createBase = dependencies.createBitable || createBitable;
  const getTables = dependencies.listTables || listTables;
  const addTable = dependencies.createTable || createTable;
  const updateTableName = dependencies.renameTable || renameTable;
  const getFields = dependencies.listFields || listFields;
  const ensureFields = dependencies.ensureFieldsInContext || ensureFieldsInContext;
  const getToken = dependencies.tenantToken || tenantToken;

  const token = await getToken(appId, appSecret);
  let resolvedAppToken = appToken;
  let table;
  let baseUrl = "";
  let createdBase = false;
  let createdTable = false;

  if (!resolvedAppToken) {
    const app = await createBase(token, { name: baseName });
    resolvedAppToken = app.app_token;
    baseUrl = app.url || "";
    table = { table_id: app.default_table_id, name: tableName };
    await dependencies.onAppTokenResolved?.({
      appToken: resolvedAppToken,
      tableName,
    });
    await updateTableName(token, resolvedAppToken, table.table_id, tableName);
    createdBase = true;
  } else {
    const tables = await getTables(token, resolvedAppToken);
    table = tables.find((item) => item.name === tableName);
    if (!table) {
      const data = await addTable(token, resolvedAppToken, tableName);
      table = { table_id: data.table_id, name: tableName };
      createdTable = true;
    }
  }

  const fields = await getFields(token, resolvedAppToken, table.table_id);
  await ensureFields(
    { token, appToken: resolvedAppToken, table, fields },
    COLLECTION_FIELD_DEFINITIONS,
    { renameOnlyFieldTo: INPUT_FIELD_NAME },
  );

  return {
    appToken: resolvedAppToken,
    tableId: table.table_id,
    tableName,
    baseUrl,
    createdBase,
    createdTable,
  };
}
