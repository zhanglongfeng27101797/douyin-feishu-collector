import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const VOLCENGINE_FLASH_URL =
  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
const DASHSCOPE_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

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
    child.on("error", reject);
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

export async function transcribeVideo(videoUrl, { model, prompt = "" } = {}) {
  if (!videoUrl) throw new Error("缺少视频地址");
  const workDir = await mkdtemp(join(tmpdir(), "douyin-transcribe-"));
  const audioPath = join(workDir, "audio.wav");
  try {
    await run(process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-user_agent",
      DESKTOP_UA,
      "-i",
      videoUrl,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      audioPath,
    ]);
    const cloudResults = [];
    const cloudErrors = [];
    try {
      const volcengine = await transcribeWithVolcengine(audioPath);
      if (volcengine) cloudResults.push(volcengine);
    } catch (error) {
      cloudErrors.push(`火山：${error.message}`);
      console.error(`[火山识别失败] ${error.message}`);
    }

    try {
      const bailian = await transcribeWithBailian(audioPath);
      if (bailian) cloudResults.push(bailian);
    } catch (error) {
      cloudErrors.push(`百炼：${error.message}`);
      console.error(`[百炼识别失败] ${error.message}`);
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

    const hasCloudCredential = Boolean(
      process.env.DASHSCOPE_API_KEY ||
        process.env.BAILIAN_API_KEY ||
        process.env.VOLCENGINE_SPEECH_API_KEY ||
        (process.env.VOLCENGINE_SPEECH_APP_KEY &&
          process.env.VOLCENGINE_SPEECH_ACCESS_KEY),
    );
    if (hasCloudCredential) {
      throw new Error(`云端语音识别均失败：${cloudErrors.join("；")}`);
    }

    const { stdout } = await run(
      process.env.WHISPER_PYTHON || resolve(".venv/bin/python"),
      [
        resolve("src/transcribe_local.py"),
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
  } finally {
    await rm(workDir, { recursive: true, force: true });
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
  const policyResponse = await fetch(policyUrl, {
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

  const fileName = `douyin-${crypto.randomUUID()}.wav`;
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
  form.append("file", new Blob([audio], { type: "audio/wav" }), fileName);
  const uploadResponse = await fetch(policy.upload_host, {
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
  const submitResponse = await fetch(`${baseUrl}/services/audio/asr/transcription`, {
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
    const queryResponse = await fetch(`${baseUrl}/tasks/${taskId}`, {
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
    const transcriptionResponse = await fetch(resultItem.transcription_url);
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
  const response = await fetch(VOLCENGINE_FLASH_URL, {
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
