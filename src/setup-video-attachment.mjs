import {
  api,
  findTable,
  listFields,
  loadLocalEnv,
  tenantToken,
} from "./collect-to-feishu.mjs";

async function main() {
  loadLocalEnv();
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_APP_TOKEN;
  const tableName = process.env.FEISHU_TABLE_NAME || "采集库";
  if (!appId || !appSecret || !appToken) throw new Error("缺少飞书本机配置");

  const token = await tenantToken(appId, appSecret);
  const table = await findTable(token, appToken, tableName);
  const fields = await listFields(token, appToken, table.table_id);
  const existing = fields.find((field) => field.field_name === "视频附件");
  if (existing) {
    if (existing.type !== 17) {
      throw new Error(`“视频附件”已存在，但不是附件字段（当前类型 ${existing.type}）`);
    }
    console.log(JSON.stringify({ status: "exists", table: table.name, field: "视频附件" }));
    return;
  }

  const created = await api(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${table.table_id}/fields`,
    {
      token,
      method: "POST",
      body: { field_name: "视频附件", type: 17 },
    },
  );
  console.log(
    JSON.stringify({ status: "created", table: table.name, field: created.field }, null, 2),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
