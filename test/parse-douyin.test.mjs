import test from "node:test";
import assert from "node:assert/strict";
import { extractDouyinUrl } from "../src/parse-douyin.mjs";

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
