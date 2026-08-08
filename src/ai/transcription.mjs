import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { transcribeWithOpenRouter } from "./openrouter.mjs";
import { getAsrSettings } from "../config/env.mjs";
import { CollectorError } from "../core/errors.mjs";
import { aiHttpRequest } from "../core/http.mjs";
import { prepareMedia } from "../media/ffmpeg.mjs";

const VOLCENGINE_FLASH_URL =
  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
const DASHSCOPE_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";
function run(command, args, { captureStdout = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", captureStdout ? "pipe" : "inherit", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      if (error?.code === "ENOENT") {
        reject(
          new CollectorError(`找不到本地转写运行时：${command}`, {
            code: "missing_local_whisper",
            retryable: false,
            cause: error,
          }),
        );
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      const detail = stderr.trim().split("\n").slice(-3).join(" ");
      reject(new Error(detail || `${command} 退出码 ${code}`));
    });
  });
}

function configuredCloudProviders() {
  return [
    {
      name: "OpenRouter",
      configured: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
      run: transcribeWithOpenRouter,
    },
    {
      name: "火山",
      configured: Boolean(
        process.env.VOLCENGINE_SPEECH_API_KEY?.trim() ||
          (process.env.VOLCENGINE_SPEECH_APP_KEY?.trim() &&
            process.env.VOLCENGINE_SPEECH_ACCESS_KEY?.trim()),
      ),
      run: transcribeWithVolcengine,
    },
    {
      name: "百炼",
      configured: Boolean(
        (process.env.DASHSCOPE_API_KEY || process.env.BAILIAN_API_KEY)?.trim(),
      ),
      run: transcribeWithBailian,
    },
  ].filter((provider) => provider.configured);
}

export async function collectCloudTranscripts(
  audioPath,
  {
    mode = getAsrSettings().mode,
    providers = configuredCloudProviders(),
  } = {},
) {
  const selected = mode === "primary" ? providers.slice(0, 1) : providers;
  const results = [];
  const errors = [];
  for (const provider of selected) {
    try {
      const result = await provider.run(audioPath);
      if (result) {
        results.push(result);
        if (mode !== "compare") break;
      }
    } catch (error) {
      errors.push({ name: provider.name, error });
    }
  }
  return { results, errors, configuredCount: providers.length };
}

export async function transcribeAudio(audioPath, { model, prompt = "" } = {}) {
  const { results: cloudResults, errors, configuredCount } =
    await collectCloudTranscripts(audioPath);
  for (const failure of errors) {
    console.error(`[${failure.name} 识别失败] ${failure.error.message}`);
  }
  if (cloudResults.length > 0) {
    const primary = cloudResults[0];
    return {
      ...resultFields(
        primary.text,
        cloudResults.map((item) => item.source).join("；"),
        cloudResults.length < 2,
      ),
      // 仅供本次进程进行证据校对；mapRecord 不会把它写入飞书。
      __asrCandidates: cloudResults.map((item) => ({
        text: cleanTranscript(item.text),
        source: item.source,
      })),
    };
  }

  if (configuredCount > 0) {
    throw new CollectorError(
      `云端语音识别均失败：${errors.map(({ name, error }) => `${name}：${error.message}`).join("；")}`,
      {
        code: "cloud_asr_failed",
        retryable: errors.every(({ error }) => error?.retryable !== false),
      },
    );
  }

  const { stdout } = await run(
    process.env.WHISPER_PYTHON || resolve(".venv/bin/python"),
    [
      resolve("src/ai/transcribe_local.py"),
      audioPath,
      "--model",
      model || process.env.WHISPER_MODEL || "base",
      ...(prompt ? ["--prompt", prompt.slice(0, 500)] : []),
    ],
    { captureStdout: true },
  );
  const lines = stdout.trim().split("\n").filter(Boolean);
  const result = JSON.parse(lines.at(-1) || "{}");
  if (!result.text) throw new Error("视频中未识别到有效语音");
  return resultFields(result.text, `本机 Whisper ${result.model}`, true);
}

