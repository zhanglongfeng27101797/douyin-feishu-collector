import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mediaHttpRequest } from "../core/http.mjs";
import {
  downloadMedia,
  validateDownloadedMedia,
} from "../media/download.mjs";

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
    const response = await mediaHttpRequest(
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
  const prepareResponse = await mediaHttpRequest(
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
      const partResponse = await mediaHttpRequest(
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

  const finishResponse = await mediaHttpRequest(
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

async function uploadLocalMedia({
  token,
  appToken,
  filePath,
  fileName,
  size,
  contentType,
}) {
  const fileToken =
    size <= DIRECT_UPLOAD_LIMIT
      ? await uploadAll({ token, appToken, filePath, fileName, size, contentType })
      : await uploadMultipart({ token, appToken, filePath, fileName, size });
  if (!fileToken) throw new Error("飞书未返回附件凭证");
  return fileToken;
}

async function downloadAndUploadMedia(
  mediaUrls,
  { token, appToken, baseName, extension, referer, kind },
) {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "douyin-feishu-media-"));
  const fileName = `${String(baseName || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "_")}.${extension}`;
  const filePath = path.join(tempDirectory, fileName);
  try {
    const downloaded = await downloadMedia(mediaUrls, filePath, {
      referer,
      kind,
    });
    const { contentType, size } = downloaded;
    const fileToken = await uploadLocalMedia({
      token,
      appToken,
      filePath,
      fileName,
      size,
      contentType,
    });
    return { fileToken, size, fileName, usedUrl: downloaded.usedUrl };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

export async function uploadPreparedVideo(
  filePath,
  { token, appToken, awemeId, sourceUrl },
) {
  const contentType = "video/mp4";
  const size = await validateDownloadedMedia(filePath, {
    contentType,
    kind: "video",
  });
  const fileName = `${String(awemeId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4`;
  const fileToken = await uploadLocalMedia({
    token,
    appToken,
    filePath,
    fileName,
    size,
    contentType,
  });
  return { fileToken, size, fileName, usedUrl: sourceUrl };
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
