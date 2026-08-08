import { JOB_FIELDS, JOB_STATUS } from "../../pipeline/job-state.mjs";

export const DASHBOARD_STAGES = Object.freeze([
  { id: "metadata", label: "解析作品", progress: 12 },
  { id: "media", label: "准备媒体", progress: 30 },
  { id: "transcript", label: "语音转写", progress: 52 },
  { id: "proofread", label: "文本校对", progress: 68 },
  { id: "analysis", label: "内容分析", progress: 82 },
  { id: "archive", label: "归档整理", progress: 94 },
  { id: "completed", label: "处理完成", progress: 100 },
]);

const STAGE_BY_ID = new Map(DASHBOARD_STAGES.map((stage) => [stage.id, stage]));

function hasValue(value) {
  return Array.isArray(value) ? value.length > 0 : value != null && value !== "";
}

export function toTimestamp(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function taskPresentation(row) {
  const jobStatus = String(row[JOB_FIELDS.STATUS] || "");
  const stageId =
    jobStatus === JOB_STATUS.SUCCEEDED
      ? "completed"
      : String(row[JOB_FIELDS.STAGE] || "metadata");
  const stage = STAGE_BY_ID.get(stageId) || STAGE_BY_ID.get("metadata");

  const presentations = {
    [JOB_STATUS.SUCCEEDED]: { kind: "success", label: "已完成", progress: 100 },
    [JOB_STATUS.PERMANENT_FAILED]: {
      kind: "failed",
      label: "需要处理",
      progress: stage.progress,
    },
    [JOB_STATUS.RETRY_WAIT]: {
      kind: "waiting",
      label: "等待重试",
      progress: stage.progress,
    },
    [JOB_STATUS.RUNNING]: {
      kind: "running",
      label: "处理中",
      progress: stage.progress,
    },
  };
  return {
    ...(presentations[jobStatus] || {
      kind: "queued",
      label: "等待处理",
      progress: 4,
    }),
    stage,
  };
}

export function toDashboardRecord(item) {
  const row = item.fields || {};
  const task = taskPresentation(row);
  return {
    id: item.record_id,
    source:
      row["抖音分享内容（粘贴）"]?.link ||
      String(row["抖音分享内容（粘贴）"] || row["原始链接"] || ""),
    awemeId: String(row["作品ID"] || ""),
    title: String(row["标题"] || "等待解析作品信息"),
    author: String(row["博主"] || ""),
    standardUrl: row["标准链接"]?.link || String(row["标准链接"] || ""),
    coverUrl: row["封面链接"]?.link || String(row["封面链接"] || ""),
    publishedAt: toTimestamp(row["发布时间"]),
    modifiedAt: toTimestamp(item.last_modified_time || row["采集时间"]),
    duration: Number(row["时长秒"] || 0),
    metrics: {
      likes: Number(row["点赞数"] || 0),
      favorites: Number(row["收藏数"] || 0),
      comments: Number(row["评论数"] || 0),
      shares: Number(row["分享数"] || 0),
    },
    task: {
      ...task,
      attempts: Number(row[JOB_FIELDS.ATTEMPTS] || 0),
      nextRetryAt: toTimestamp(row[JOB_FIELDS.NEXT_RETRY_AT]),
      error: String(row["错误原因"] || row["转写错误原因"] || ""),
      errorCode: String(row[JOB_FIELDS.ERROR_CODE] || ""),
    },
    outputs: {
      transcript: String(row["视频逐字稿"] || ""),
      transcriptSource: String(row["转写来源"] || ""),
      hook: String(row["开头钩子"] || ""),
      hookTypes: Array.isArray(row["钩子类型"]) ? row["钩子类型"] : [],
      theme: String(row["主题"] || ""),
      knowledge: String(row["核心知识点"] || ""),
      hasCover: hasValue(row["封面"]),
      hasVideo: hasValue(row["视频附件"]),
    },
  };
}

export function dashboardRecordOrder(item) {
  return toTimestamp(
    item.last_modified_time || item.created_time || item.fields?.["采集时间"],
  );
}
