import { parseDouyinShare } from "./parse-douyin.mjs";
import {
  api,
  findTable,
  listFields,
  loadLocalEnv,
  mapRecord,
  tenantToken,
} from "./collect-to-feishu.mjs";

function getLink(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return String(value.link || "").trim();
  return "";
}

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
  const records = await api(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${table.table_id}/records?page_size=500`,
    { token },
  );

  let updated = 0;
  for (const item of records.items || []) {
    const row = item.fields || {};
    const source =
      getLink(row["抖音分享内容（粘贴这里）"]) ||
      getLink(row["标准链接"]) ||
      getLink(row["原始链接"]);
    if (!source || !row["作品ID"]) continue;
    try {
      const metadata = await parseDouyinShare(source);
      await api(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${table.table_id}/records/${item.record_id}`,
        { token, method: "PUT", body: { fields: mapRecord(metadata, fields) } },
      );
      updated += 1;
      console.log(
        `[元数据补齐] ${metadata["作品ID"]}：${metadata["话题标签"].length} 个话题`,
      );
    } catch (error) {
      console.error(`[元数据补齐失败] ${row["作品ID"]}: ${error.message}`);
    }
  }
  console.log(`[完成] 共更新 ${updated} 条记录`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
