import {
  api,
  findTable,
  listFields,
  loadLocalEnv,
  tenantToken,
} from "./collect-to-feishu.mjs";

const FIELD_DEFINITIONS = [
  {
    field_name: "爆款",
    type: 3,
    property: {
      options: [
        { name: "⚪ 普通款" },
        { name: "🟡 潜力款" },
        { name: "🟠 高粉爆款" },
        { name: "🔴 低粉爆款" },
      ],
    },
  },
  {
    field_name: "分类",
    type: 3,
    property: { options: [{ name: "带货" }] },
  },
  {
    field_name: "对标参考",
    type: 2,
    ui_type: "Rating",
    property: {
      formatter: "0",
      min: 0,
      max: 5,
      rating: { symbol: "thumbsup" },
    },
  },
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
