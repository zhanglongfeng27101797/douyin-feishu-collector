import {
  api,
  findTable,
  listFields,
  loadLocalEnv,
  mapRecord,
  tenantToken,
} from "../src/collect-to-feishu.mjs";

loadLocalEnv();
const { transcribeVideo } = await import("../src/transcribe-media.mjs");
const { proofreadTranscript } = await import("../src/review-transcript.mjs");

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

const rawVideoUrl = row.fields?.["视频链接"];
const videoUrl =
  typeof rawVideoUrl === "string" ? rawVideoUrl : rawVideoUrl?.link;
if (!videoUrl) throw new Error("目标记录缺少视频链接");

console.log(`[测试] 已提交百炼：${String(row.fields["标题"]).slice(0, 40)}`);
const result = await transcribeVideo(videoUrl, {
  prompt: String(row.fields["标题"] || ""),
});
const asrCandidates = Array.isArray(result.__asrCandidates)
  ? result.__asrCandidates
  : [];
delete result.__asrCandidates;
if (asrCandidates.length >= 2) {
  const proofread = await proofreadTranscript(result["视频逐字稿"], {
    title: String(row.fields["标题"] || ""),
    description: String(row.fields["正文"] || ""),
    hashtags: Array.isArray(row.fields["话题标签"])
      ? row.fields["话题标签"].join("、")
      : String(row.fields["话题标签"] || ""),
    referenceTranscript: asrCandidates[1].text,
  });
  result["视频逐字稿"] = proofread.text;
  result["逐字稿字数"] = [...proofread.text].length;
  result["转写来源"] += `；证据校对 ${proofread.models}`;
  result["转写状态"] = proofread.unresolved.length
    ? "成功（需人工复核）"
    : "成功（双 ASR 校对）";
  result["转写错误原因"] = proofread.unresolved
    .map((item) => `“${item.original}”疑似为“${item.suggestion}”`)
    .join("；");
}
await api(`${recordsUrl}/${row.record_id}`, {
  token,
  method: "PUT",
  body: {
    fields: mapRecord({ ...result, "采集状态": "成功" }, fields),
  },
});
console.log(`[测试成功] 来源：${result["转写来源"]}`);
console.log(`[测试成功] 字数：${result["逐字稿字数"]}`);
console.log(`[逐字稿] ${result["视频逐字稿"]}`);
