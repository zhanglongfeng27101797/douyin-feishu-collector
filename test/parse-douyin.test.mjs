import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCoverCandidates,
  collectVideoCandidates,
  extractDouyinUrl,
} from "../src/parse-douyin.mjs";

test("从抖音分享按钮复制的整段文字中提取链接", () => {
  const input =
    "7.12 t@r.eB ZmQ:/ 11/29 :9pm 顺产还是剖宫产 https://v.douyin.com/6Pp7bCXcVk4/ 复制此链接，打开抖音！";
  assert.equal(extractDouyinUrl(input), "https://v.douyin.com/6Pp7bCXcVk4/");
});

test("跳过其他网站并接受标准抖音链接", () => {
  const input =
    "参考 https://example.com/a，视频 https://www.douyin.com/video/7530000000000000000。";
  assert.equal(
    extractDouyinUrl(input),
    "https://www.douyin.com/video/7530000000000000000",
  );
});

test("没有抖音链接时给出明确错误", () => {
  assert.throws(() => extractDouyinUrl("只有文字"), /未找到有效的抖音链接/);
});

test("视频候选地址优先高码率并自动去重去水印", () => {
  const candidates = collectVideoCandidates({
    bit_rate: [
      { bit_rate: 100, play_addr: { width: 720, height: 1280, url_list: ["https://a.test/low.mp4"] } },
      { bit_rate: 300, play_addr: { width: 1080, height: 1920, url_list: ["https://a.test/high.mp4"] } },
    ],
    download_addr: { url_list: ["https://a.test/aweme/v1/playwm/?id=1"] },
    play_addr: { url_list: ["https://a.test/high.mp4"] },
  });
  assert.deepEqual(candidates, [
    "https://a.test/high.mp4",
    "https://a.test/low.mp4",
    "https://a.test/aweme/v1/play/?id=1",
  ]);
});

test("封面候选地址优先原始封面并自动去重", () => {
  assert.deepEqual(
    collectCoverCandidates({
      origin_cover: { url_list: ["https://a.test/origin.jpg"] },
      cover: { url_list: ["https://a.test/cover.jpg", "https://a.test/origin.jpg"] },
    }),
    ["https://a.test/origin.jpg", "https://a.test/cover.jpg"],
  );
});
