import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import { CollectorError } from "../core/errors.mjs";
import { downloadMedia } from "./download.mjs";
import { uniqueHttpUrls } from "./candidates.mjs";

const MIN_AUDIO_BYTES = 512;
const MIN_VIDEO_BYTES = 64 * 1024;

export function getFfmpegPath(env = process.env) {
  return env.FFMPEG_PATH?.trim() || ffmpegStaticPath || "ffmpeg";
}

function runtimeError(command, error) {
  if (error?.code === "ENOENT") {
    return new CollectorError(
      `找不到 FFmpeg：${command}。请重新安装项目依赖或设置 FFMPEG_PATH`,
      { code: "missing_ffmpeg", retryable: false, cause: error },
    );
  }
  if (error?.code === "EACCES") {
    return new CollectorError(`FFmpeg 不可执行：${command}`, {
      code: "invalid_ffmpeg",
      retryable: false,
      cause: error,
    });
  }
  return error;
}

function runProcess(command, args, { captureStdout = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => reject(runtimeError(command, error)));
    child.once("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = stderr.trim().split("\n").slice(-3).join(" ");
      reject(
        new CollectorError(detail || `FFmpeg 退出码 ${code}`, {
          code: "media_extraction_failed",
          retryable: true,
        }),
      );
    });
  });
}

export async function assertMediaRuntime({ ffmpegPath = getFfmpegPath() } = {}) {
  if (ffmpegPath !== "ffmpeg") {
    try {
      await access(ffmpegPath, fsConstants.X_OK);
    } catch (error) {
      throw runtimeError(ffmpegPath, { ...error, code: error.code || "EACCES" });
    }
  }
  try {
    await runProcess(ffmpegPath, ["-version"], { captureStdout: true });
  } catch (error) {
    if (error instanceof CollectorError && error.code === "media_extraction_failed") {
      throw new CollectorError(`FFmpeg 无法启动：${error.message}`, {
        code: "invalid_ffmpeg",
        retryable: false,
        cause: error,
      });
    }
    throw error;
  }
  return ffmpegPath;
}

export function buildFfmpegArgs({
  sourceUrl,
  audioPath,
  videoPath,
  videoProfile = "original",
  videoOptions = {},
}) {
  if (!audioPath && !videoPath) {
    throw new CollectorError("媒体处理至少需要一个输出", {
      code: "invalid_media_output",
      retryable: false,
    });
  }
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-i",
    sourceUrl,
  ];
  if (videoPath) {
    args.push("-map", "0:v:0?", "-map", "0:a:0?");
    if (videoProfile === "compressed") {
      const maxWidth = Number(videoOptions.maxWidth) || 720;
      const crf = Number(videoOptions.crf) || 28;
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        String(crf),
        "-vf",
        `scale=w='min(${maxWidth},iw)':h=-2`,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "48k",
        "-ac",
        "1",
      );
    } else {
      args.push("-c", "copy");
    }
    args.push("-movflags", "+faststart", videoPath);
  }
  if (audioPath) {
    args.push(
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "32k",
      audioPath,
    );
  }
  return args;
}

async function validOutput(filePath, minimumBytes) {
  if (!filePath) return null;
  const file = await stat(filePath).catch(() => null);
  return file && file.size >= minimumBytes ? file.size : null;
}

export async function prepareMedia(
  mediaUrls,
  {
    needAudio = true,
    needVideo = false,
    videoProfile = "original",
    videoOptions = {},
    ffmpegPath = getFfmpegPath(),
  } = {},
) {
  const candidates = uniqueHttpUrls(mediaUrls);
  if (!candidates.length) {
    throw new CollectorError("缺少视频地址", {
      code: "missing_video_url",
      retryable: false,
    });
  }
  if (!needAudio && !needVideo) return null;

  const workDir = await mkdtemp(join(tmpdir(), "douyin-media-"));
  const sourcePath = join(workDir, "source.mp4");
  const audioPath = needAudio ? join(workDir, "audio.mp3") : null;
  const videoPath = needVideo ? join(workDir, "video.mp4") : null;
  const errors = [];
  try {
    for (const sourceUrl of candidates) {
      await Promise.all(
        [sourcePath, audioPath, videoPath]
          .filter(Boolean)
          .map((filePath) => rm(filePath, { force: true })),
      );
      try {
        const downloaded = await downloadMedia(sourceUrl, sourcePath, {
          kind: "video",
        });
        await runProcess(
          ffmpegPath,
          buildFfmpegArgs({
            sourceUrl: sourcePath,
            audioPath,
            videoPath,
            videoProfile,
            videoOptions,
          }),
        );
        const audioSize = await validOutput(audioPath, MIN_AUDIO_BYTES);
        const videoSize = await validOutput(videoPath, MIN_VIDEO_BYTES);
        if (needAudio && !audioSize) throw new Error("未生成有效压缩音频");
        if (needVideo && !videoSize) throw new Error("未生成有效归档视频");
        return {
          workDir,
          audioPath,
          audioFormat: audioPath ? "mp3" : null,
          audioMimeType: audioPath ? "audio/mpeg" : null,
          audioSize,
          videoPath,
          videoSize,
          videoProfile: videoPath ? videoProfile : null,
          sourceUrl: downloaded.usedUrl,
          cleanup: () => rm(workDir, { recursive: true, force: true }),
        };
      } catch (error) {
        if (error?.retryable === false) throw error;
        errors.push(String(error.message || error));
      }
    }
    throw new CollectorError(
      `全部 ${candidates.length} 个视频地址均无法处理：${[...new Set(errors)].slice(0, 2).join("；")}`,
      { code: "media_extraction_failed", retryable: true },
    );
  } catch (error) {
    await rm(workDir, { recursive: true, force: true });
    throw error;
  }
}