export async function transcribeVideo(videoUrls, { model, prompt = "" } = {}) {
  const prepared = await prepareMedia(videoUrls, {
    needAudio: true,
    needVideo: false,
  });
  try {
    return {
      ...(await transcribeAudio(prepared.audioPath, { model, prompt })),
      __sourceVideoUrl: prepared.sourceUrl,
    };
  } finally {
    await prepared.cleanup();
  }
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function uploadToBailian(audioPath, apiKey, modelName) {
  const uploadBaseUrl = (
    process.env.DASHSCOPE_UPLOAD_BASE_URL || DASHSCOPE_DEFAULT_BASE_URL
  ).replace(/\/$/, "");
  const policyUrl = new URL(`${uploadBaseUrl}/uploads`);
  policyUrl.searchParams.set("action", "getPolicy");
  policyUrl.searchParams.set("model", modelName);
  const policyResponse = await aiHttpRequest(policyUrl, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  });
  const policyPayload = await policyResponse.json().catch(() => ({}));
  const policy = policyPayload?.data;
  if (!policyResponse.ok || !policy?.upload_host || !policy?.upload_dir) {
    throw new Error(
      `百炼获取临时上传凭证失败: ${policyPayload?.message || policyPayload?.code || `HTTP ${policyResponse.status}`}`,
    );
  }

  const extension = extname(audioPath).slice(1).toLowerCase() || "mp3";
  const mimeType = extension === "wav" ? "audio/wav" : `audio/${extension}`;
  const fileName = `douyin-${crypto.randomUUID()}.${extension}`;
  const objectKey = `${policy.upload_dir}/${fileName}`;
  const form = new FormData();
  form.append("OSSAccessKeyId", policy.oss_access_key_id);
  form.append("Signature", policy.signature);
  form.append("policy", policy.policy);
  form.append("x-oss-object-acl", policy.x_oss_object_acl);
  form.append("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
  form.append("key", objectKey);
  form.append("success_action_status", "200");
  const audio = await readFile(audioPath);
  form.append("file", new Blob([audio], { type: mimeType }), fileName);
  const uploadResponse = await aiHttpRequest(policy.upload_host, {
    method: "POST",
    body: form,
  });
  if (!uploadResponse.ok) {
    const detail = (await uploadResponse.text()).slice(0, 300);
    throw new Error(`百炼临时音频上传失败 HTTP ${uploadResponse.status}: ${detail}`);
  }
  return `oss://${objectKey}`;
}

async function transcribeWithBailian(audioPath) {
  const apiKey = (process.env.DASHSCOPE_API_KEY || process.env.BAILIAN_API_KEY)?.trim();
  if (!apiKey) return null;

  const modelName = process.env.BAILIAN_ASR_MODEL || "paraformer-v2";
  const audioUrl = await uploadToBailian(audioPath, apiKey, modelName);
  const baseUrl = (
    process.env.DASHSCOPE_BASE_URL || DASHSCOPE_DEFAULT_BASE_URL
  ).replace(/\/$/, "");
  const parameters = {
    channel_id: [0],
    language_hints: ["zh", "en"],
    disfluency_removal_enabled: false,
    ...(process.env.BAILIAN_VOCABULARY_ID
      ? { vocabulary_id: process.env.BAILIAN_VOCABULARY_ID }
      : {}),
  };
  const submitResponse = await aiHttpRequest(`${baseUrl}/services/audio/asr/transcription`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "X-DashScope-Async": "enable",
      "X-DashScope-OssResourceResolve": "enable",
    },
    body: JSON.stringify({
      model: modelName,
      input: { file_urls: [audioUrl] },
      parameters,
    }),
  });
  const submitted = await submitResponse.json().catch(() => ({}));
  const taskId = submitted?.output?.task_id;
  if (!submitResponse.ok || !taskId) {
    throw new Error(
      `百炼转写任务提交失败: ${submitted?.message || submitted?.code || `HTTP ${submitResponse.status}`}`,
    );
  }

  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    await delay(2000);
    const queryResponse = await aiHttpRequest(`${baseUrl}/tasks/${taskId}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const task = await queryResponse.json().catch(() => ({}));
    const status = task?.output?.task_status;
    if (!queryResponse.ok) {
      throw new Error(
        `百炼转写任务查询失败: ${task?.message || task?.code || `HTTP ${queryResponse.status}`}`,
      );
    }
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      const failed = task?.output?.results?.find((item) => item.subtask_status !== "SUCCEEDED");
      throw new Error(
        `百炼转写失败: ${failed?.message || task?.output?.message || status}`,
      );
    }
    if (status !== "SUCCEEDED") continue;

    const resultItem = task.output.results?.find(
      (item) => item.subtask_status === "SUCCEEDED" && item.transcription_url,
    );
    if (!resultItem) throw new Error("百炼任务完成但没有可下载的识别结果");
    const transcriptionResponse = await aiHttpRequest(resultItem.transcription_url);
    const transcription = await transcriptionResponse.json().catch(() => ({}));
    const text = cleanTranscript((transcription.transcripts || [])
      .map((item) => item.text || item.transcript || "")
      .join("\n")
      .trim());
    if (!transcriptionResponse.ok || !text) {
      throw new Error("百炼识别结果为空或下载失败");
    }
    return {
      text,
      source: `阿里云百炼 ${modelName}`,
    };
  }
  throw new Error("百炼转写等待超时（超过3分钟）");
}

function resultFields(text, source, needsReview = false) {
  const cleanedText = cleanTranscript(text);
  return {
    "视频逐字稿": cleanedText,
    "转写状态": needsReview ? "成功（需校对）" : "成功",
    "转写时间": new Date().toISOString(),
    "转写来源": source,
    "逐字稿字数": [...cleanedText].length,
    "转写错误原因": "",
  };
}

function cleanTranscript(text) {
  return String(text || "")
    .trim()
    .replace(
      /(?:[。！？!?]\s*)?(?:抖音(?:记录美好生活)?|douyin)\s*[。！？!?]*\s*$/iu,
      "",
    )
    .trim();
}

export async function transcribeWithVolcengine(audioPath) {
  const apiKey = process.env.VOLCENGINE_SPEECH_API_KEY?.trim();
  const appKey = process.env.VOLCENGINE_SPEECH_APP_KEY?.trim();
  const accessKey = process.env.VOLCENGINE_SPEECH_ACCESS_KEY?.trim();
  if (!apiKey && !(appKey && accessKey)) return null;

  const identity = apiKey || appKey;
  const headers = {
    "content-type": "application/json",
    "X-Api-Resource-Id":
      process.env.VOLCENGINE_SPEECH_RESOURCE_ID || "volc.bigasr.auc_turbo",
    "X-Api-Request-Id": crypto.randomUUID(),
    "X-Api-Sequence": "-1",
    ...(apiKey
      ? { "X-Api-Key": apiKey }
      : { "X-Api-App-Key": appKey, "X-Api-Access-Key": accessKey }),
  };
  const audio = await readFile(audioPath);
  const response = await aiHttpRequest(VOLCENGINE_FLASH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user: { uid: identity },
      audio: { data: audio.toString("base64") },
      request: { model_name: "bigmodel" },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const statusCode = response.headers.get("x-api-status-code");
  const text = payload?.result?.text?.trim();
  if (!response.ok || (statusCode && statusCode !== "20000000") || !text) {
    const message =
      response.headers.get("x-api-message") ||
      payload?.message ||
      payload?.error ||
      `HTTP ${response.status}`;
    throw new Error(`火山引擎转写失败: ${message}`);
  }
  return { text, source: "火山引擎 豆包大模型录音文件极速版" };
}
