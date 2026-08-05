import {
  api,
  findTable,
  listFields,
  loadLocalEnv,
  tenantToken,
} from "./collect-to-feishu.mjs";

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
  const existing = fields.find((field) => field.field_name === "封面");
  if (existing) {
    if (existing.type !== 17) throw new Error("“封面”已存在，但不是附件字段");
    console.log(JSON.stringify({ status: "exists", field: "封面" }));
    return;
  }
  const created = await api(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${table.table_id}/fields`,
    { token, method: "POST", body: { field_name: "封面", type: 17 } },
  );
  console.log(JSON.stringify({ status: "created", field: created.field }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
