import { analyzeTranscript } from "../analyze-transcript.mjs";
import { updateRecord } from "../feishu/client.mjs";
import { mapRecord } from "../feishu/fields.mjs";

export const ANALYSIS_FIELDS = ["开头钩子", "钩子类型", "主题", "核心知识点"];

export function hasAnalysisSchema(fieldNames) {
  return ANALYSIS_FIELDS.every((name) => fieldNames.includes(name));
}

export function needsContentAnalysis(row, fieldNames) {
  return (
    hasAnalysisSchema(fieldNames) &&
    row["视频逐字稿"] &&
    ANALYSIS_FIELDS.some((name) => !row[name])
  );
}

export async function analyzeContent({ context, item, row, retryAfter }) {
  if (
    !needsContentAnalysis(row, context.fieldNames) ||
    Date.now() < (retryAfter.get(item.record_id) || 0)
  ) {
    return row;
  }

  const { token, appToken, table, fields } = context;
  try {
    const analysis = await analyzeTranscript(String(row["视频逐字稿"]), {
      title: String(row["标题"] || ""),
      description: String(row["正文"] || ""),
      hashtags: Array.isArray(row["话题标签"])
        ? row["话题标签"].join("、")
        : String(row["话题标签"] || ""),
    });
    const { model, ...analysisFields } = analysis;
    await updateRecord(
      token,
      appToken,
      table.table_id,
      item.record_id,
      mapRecord(analysisFields, fields),
    );
    retryAfter.delete(item.record_id);
    console.log(`[内容分析完成] ${row["作品ID"] || item.record_id}，模型 ${model}`);
    return { ...row, ...analysisFields };
  } catch (error) {
    retryAfter.set(item.record_id, Date.now() + 10 * 60 * 1000);
    console.error(
      `[内容分析失败，10分钟后重试] ${row["作品ID"] || item.record_id}: ${error.message}`,
    );
    return row;
  }
}
