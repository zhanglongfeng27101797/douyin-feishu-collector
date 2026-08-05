import { createWriteStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36";
const DIRECT_UPLOAD_LIMIT = 20 * 1024 * 1024;

async function parseFeishuResponse(response, action) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code) {
    throw new Error(
      `${action}失败 HTTP ${response.status}: ${payload.msg || JSON.stringify(payload)}`,
    );
  }
  return payload.data || {};
}

async function downloadMedia(mediaUrl, filePath, referer) {
  const response = await fetch(mediaUrl, {
    redirect: "follow",
    headers: { "user-agent": DESKTOP_UA, referer },
  });
  if (!response.ok || !response.body) {
    throw new Error(`媒体下载失败: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
  return response.headers.get("content-type") || "application/octet-stream";
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
  mediaUrl,
  { token, appToken, baseName, extension, referer },
) {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "douyin-feishu-media-"));
  const fileName = `${String(baseName || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "_")}.${extension}`;
  const filePath = path.join(tempDirectory, fileName);
  try {
    const contentType = await downloadMedia(mediaUrl, filePath, referer);
    const { size } = await stat(filePath);
    if (!size) throw new Error("下载到的媒体文件为空");
    const fileToken =
      size <= DIRECT_UPLOAD_LIMIT
        ? await uploadAll({ token, appToken, filePath, fileName, size, contentType })
        : await uploadMultipart({ token, appToken, filePath, fileName, size });
    if (!fileToken) throw new Error("飞书未返回附件凭证");
    return { fileToken, size, fileName };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

export async function downloadAndUploadVideo(videoUrl, { token, appToken, awemeId }) {
  return downloadAndUploadMedia(videoUrl, {
    token,
    appToken,
    baseName: awemeId,
    extension: "mp4",
    referer: "https://www.douyin.com/",
  });
}

export async function downloadAndUploadCover(coverUrl, { token, appToken, awemeId }) {
  return downloadAndUploadMedia(coverUrl, {
    token,
    appToken,
    baseName: `${awemeId || Date.now()}_cover`,
    extension: "jpg",
    referer: "https://www.douyin.com/",
  });
}
