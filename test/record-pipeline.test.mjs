import test from "node:test";
import assert from "node:assert/strict";
import { needsProcessing } from "../src/pipeline/record-pipeline.mjs";
import { JOB_FIELDS, JOB_STATUS } from "../src/pipeline/job-state.mjs";

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

test("默认模式不因缺少视频附件重复处理", { concurrency: false }, () => {
  const previous = process.env.VIDEO_STORAGE_MODE;
  delete process.env.VIDEO_STORAGE_MODE;
  try {
    const item = {
      record_id: "rec-no-archive",
      fields: {
        "作品ID": "2",
        "视频链接": "https://example.com/video.mp4",
        "视频逐字稿": "完整逐字稿",
        "开头钩子": "开头",
        "钩子类型": ["问题提问"],
        "主题": "主题",
        "核心知识点": "知识点",
        [JOB_FIELDS.STATUS]: JOB_STATUS.SUCCEEDED,
      },
    };
    assert.equal(needsProcessing(item, context, new Map()), false);
  } finally {
    if (previous == null) delete process.env.VIDEO_STORAGE_MODE;
    else process.env.VIDEO_STORAGE_MODE = previous;
  }
});

test("未过期租约不会被其他轮询重复领取", () => {
  const item = {
    record_id: "rec3",
    fields: {
      "抖音分享内容（粘贴这里）": "https://v.douyin.com/abc/",
      [JOB_FIELDS.STATUS]: JOB_STATUS.RUNNING,
      [JOB_FIELDS.LEASE_UNTIL]: Date.now() + 60_000,
    },
  };
  assert.equal(needsProcessing(item, context, new Map()), false);
});

test("旧版卡在采集中的记录会重新进入队列", () => {
  const item = {
    record_id: "rec4",
    fields: {
      "抖音分享内容（粘贴这里）": "https://v.douyin.com/abc/",
      "采集状态": "采集中",
    },
  };
  assert.equal(needsProcessing(item, context, new Map()), true);
});

test("最后一次写入前中断的完整记录会补写成功状态", () => {
  const item = {
    record_id: "rec5",
    fields: {
      "作品ID": "1",
      "标准链接": "https://www.douyin.com/video/1",
      "视频链接": "https://example.com/video.mp4",
      "视频逐字稿": "文本",
      "视频附件": [{ file_token: "file" }],
      "开头钩子": "开头",
      "钩子类型": ["问题提问"],
      "主题": "主题",
      "核心知识点": "知识点",
      [JOB_FIELDS.STATUS]: JOB_STATUS.RUNNING,
      [JOB_FIELDS.LEASE_UNTIL]: Date.now() - 1,
    },
  };
  assert.equal(needsProcessing(item, context, new Map()), true);
});
