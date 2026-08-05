import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDirUrl = new URL("../outputs/2026-08-03-douyin-collector/", import.meta.url);
const outputDir = decodeURIComponent(outputDirUrl.pathname);
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const collection = workbook.worksheets.add("采集库");
const guide = workbook.worksheets.add("字段说明");

const headers = [
  "采集状态", "标题", "封面链接", "原始链接", "正文", "话题标签", "博主", "抖音号",
  "点赞数", "收藏数", "评论数", "分享数", "发布时间", "采集时间", "作品ID", "标准链接",
  "博主主页", "视频链接", "时长秒", "分辨率", "错误原因", "备注"
];

collection.getRange("A1:V2").values = [
  headers,
  [
    "成功",
    "产后伤口护理科普之歌第一节 最高端的科普，只需要最朴素的方式：",
    "",
    "https://v.douyin.com/wcCBheFc6dQ/",
    "产后伤口护理科普之歌第一节 最高端的科普，只需要最朴素的方式：\n不要用会阴冲洗器！\n重要的事情说三遍！",
    "产后恢复, 产后伤口护理, 产妇, 准爸爸, 孕妇",
    "湖南省妇幼保健院产房",
    "42932412922",
    2955, 1305, 500, 6486,
    new Date("2026-07-17T17:02:52+08:00"),
    new Date(),
    "7663419826879107817",
    "https://www.douyin.com/video/7663419826879107817",
    "",
    "",
    87.5,
    "1080x1920",
    "",
    "普通视频解析测试"
  ]
];

collection.showGridLines = false;
collection.freezePanes.freezeRows(1);
collection.getRange("A1:V2").format.borders = {
  preset: "inside",
  style: "thin",
  color: "#E5E7EB"
};
collection.getRange("A1:V1").format = {
  fill: "#2563EB",
  font: { bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
  wrapText: true,
  rowHeight: 32
};
collection.getRange("A2:V2").format = {
  verticalAlignment: "top",
  wrapText: true,
  rowHeight: 72
};
collection.getRange("I2:N200").format.numberFormat = "#,##0";
collection.getRange("M2:N200").format.numberFormat = "yyyy-mm-dd hh:mm:ss";
collection.getRange("S2:S200").format.numberFormat = "0.0";
collection.getRange("A2:A200").dataValidation = {
  rule: { type: "list", values: ["待采集", "采集中", "成功", "失败", "需更新"] }
};
collection.getRange("A2:A200").conditionalFormats.add("containsText", {
  text: "成功",
  format: { fill: "#DCFCE7", font: { color: "#166534" } }
});
collection.getRange("A2:A200").conditionalFormats.add("containsText", {
  text: "失败",
  format: { fill: "#FEE2E2", font: { color: "#991B1B" } }
});
collection.tables.add("A1:V2", true, "DouyinCollectionTable");

const widths = [12, 34, 28, 27, 44, 26, 24, 16, 12, 12, 12, 12, 20, 20, 22, 28, 30, 30, 12, 14, 24, 24];
widths.forEach((width, index) => {
  collection.getRangeByIndexes(0, index, 2, 1).format.columnWidth = width;
});

const guideRows = [
  ["字段名", "建议的飞书字段类型", "用途"],
  ["采集状态", "单选", "待采集/采集中/成功/失败/需更新"],
  ["标题", "多行文本", "抖音作品首行标题"],
  ["封面链接", "URL", "封面地址可能过期，后续可改为附件"],
  ["原始链接", "URL", "用户粘贴的短链接，是采集入口"],
  ["正文", "多行文本", "完整作品文案"],
  ["话题标签", "多选", "作品话题"],
  ["点赞数/收藏数/评论数/分享数", "数字", "采集时的互动数据"],
  ["发布时间/采集时间", "日期", "作品发布与本次采集时间"],
  ["作品ID", "文本", "去重主键，不要使用数字类型"],
  ["标准链接/博主主页/视频链接", "URL", "规范化作品和媒体地址"],
  ["错误原因", "多行文本", "失败时保留可读原因"]
];
guide.getRange(`A1:C${guideRows.length}`).values = guideRows;
guide.showGridLines = false;
guide.freezePanes.freezeRows(1);
guide.getRange("A1:C1").format = {
  fill: "#0F172A",
  font: { bold: true, color: "#FFFFFF" },
  rowHeight: 30
};
guide.getRange(`A2:C${guideRows.length}`).format = {
  wrapText: true,
  verticalAlignment: "top",
  rowHeight: 34
};
guide.getRange(`A1:C${guideRows.length}`).format.borders = {
  preset: "inside",
  style: "thin",
  color: "#E5E7EB"
};
guide.getRange("A1:A12").format.columnWidth = 34;
guide.getRange("B1:B12").format.columnWidth = 24;
guide.getRange("C1:C12").format.columnWidth = 52;

const inspect = await workbook.inspect({
  kind: "table",
  range: "采集库!A1:V2",
  include: "values,formulas",
  tableMaxRows: 4,
  tableMaxCols: 22
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan"
});
console.log(errors.ndjson);

const preview = await workbook.render({ sheetName: "采集库", range: "A1:V2", scale: 1 });
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));
const guidePreview = await workbook.render({ sheetName: "字段说明", range: "A1:C12", scale: 1 });
await fs.writeFile(`${outputDir}/guide-preview.png`, new Uint8Array(await guidePreview.arrayBuffer()));

const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(`${outputDir}/抖音采集库模板.xlsx`);
