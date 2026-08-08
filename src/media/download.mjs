import { createWriteStream } from "node:fs";
import { open, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { mediaHttpRequest } from "../core/http.mjs";
import { uniqueHttpUrls } from "./candidates.mjs";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36";
const MIN_VIDEO_BYTES = 64 * 1024;
const MIN_IMAGE_BYTES = 512;

export class MediaDownloadError extends Error {
  constructor(message, { code = "media_download_failed", attempts = [] } = {}) {
    super(message);
    this.name = "MediaDownloadError";
    this.code = code;
    this.attempts = attempts;
  }
}

function suspiciousFinalUrl(value) {
  try {
    const parsed = new URL(value);
    return /captcha|verify|login|passport|security|risk/i.test(
      `${parsed.pathname}${parsed.search}`,
    );
  } catch {
    return false;
  }
}

function hasMp4Signature(buffer) {
  return buffer.subarray(0, 64).toString("latin1").includes("ftyp");
}

function hasImageSignature(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return true;
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return true;
  }
  return (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

export async function validateDownloadedMedia(filePath, { contentType, kind }) {
  const { size } = await stat(filePath);
  const minimum = kind === "video" ? MIN_VIDEO_BYTES : MIN_IMAGE_BYTES;
  if (size < minimum) {
    throw new MediaDownloadError(
      `下载文件过小（${size} 字节），疑似无效${kind === "video" ? "视频" : "图片"}`,
      { code: "media_too_small" },
    );
  }
  const handle = await open(filePath, "r");
  const header = Buffer.alloc(Math.min(128, size));
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  const trimmed = header.toString("utf8").trimStart().toLowerCase();
  if (
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("{")
  ) {
    throw new MediaDownloadError("下载结果是网页或接口错误，不是媒体文件", {
      code: "not_media_content",
    });
  }
  if (
    kind === "video" &&
    !String(contentType).startsWith("video/") &&
    !hasMp4Signature(header)
  ) {
    throw new MediaDownloadError(`下载结果类型异常：${contentType || "未知"}`, {
      code: "not_video_content",
    });
  }
  if (
    kind === "image" &&
    !String(contentType).startsWith("image/") &&
    !hasImageSignature(header)
  ) {
    throw new MediaDownloadError(`下载结果类型异常：${contentType || "未知"}`, {
      code: "not_image_content",
    });
  }
  return size;
}

export async function downloadMedia(
  mediaUrls,
  filePath,
  { referer = "https://www.douyin.com/", kind = "video" } = {},
) {
  const candidates = uniqueHttpUrls(mediaUrls);
  if (!candidates.length) {
    throw new MediaDownloadError("没有可用的媒体下载地址", {
      code: "no_media_url",
    });
  }
  const attempts = [];
  for (const mediaUrl of candidates) {
    try {
      const response = await mediaHttpRequest(mediaUrl, {
        redirect: "follow",
        headers: {
          "user-agent": DESKTOP_UA,
          referer,
          accept: "*/*",
          "accept-encoding": "identity",
        },
      });
      if (!response.ok || !response.body) {
        throw new MediaDownloadError(`媒体下载失败: HTTP ${response.status}`, {
          code: `http_${response.status}`,
        });
      }
      if (suspiciousFinalUrl(response.url)) {
        throw new MediaDownloadError("媒体地址跳转到了登录、验证或风控页面", {
          code: "suspicious_final_url",
        });
      }
      const contentType =
        response.headers.get("content-type") || "application/octet-stream";
      if (
        /text\/html|application\/json|text\/plain|text\/xml|application\/xml/i.test(
          contentType,
        )
      ) {
        throw new MediaDownloadError(`媒体地址返回了 ${contentType}`, {
          code: "not_media_content",
        });
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
      const size = await validateDownloadedMedia(filePath, { contentType, kind });
      return {
        contentType,
        usedUrl: mediaUrl,
        finalUrl: response.url || mediaUrl,
        size,
        attempts,
      };
    } catch (error) {
      await rm(filePath, { force: true }).catch(() => {});
      attempts.push({
        code: error.code || "download_failed",
        message: String(error.message || error),
      });
    }
  }
  const reasons = [...new Set(attempts.map((item) => item.message))]
    .slice(0, 3)
    .join("；");
  throw new MediaDownloadError(
    `全部 ${candidates.length} 个候选地址均下载失败${reasons ? `：${reasons}` : ""}`,
    { code: "media_candidates_exhausted", attempts },
  );
}
