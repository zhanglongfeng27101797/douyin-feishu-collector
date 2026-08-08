import { createField, updateField } from "./client.mjs";
import { createFeishuContext } from "./context.mjs";

const FIELD_WRITE_INTERVAL_MS = 120;

export async function ensureTableFields(
  definitions,
  { renameOnlyFieldTo = "" } = {},
) {
  const context = await createFeishuContext();
  return ensureFieldsInContext(context, definitions, { renameOnlyFieldTo });
}

export async function ensureFieldsInContext(
  { token, appToken, table, fields },
  definitions,
  { renameOnlyFieldTo = "" } = {},
) {
  if (
    renameOnlyFieldTo &&
    fields.length === 1 &&
    !fields.some((field) => field.field_name === renameOnlyFieldTo)
  ) {
    const current = fields[0];
    const data = await updateField(
      token,
      appToken,
      table.table_id,
      current.field_id,
      { field_name: renameOnlyFieldTo, type: current.type },
    );
    current.field_name = data.field.field_name;
    console.log(`[已重命名] ${renameOnlyFieldTo}`);
  }

  for (const definition of definitions) {
    const existing = fields.find(
      (field) => field.field_name === definition.field_name,
    );
    if (existing) {
      if (existing.type !== definition.type) {
        throw new Error(
          `“${definition.field_name}”字段类型错误：需要 ${definition.type}，当前 ${existing.type}`,
        );
      }
      console.log(`[已存在] ${definition.field_name}`);
      continue;
    }

    const data = await createField(token, appToken, table.table_id, definition);
    console.log(`[已创建] ${data.field.field_name} (${data.field.ui_type})`);
    await new Promise((resolve) => setTimeout(resolve, FIELD_WRITE_INTERVAL_MS));
  }
}
