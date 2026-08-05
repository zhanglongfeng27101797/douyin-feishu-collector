import test from "node:test";
import assert from "node:assert/strict";
import { needsProcessing } from "../src/pipeline/record-pipeline.mjs";

const context = {
  fieldNames: ["封面", "视频附件", "开头钩子", "钩子类型", "主题", "核心知识点"],
};

test("新粘贴的分享文本会进入采集队列", () => {
  const item = {
    record_id: "rec1",
    fields: { "抖音分享内容（粘贴这里）": "https://v.douyin.com/abc/" },
  };
  assert.equal(needsProcessing(item, context, new Map()), true);
});

test("完整记录不会重复处理", () => {
  const item = {
    record_id: "rec2",
    fields: {
      "作品ID": "1",
      "视频链接": "https://example.com/video.mp4",
      "视频逐字稿": "文本",
      "视频附件": [{ file_token: "file" }],
      "封面链接": "https://example.com/cover.jpg",
      "封面": [{ file_token: "cover" }],
      "开头钩子": "开头",
      "钩子类型": ["问题提问型"],
      "主题": "孕产科普",
      "核心知识点": "知识点",
      "转写来源": "火山引擎；证据校对",
    },
  };
  assert.equal(needsProcessing(item, context, new Map()), false);
});
