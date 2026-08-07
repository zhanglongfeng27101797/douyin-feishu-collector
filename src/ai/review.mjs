import { callJsonModel } from "./chat.mjs";

function normalizeIssues(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      original: String(item?.original || "").trim(),
      suggestion: String(item?.suggestion || "").trim(),
      reason: String(item?.reason || "").trim(),
    }))
    .filter((item) => item.original && item.suggestion);
}

export async function proofreadTranscript(
  transcript,
  { title = "", description = "", hashtags = "", referenceTranscript = "" } = {},
) {
  const context = `视频标题：${title}\n视频正文：${description}\n话题：${hashtags}`;
  const hasReference = Boolean(referenceTranscript.trim());
  const reviewInstruction = hasReference
    ? "你是中文短视频逐字稿查错员。第一份是主逐字稿，第二份是同一音频的独立听写证据。禁止重写全文。只找同音错词、错别字、专有名词误识别和明显错误标点。优先依据两份听写差异；对医学常识、固定词语和上下文几乎确定的明显错字，即使第二份听写也错了，也可提出最小修正。original必须是主逐字稿中连续存在的最短片段，suggestion只写最小替换文本。禁止改变句式、语序、观点、口语、语气词和表达风格，禁止润色；证据不足不要列出。返回严格JSON：{issues:[{original,suggestion,reason}]}。"
    : "你是中文短视频逐字稿查错员。禁止重写全文。只找同音错词、错别字、专有名词误识别和明显错误标点。original必须是原文中连续存在的最短片段，suggestion只写最小替换文本。禁止改变句式、语序、观点、口语、语气词和表达风格，禁止润色；证据不足不要列出。返回严格JSON：{issues:[{original,suggestion,reason}]}。";
  if (
    hasReference &&
    transcript.replace(/[\s，。！？、；：,.!?;:]/g, "") ===
      referenceTranscript.replace(/[\s，。！？、；：,.!?;:]/g, "")
  ) {
    return {
      text: transcript,
      changes: [],
      unresolved: [],
      models: "双 ASR 一致，无需模型修改",
    };
  }
  const firstPassResult = await callJsonModel({
    purpose: "review",
    messages: [
      {
        role: "system",
        content: reviewInstruction,
      },
      {
        role: "user",
        content: `${context}\n\n主逐字稿：\n${transcript}\n\n第二份独立听写：\n${referenceTranscript}`,
      },
    ],
  });
  const firstPass = firstPassResult.value;
  const candidates = normalizeIssues(firstPass.issues).filter(
    (item) =>
      transcript.includes(item.original) &&
      !item.suggestion.includes("\n") &&
      item.suggestion.length <= Math.max(item.original.length + 4, item.original.length * 2),
  );
  if (candidates.length === 0) {
    return {
      text: transcript,
      changes: [],
      unresolved: [],
      models: `${firstPassResult.provider} ${firstPassResult.model}`,
    };
  }

  const verificationResult = await callJsonModel({
    purpose: "verify",
    messages: [
      {
        role: "system",
        content:
          "你是保守的中文逐字稿复核员。逐项判断候选替换是否几乎确定正确。第二份独立听写只作为证据。只批准不改变原句表达、语序、语义和口语风格的错别字、同音字、专有名词或标点修正。没有充分依据必须拒绝，不得提出新候选。返回严格JSON：{approved:[{original,suggestion,confidence,reason}]}，confidence为0到1。",
      },
      {
        role: "user",
        content: `${context}\n\n主逐字稿：\n${transcript}\n\n第二份独立听写：\n${referenceTranscript}\n\n待复核候选：\n${JSON.stringify(candidates)}`,
      },
    ],
  });
  const verification = verificationResult.value;
  const candidateKeys = new Set(
    candidates.map((item) => `${item.original}\u0000${item.suggestion}`),
  );
  const approved = (Array.isArray(verification.approved) ? verification.approved : [])
    .map((item) => ({
      original: String(item?.original || "").trim(),
      suggestion: String(item?.suggestion || "").trim(),
      confidence: Number(item?.confidence || 0),
      reason: String(item?.reason || "").trim(),
    }))
    .filter(
      (item) =>
        item.confidence >= 0.9 &&
        candidateKeys.has(`${item.original}\u0000${item.suggestion}`),
    );
  const maxChangedCharacters = Math.max(10, Math.floor(transcript.length * 0.08));
  let text = transcript;
  let changedCharacters = 0;
  const changes = [];
  for (const item of approved) {
    const size = Math.max(item.original.length, item.suggestion.length);
    if (changedCharacters + size > maxChangedCharacters) break;
    const index = text.indexOf(item.original);
    if (index < 0) continue;
    text = text.slice(0, index) + item.suggestion + text.slice(index + item.original.length);
    changedCharacters += size;
    changes.push(item);
  }
  const appliedKeys = new Set(
    changes.map((item) => `${item.original}\u0000${item.suggestion}`),
  );
  return {
    text,
    changes,
    unresolved: candidates.filter(
      (item) => !appliedKeys.has(`${item.original}\u0000${item.suggestion}`),
    ),
    models: `${firstPassResult.provider} ${firstPassResult.model} + ${verificationResult.model}`,
  };
}
