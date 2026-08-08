import test from "node:test";
import assert from "node:assert/strict";
import {
  fieldsSubset,
  getInputLink,
  getLinkValue,
  mapRecord,
} from "../src/feishu/fields.mjs";
import {
  getCoverCandidates,
  getVideoCandidates,
  uniqueHttpUrls,
} from "../src/media/candidates.mjs";

test("优先读取整段抖音分享文本", () => {
  const row = {
    "抖音分享内容（粘贴这里）": "口令与标题 https://v.douyin.com/abc123/ 复制打开抖音",
    "标准链接": { link: "https://www.douyin.com/video/1" },
  };
  assert.equal(getInputLink(row), row["抖音分享内容（粘贴这里）"]);
});

test("兼容飞书超链接和富文本数组", () => {
  assert.equal(
    getLinkValue({ link: "https://v.douyin.com/abc/" }),
    "https://v.douyin.com/abc/",
  );
  assert.equal(
    getLinkValue([{ text: "查看 " }, { link: "https://v.douyin.com/xyz/" }]),
    "https://v.douyin.com/xyz/",
  );
});

test("按飞书字段类型转换写入值", () => {
  const fields = [
    { field_name: "话题标签", type: 4 },
    { field_name: "点赞数", type: 2 },
    { field_name: "标准链接", type: 15 },
  ];
  assert.deepEqual(
    mapRecord(
      {
        "话题标签": ["母婴", "科普"],
        "点赞数": "12",
        "标准链接": "https://www.douyin.com/video/1",
        "不存在字段": "忽略",
      },
      fields,
    ),
    {
      "话题标签": ["母婴", "科普"],
      "点赞数": 12,
      "标准链接": {
        link: "https://www.douyin.com/video/1",
        text: "https://www.douyin.com/video/1",
      },
    },
  );
});

test("只保留目标表真实存在的字段", () => {
  assert.deepEqual(fieldsSubset({ A: 1, B: 2 }, ["B"]), { B: 2 });
});

test("状态更新可以显式清空已有字段", () => {
  const fields = [
    { field_name: "错误代码", type: 1 },
    { field_name: "下次重试时间", type: 5 },
  ];
  assert.deepEqual(
    mapRecord(
      { "错误代码": "", "下次重试时间": null },
      fields,
      { includeEmpty: true },
    ),
    { "错误代码": "", "下次重试时间": null },
  );
});

test("兼容数组、JSON文本和主视频链接的候选地址", () => {
  assert.deepEqual(
    getVideoCandidates({
      "视频候选链接": '["https://a.test/1.mp4","https://a.test/2.mp4"]',
      "视频链接": "https://a.test/1.mp4",
    }),
    ["https://a.test/1.mp4", "https://a.test/2.mp4"],
  );
  assert.deepEqual(uniqueHttpUrls("无效", "https://a.test/1.mp4"), [
    "https://a.test/1.mp4",
  ]);
  assert.deepEqual(
    getCoverCandidates({
      "封面候选链接": ["https://a.test/cover.jpg"],
      "封面链接": "https://a.test/cover.jpg",
    }),
    ["https://a.test/cover.jpg"],
  );
});
