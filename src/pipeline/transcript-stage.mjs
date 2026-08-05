import { updateRecord } from "../feishu/client.mjs";
import { fieldsSubset, getLinkValue, mapRecord } from "../feishu/fields.mjs";
import { proofreadTranscript } from "../review-transcript.mjs";
import { transcribeVideo } from "../transcribe-media.mjs";
import { getVideoCandidates } from "../media/candidates.mjs";

function hashtags(row) {
  return Array.isArray(row["话题标签"])
    ? row["话题标签"].join("、")
    : String(row["话题标签"] || "");
}

function proofreadContext(row, referenceTranscript = "") {
  return {
    title: String(row["标题"] || ""),
    description: String(row["正文"] || ""),
    hashtags: hashtags(row),
    referenceTranscript,
  };
}

function unresolvedText(items) {
  return items
    .map((item) => `“${item.original}”疑似为“${item.suggestion}”`)
    .join("；");
}

function transcriptionPrompt(row) {
  return [row["标题"], row["正文"], hashtags(row)]
    .filter(Boolean)
    .join("。")
    .slice(0, 500);
}

export async function transcribeMissing({ context, item, row }) {
  if (row["视频逐字稿"]) return { row, failed: false };
  const { token, appToken, table, fields, fieldNames } = context;

  await updateRecord(
    token,
    appToken,
    table.table_id,
    item.record_id,
    fieldsSubset({ "转写状态": "转写中", "转写错误原因": "" }, fieldNames),
  );
  try {
    const transcript = await transcribeVideo(getVideoCandidates(row), {
      prompt: transcriptionPrompt(row),
    });
    const candidates = Array.isArray(transcript.__asrCandidates)
      ? transcript.__asrCandidates
      : [];
    delete transcript.__asrCandidates;
    const sourceVideoUrl = transcript.__sourceVideoUrl;
    delete transcript.__sourceVideoUrl;
    if (sourceVideoUrl) transcript["视频链接"] = sourceVideoUrl;

    if (candidates.length >= 2 || process.env.ENABLE_TEXT_PROOFREAD === "true") {
      try {
        const proofread = await proofreadTranscript(transcript["视频逐字稿"], {
          ...proofreadContext(row, candidates[1]?.text || ""),
        });
        transcript["视频逐字稿"] = proofread.text;
        transcript["逐字稿字数"] = [...proofread.text].length;
        transcript["转写来源"] += `；证据校对 ${proofread.models}`;
        transcript["转写状态"] = proofread.unresolved.length
          ? "成功（需人工复核）"
          : "成功（双 ASR 校对）";
        transcript["转写错误原因"] = unresolvedText(proofread.unresolved);
      } catch (error) {
        console.error(`[审核失败，保留原始听写] ${error.message}`);
        transcript["转写来源"] += "；证据校对失败";
        transcript["转写错误原因"] = error.message;
      }
    }

    await updateRecord(
      token,
      appToken,
      table.table_id,
      item.record_id,
      mapRecord({ ...transcript, "采集状态": "成功" }, fields),
    );
    const updated = { ...row, ...transcript, "采集状态": "成功" };
    console.log(`[成功] ${updated["作品ID"]} 已生成逐字稿`);
    return { row: updated, failed: false };
  } catch (error) {
    await updateRecord(
      token,
      appToken,
      table.table_id,
      item.record_id,
      fieldsSubset(
        {
          "采集状态": "部分成功",
          "转写状态": "失败",
          "转写错误原因": error.message,
        },
        fieldNames,
      ),
    );
    console.error(`[转写失败] ${row["作品ID"]}: ${error.message}`);
    return { row, failed: true };
  }
}

export async function proofreadExisting({ context, item, row }) {
  if (
    process.env.ENABLE_TEXT_PROOFREAD !== "true" ||
    !row["视频逐字稿"] ||
    String(row["转写来源"] || "").includes("通义双模型校对") ||
    String(row["转写来源"] || "").includes("证据校对")
  ) {
    return row;
  }

  const { token, appToken, table, fields } = context;
  try {
    const proofread = await proofreadTranscript(
      String(row["视频逐字稿"]),
      proofreadContext(row),
    );
    const source = `${String(row["转写来源"] || "")}；通义双模型校对 ${proofread.models}`
      .replace(/^；/, "");
    const updates = {
      "视频逐字稿": proofread.text,
      "逐字稿字数": [...proofread.text].length,
      "转写来源": source,
      "转写状态": proofread.unresolved.length
        ? "成功（需人工复核）"
        : "成功（双模型校对）",
      "转写错误原因": unresolvedText(proofread.unresolved),
    };
    await updateRecord(
      token,
      appToken,
      table.table_id,
      item.record_id,
      mapRecord(updates, fields),
    );
    console.log(
      `[双模型校对完成] ${row["作品ID"]}: 自动修正 ${proofread.changes.length} 处，待复核 ${proofread.unresolved.length} 处`,
    );
    return { ...row, ...updates };
  } catch (error) {
    const updates = {
      "转写来源": `${String(row["转写来源"] || "")}；通义双模型校对失败`.replace(
        /^；/,
        "",
      ),
      "转写错误原因": error.message,
    };
    await updateRecord(
      token,
      appToken,
      table.table_id,
      item.record_id,
      mapRecord(updates, fields),
    );
    console.error(`[双模型校对失败且保留原文] ${error.message}`);
    return { ...row, ...updates };
  }
}
