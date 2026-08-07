import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  MediaDownloadError,
  validateDownloadedMedia,
} from "../src/media/download.mjs";

async function withTempFile(bytes, callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "media-test-"));
  const filePath = path.join(directory, "sample.bin");
  try {
    await writeFile(filePath, bytes);
    return await callback(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("媒体校验接受具有 MP4 文件头的足量视频", async () => {
  const bytes = Buffer.alloc(70 * 1024);
  bytes.write("ftyp", 4, "ascii");
  await withTempFile(bytes, async (filePath) => {
    assert.equal(
      await validateDownloadedMedia(filePath, {
        contentType: "application/octet-stream",
        kind: "video",
      }),
      bytes.length,
    );
  });
});

test("媒体校验拒绝伪装成视频的网页", async () => {
  const bytes = Buffer.alloc(70 * 1024, 0x20);
  bytes.write("<!doctype html><html>", 0, "utf8");
  await withTempFile(bytes, async (filePath) => {
    await assert.rejects(
      validateDownloadedMedia(filePath, {
        contentType: "application/octet-stream",
        kind: "video",
      }),
      (error) => error instanceof MediaDownloadError && error.code === "not_media_content",
    );
  });
});
