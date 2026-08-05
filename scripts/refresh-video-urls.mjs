import {
  api,
  findTable,
  loadLocalEnv,
  tenantToken,
} from "../src/collect-to-feishu.mjs";
import { parseDouyinShare } from "../src/parse-douyin.mjs";

loadLocalEnv();
const appToken = process.env.FEISHU_APP_TOKEN;
const token = await tenantToken(
  process.env.FEISHU_APP_ID,
  process.env.FEISHU_APP_SECRET,
);
const table = await findTable(
  token,
  appToken,
  process.env.FEISHU_TABLE_NAME || "采集库",
);
const data = await api(
  `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${table.table_id}/records?page_size=500`,
  { token },
);

for (const record of data.items || []) {
  const fieldValue = record.fields?.["标准链接"];
  const source =
    typeof fieldValue === "string"
      ? fieldValue
      : fieldValue && typeof fieldValue === "object"
        ? fieldValue.link
        : "";
  if (!source) continue;
  try {
    const parsed = await parseDouyinShare(String(source));
    await api(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${table.table_id}/records/${record.record_id}`,
      { token, method: "PUT", body: { fields: { "视频链接": parsed["视频链接"] } } },
    );
    console.log(`[已更新无水印地址] ${parsed["作品ID"]}`);
  } catch (error) {
    console.error(`[更新失败] ${source}: ${error.message}`);
  }
}
