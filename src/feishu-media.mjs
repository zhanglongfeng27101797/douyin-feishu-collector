import { createWriteStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { uniqueHttpUrls } from "./media/candidates.mjs";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36";
const DIRECT_UPLOAD_LIMIT = 20 * 1024 * 1024;
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

async function parseFeishuResponse(response, action) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code) {
    throw new Error(
      `${action}失败 HTTP ${response.status}: ${payload.msg || JSON.stringify(payload)}`,
    );
  }
  return payload.data || {};
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
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return true;
  }
  return buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";
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
  if (trimmed.startsWith("<html") || trimmed.startsWith("<!doctype") || trimmed.startsWith("{")) {
    throw new MediaDownloadError("下载结果是网页或接口错误，不是媒体文件", {
      code: "not_media_content",
    });
  }
  if (kind === "video" && !String(contentType).startsWith("video/") && !hasMp4Signature(header)) {
    throw new MediaDownloadError(`下载结果类型异常：${contentType || "未知"}`, {
      code: "not_video_content",
    });
  }
  if (kind === "image" && !String(contentType).startsWith("image/") && !hasImageSignature(header)) {
    throw new MediaDownloadError(`下载结果类型异常：${contentType || "未知"}`, {
      code: "not_image_content",
    });
  }
  return size;
}

async function downloadMedia(mediaUrls, filePath, referer, kind) {
  const candidates = uniqueHttpUrls(mediaUrls);
  if (!candidates.length) {
    throw new MediaDownloadError("没有可用的媒体下载地址", { code: "no_media_url" });
  }
  const attempts = [];
  for (const mediaUrl of candidates) {
    try {
      const response = await fetch(mediaUrl, {
        redirect: "follow",
        headers: { "user-agent": DESKTOP_UA, referer },
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
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      if (/text\/html|application\/json|text\/plain|text\/xml|application\/xml/i.test(contentType)) {
        throw new MediaDownloadError(`媒体地址返回了 ${contentType}`, {
          code: "not_media_content",
        });
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
      const size = await validateDownloadedMedia(filePath, { contentType, kind });
      return { contentType, usedUrl: mediaUrl, size, attempts };
    } catch (error) {
      attempts.push({
        code: error.code || "download_failed",
        message: String(error.message || error),
      });
    }
  }
  const reasons = [...new Set(attempts.map((item) => item.message))].slice(0, 3).join("；");
  throw new MediaDownloadError(
    `全部 ${candidates.length} 个候选地址均下载失败${reasons ? `：${reasons}` : ""}`,
    { code: "media_candidates_exhausted", attempts },
  );
}

export function isRefreshableMediaError(error) {
  if (!(error instanceof MediaDownloadError)) return false;
  return new Set([
    "no_media_url",
    "media_candidates_exhausted",
    "media_too_small",
    "not_media_content",
    "not_video_content",
    "suspicious_final_url",
    "http_403",
    "http_404",
  ]).has(error.code);
}

function commonFormData({ appToken, fileName, size }) {
  const form = new FormData();
  form.set("file_name", fileName);
  form.set("parent_type", "bitable_file");
  form.set("parent_node", appToken);
  form.set("size", String(size));
  form.set("extra", JSON.stringify({ drive_route_token: appToken }));
  return form;
}

async function uploadAll({ token, appToken, filePath, fileName, size, contentType }) {
  const bytes = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(size);
    await bytes.read(buffer, 0, size, 0);
    const form = commonFormData({ appToken, fileName, size });
    form.set("file", new Blob([buffer], { type: contentType }), fileName);
    const response = await fetch(
      "https://open.feishu.cn/open-apis/drive/v1/medias/upload_all",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      },
    );
    const data = await parseFeishuResponse(response, "飞书视频上传");
    return data.file_token;
  } finally {
    await bytes.close();
  }
}

async function uploadMultipart({ token, appToken, filePath, fileName, size }) {
  const prepareResponse = await fetch(
    "https://open.feishu.cn/open-apis/drive/v1/medias/upload_prepare",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        file_name: fileName,
        parent_type: "bitable_file",
        parent_node: appToken,
        size,
        extra: JSON.stringify({ drive_route_token: appToken }),
      }),
    },
  );
  const prepared = await parseFeishuResponse(prepareResponse, "准备分片上传");
  const { upload_id: uploadId, block_size: blockSize, block_num: blockNum } = prepared;
  if (!uploadId || !blockSize || !blockNum) {
    throw new Error(`准备分片上传返回异常: ${JSON.stringify(prepared)}`);
  }

  const handle = await open(filePath, "r");
  try {
    for (let seq = 0; seq < blockNum; seq += 1) {
      const offset = seq * blockSize;
      const partSize = Math.min(blockSize, size - offset);
      const part = Buffer.alloc(partSize);
      await handle.read(part, 0, partSize, offset);

      const form = new FormData();
      form.set("upload_id", uploadId);
      form.set("seq", String(seq));
      form.set("size", String(partSize));
      form.set("file", new Blob([part], { type: "application/octet-stream" }), fileName);
      const partResponse = await fetch(
        "https://open.feishu.cn/open-apis/drive/v1/medias/upload_part",
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: form,
        },
      );
      await parseFeishuResponse(partResponse, `上传视频分片 ${seq + 1}/${blockNum}`);
    }
  } finally {
    await handle.close();
  }

  const finishResponse = await fetch(
    "https://open.feishu.cn/open-apis/drive/v1/medias/upload_finish",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ upload_id: uploadId, block_num: blockNum }),
    },
  );
  const finished = await parseFeishuResponse(finishResponse, "完成分片上传");
  return finished.file_token;
}

async function downloadAndUploadMedia(
  mediaUrls,
  { token, appToken, baseName, extension, referer, kind },
) {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "douyin-feishu-media-"));
  const fileName = `${String(baseName || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "_")}.${extension}`;
  const filePath = path.join(tempDirectory, fileName);
  try {
    const downloaded = await downloadMedia(mediaUrls, filePath, referer, kind);
    const { contentType, size } = downloaded;
    const fileToken =
      size <= DIRECT_UPLOAD_LIMIT
        ? await uploadAll({ token, appToken, filePath, fileName, size, contentType })
        : await uploadMultipart({ token, appToken, filePath, fileName, size });
    if (!fileToken) throw new Error("飞书未返回附件凭证");
    return { fileToken, size, fileName, usedUrl: downloaded.usedUrl };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

export async function downloadAndUploadVideo(videoUrls, { token, appToken, awemeId }) {
  return downloadAndUploadMedia(videoUrls, {
    token,
    appToken,
    baseName: awemeId,
    extension: "mp4",
    referer: "https://www.douyin.com/",
    kind: "video",
  });
}

export async function downloadAndUploadCover(coverUrl, { token, appToken, awemeId }) {
  return downloadAndUploadMedia(coverUrl, {
    token,
    appToken,
    baseName: `${awemeId || Date.now()}_cover`,
    extension: "jpg",
    referer: "https://www.douyin.com/",
    kind: "image",
  });
}
