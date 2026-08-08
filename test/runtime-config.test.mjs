import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAsrSettings, getMediaSettings } from "../src/config/env.mjs";
import {
  assertMediaRuntime,
  buildFfmpegArgs,
  getFfmpegPath,
  prepareMedia,
} from "../src/media/ffmpeg.mjs";

async function withEnvironment(values, callback) {
  const previous = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );
  for (const [name, value] of Object.entries(values)) {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("默认不归档完整视频且 ASR 使用失败降级模式", { concurrency: false }, async () => {
  await withEnvironment(
    { VIDEO_STORAGE_MODE: null, ASR_MODE: null },
    async () => {
      assert.equal(getMediaSettings().videoStorageMode, "none");
      assert.equal(getAsrSettings().mode, "fallback");
    },
  );
});

test("旧的飞书视频附件能力可显式开启", { concurrency: false }, async () => {
  await withEnvironment({ VIDEO_STORAGE_MODE: "feishu" }, async () => {
    assert.equal(getMediaSettings().videoStorageMode, "feishu");
  });
});

test("压缩飞书视频附件模式可独立开启", { concurrency: false }, async () => {
  await withEnvironment(
    {
      VIDEO_STORAGE_MODE: "feishu_compressed",
      VIDEO_ARCHIVE_MAX_WIDTH: "540",
      VIDEO_ARCHIVE_CRF: "30",
    },
    async () => {
      const settings = getMediaSettings();
      assert.equal(settings.videoStorageMode, "feishu_compressed");
      assert.equal(settings.archiveMaxWidth, 540);
      assert.equal(settings.archiveCrf, 30);
    },
  );
});

test("无效运行配置在处理记录前失败", { concurrency: false }, async () => {
  await withEnvironment({ VIDEO_STORAGE_MODE: "disk" }, async () => {
    assert.throws(
      () => getMediaSettings(),
      (error) => error.code === "invalid_runtime_config" && error.retryable === false,
    );
  });
});

test("原视频归档模式保持无损复制并生成 32kbps MP3", () => {
  const args = buildFfmpegArgs({
    sourceUrl: "https://example.com/video.mp4",
    audioPath: "/tmp/audio.mp3",
    videoPath: "/tmp/video.mp4",
  });
  assert.equal(args.filter((value) => value === "-i").length, 1);
  assert.ok(args.includes("libmp3lame"));
  assert.ok(args.includes("32k"));
  assert.ok(args.includes("copy"));
  assert.ok(args.includes("/tmp/audio.mp3"));
  assert.ok(args.includes("/tmp/video.mp4"));
});

test("压缩归档使用兼容的 720p H.264 参数", () => {
  const args = buildFfmpegArgs({
    sourceUrl: "https://example.com/video.mp4",
    videoPath: "/tmp/video.mp4",
    videoProfile: "compressed",
  });
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("28"));
  assert.ok(args.includes("scale=w='min(720,iw)':h=-2"));
  assert.ok(args.includes("yuv420p"));
  assert.ok(args.includes("aac"));
  assert.ok(!args.includes("copy"));
});

test("压缩归档参数可由调用方调整", () => {
  const args = buildFfmpegArgs({
    sourceUrl: "https://example.com/video.mp4",
    videoPath: "/tmp/video.mp4",
    videoProfile: "compressed",
    videoOptions: { maxWidth: 540, crf: 30 },
  });
  assert.ok(args.includes("30"));
  assert.ok(args.includes("scale=w='min(540,iw)':h=-2"));
});

test("项目依赖提供可执行 FFmpeg", async () => {
  assert.ok(getFfmpegPath());
  await assertMediaRuntime();
});

test("缺失的 FFmpeg 属于不可重试配置错误", async () => {
  await assert.rejects(
    assertMediaRuntime({ ffmpegPath: "/missing/ffmpeg-for-test" }),
    (error) => error.code === "missing_ffmpeg" && error.retryable === false,
  );
});

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `退出码 ${code}`));
    });
  });
}

test("同一次视频读取同时生成压缩音频和可选归档文件", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ffmpeg-integration-"));
  const sourcePath = join(directory, "source.mp4");
  let prepared;
  let compressed;
  let server;
  try {
    await run(getFfmpegPath(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=30:duration=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:duration=3",
      "-shortest",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      sourcePath,
    ]);
    const source = await readFile(sourcePath);
    let requestCount = 0;
    server = createServer((request, response) => {
      requestCount += 1;
      response.writeHead(200, {
        "content-type": "video/mp4",
        "content-length": source.length,
      });
      response.end(source);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    prepared = await prepareMedia(`http://127.0.0.1:${port}/video.mp4`, {
      needAudio: true,
      needVideo: true,
    });
    assert.equal(requestCount, 1);
    assert.equal(prepared.audioFormat, "mp3");
    assert.ok(prepared.audioSize > 512);
    assert.ok(prepared.videoSize > 64 * 1024);

    compressed = await prepareMedia(`http://127.0.0.1:${port}/video.mp4`, {
      needAudio: false,
      needVideo: true,
      videoProfile: "compressed",
    });
    assert.equal(requestCount, 2);
    assert.equal(compressed.videoProfile, "compressed");
    assert.ok(compressed.videoSize > 64 * 1024);
  } finally {
    await prepared?.cleanup();
    await compressed?.cleanup();
    await new Promise((resolve) => server?.close(resolve) || resolve());
    await rm(directory, { recursive: true, force: true });
  }
});
