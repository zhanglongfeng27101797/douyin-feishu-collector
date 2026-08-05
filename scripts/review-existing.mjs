import {
  api,
  findTable,
  listFields,
  loadLocalEnv,
  mapRecord,
  tenantToken,
} from "../src/collect-to-feishu.mjs";
import { proofreadTranscript } from "../src/review-transcript.mjs";

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
const recordsUrl =
  `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}` +
  `/tables/${table.table_id}/records`;
const data = await api(`${recordsUrl}?page_size=500`, { token });
const titleFragment = process.argv.slice(2).join(" ") || "产后伤口护理";
const row = (data.items || []).find((item) =>
  String(item.fields?.["标题"] || "").includes(titleFragment),
);
if (!row) throw new Error(`未找到标题包含“${titleFragment}”的记录`);
const transcript = String(row.fields?.["视频逐字稿"] || "").trim();
if (!transcript) throw new Error("目标记录没有逐字稿");

const proofread = await proofreadTranscript(transcript, {
  title: String(row.fields["标题"] || ""),
  description: String(row.fields["正文"] || ""),
  hashtags: Array.isArray(row.fields["话题标签"])
    ? row.fields["话题标签"].join("、")
    : String(row.fields["话题标签"] || ""),
});
const source = `${String(row.fields["转写来源"] || "")}；保守错字复核 ${proofread.models}`
  .replace(/^；/, "");
await api(`${recordsUrl}/${row.record_id}`, {
  token,
  method: "PUT",
  body: {
    fields: mapRecord(
      {
        "视频逐字稿": proofread.text,
        "逐字稿字数": [...proofread.text].length,
        "转写来源": source,
        "转写状态": proofread.unresolved.length
          ? "成功（需人工复核）"
          : "成功（保守错字复核）",
        "转写错误原因": proofread.unresolved
          .map((item) => `“${item.original}”疑似为“${item.suggestion}”`)
          .join("；"),
      },
      fields,
    ),
  },
});
console.log(
  `[复核成功] 自动修正 ${proofread.changes.length} 处，待人工复核 ${proofread.unresolved.length} 处`,
);
console.log(`[逐字稿] ${proofread.text}`);
