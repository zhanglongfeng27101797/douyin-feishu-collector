import { HOOK_TYPES } from "./analyze-transcript.mjs";
import {
  api,
  findTable,
  listFields,
  loadLocalEnv,
  tenantToken,
} from "./collect-to-feishu.mjs";

const FIELD_DEFINITIONS = [
  { field_name: "开头钩子", type: 1 },
  {
    field_name: "钩子类型",
    type: 4,
    property: { options: HOOK_TYPES.map((name) => ({ name })) },
  },
  { field_name: "主题", type: 1 },
  { field_name: "核心知识点", type: 1 },
];

async function main() {
  loadLocalEnv();
  const token = await tenantToken(
    process.env.FEISHU_APP_ID,
    process.env.FEISHU_APP_SECRET,
  );
  const appToken = process.env.FEISHU_APP_TOKEN;
  const table = await findTable(
    token,
    appToken,
    process.env.FEISHU_TABLE_NAME || "采集库",
  );
  const fields = await listFields(token, appToken, table.table_id);

  for (const definition of FIELD_DEFINITIONS) {
    const existing = fields.find(
      (field) => field.field_name === definition.field_name,
    );
    if (existing) {
      if (existing.type !== definition.type) {
        throw new Error(
          `“${definition.field_name}”已存在，但字段类型不符合要求`,
        );
      }
      console.log(`[已存在] ${definition.field_name}`);
      continue;
    }
    const data = await api(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${table.table_id}/fields`,
      { token, method: "POST", body: definition },
    );
    console.log(`[已创建] ${data.field.field_name} (${data.field.ui_type})`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
