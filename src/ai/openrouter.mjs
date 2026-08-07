import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { aiHttpRequest } from "../core/http.mjs";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_ASR_MODEL = "openai/whisper-large-v3-turbo";
const DEFAULT_ASR_FALLBACK_MODEL = "openai/whisper-large-v3";
const AUDIO_BITS_PER_SECOND = 32_000;

export function audioFormatForPath(audioPath) {
  const extension = extname(audioPath).slice(1).toLowerCase();
  return extension || "mp3";
}

export function transcriptQualityIssues(text, { audioBytes = 0 } = {}) {
  const normalized = String(text || "").replace(/\s+/g, "").trim();
  const content = normalized.replace(/[，。！？、；：,.!?;:\-—…“”‘’'"()（）]/g, "");
  const issues = [];
  if (content.length < 4) issues.push("文本过短");

  const estimatedSeconds = (Number(audioBytes) * 8) / AUDIO_BITS_PER_SECOND;
  if (estimatedSeconds >= 20 && content.length / estimatedSeconds < 0.5) {
    issues.push("长音频有效文本过少");
  }
  if (content.length >= 40) {
    const uniqueRatio = new Set(content).size / content.length;
    if (uniqueRatio < 0.12) issues.push("文本重复率异常");
  }
  if (/(.{2,16})(?:[，。！？、；：,.!?;:\s]*\1){3,}/u.test(normalized)) {
    issues.push("存在连续重复片段");
  }
  return issues;
}

async function requestTranscription({ audioData, format, apiKey, baseUrl, model }) {
  const response = await aiHttpRequest(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      language: "zh",
      input_audio: {
        data: audioData,
        format,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const text = String(payload?.text || "").trim();
  if (!response.ok || !text) {
    throw new Error(
      `OpenRouter 转写失败: ${payload?.error?.message || payload?.message || `HTTP ${response.status}`}`,
    );
  }
  return { text, source: `OpenRouter ${model}` };
}

export async function transcribeWithOpenRouter(audioPath) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const baseUrl = (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );
  const primaryModel = process.env.OPENROUTER_ASR_MODEL || DEFAULT_ASR_MODEL;
  const fallbackModel =
    process.env.OPENROUTER_ASR_FALLBACK_MODEL || DEFAULT_ASR_FALLBACK_MODEL;
  const qualityGateEnabled =
    process.env.OPENROUTER_ASR_QUALITY_GATE !== "false";
  const [audio, file] = await Promise.all([readFile(audioPath), stat(audioPath)]);
  const audioData = audio.toString("base64");
  const request = (model) =>
    requestTranscription({
      audioData,
      format: audioFormatForPath(audioPath),
      apiKey,
      baseUrl,
      model,
    });

  let primary;
  let primaryError;
  try {
    primary = await request(primaryModel);
  } catch (error) {
    primaryError = error;
  }

  const issues = primary
    ? transcriptQualityIssues(primary.text, { audioBytes: file.size })
    : ["主模型调用失败"];
  const shouldFallback =
    fallbackModel &&
    fallbackModel !== primaryModel &&
    (primaryError || (qualityGateEnabled && issues.length > 0));
  if (!shouldFallback) {
    if (primaryError) throw primaryError;
    return primary;
  }

  try {
    const fallback = await request(fallbackModel);
    const reason = primaryError ? primaryError.message : issues.join("、");
    console.warn(`[ASR 回退] ${primaryModel}：${reason}；已使用 ${fallbackModel}`);
    return {
      ...fallback,
      source: `${fallback.source}（${primaryModel} 质量门控回退）`,
    };
  } catch (fallbackError) {
    if (primary) {
      console.warn(
        `[ASR 回退失败] 保留 ${primaryModel} 结果：${fallbackError.message}`,
      );
      return primary;
    }
    throw new Error(
      `${primaryError.message}；备用模型 ${fallbackModel} 失败：${fallbackError.message}`,
    );
  }
}
