const STATUS_BY_KIND = Object.freeze({
  queued: "queued",
  running: "running",
  waiting: "retry_wait",
  success: "succeeded",
  failed: "failed",
});

function isoDate(value) {
  return new Date(Number(value) || Date.now()).toISOString();
}

export function toWorkerJob(item) {
  const modifiedAt = Number(item.modifiedAt) || Date.now();
  return {
    id: item.id,
    status: STATUS_BY_KIND[item.task?.kind] || "queued",
    stage: item.task?.stage?.id || "queued",
    source: String(item.source || item.standardUrl || ""),
    title: String(item.title || ""),
    progress: Number(item.task?.progress || 0),
    feishuRecordId: item.id,
    errorMessage: String(item.task?.error || ""),
    canRetry: item.task?.kind === "failed" || item.task?.kind === "waiting",
    createdAt: isoDate(modifiedAt),
    updatedAt: isoDate(modifiedAt),
  };
}

export function createWorkerApiService({ dashboardService }) {
  return {
    verify() {
      const feishuConfigured = Boolean(
        process.env.FEISHU_APP_ID?.trim() &&
          process.env.FEISHU_APP_SECRET?.trim() &&
          process.env.FEISHU_APP_TOKEN?.trim(),
      );
      const speechConfigured = Boolean(
        process.env.OPENROUTER_API_KEY?.trim() ||
          process.env.DASHSCOPE_API_KEY?.trim() ||
          process.env.BAILIAN_API_KEY?.trim() ||
          process.env.VOLCENGINE_SPEECH_API_KEY?.trim() ||
          (process.env.VOLCENGINE_SPEECH_APP_KEY?.trim() &&
            process.env.VOLCENGINE_SPEECH_ACCESS_KEY?.trim()),
      );
      const analysisConfigured = Boolean(
        process.env.OPENROUTER_API_KEY?.trim() ||
          process.env.DASHSCOPE_API_KEY?.trim() ||
          process.env.BAILIAN_API_KEY?.trim(),
      );
      return {
        ok: feishuConfigured && speechConfigured && analysisConfigured,
        feishuConfigured,
        speechConfigured,
        analysisConfigured,
        tableName: process.env.FEISHU_TABLE_NAME?.trim() || "",
      };
    },

    async list() {
      const result = await dashboardService.list();
      return { items: result.items.map(toWorkerJob) };
    },

    async create(source) {
      const created = await dashboardService.create(source);
      const item = await dashboardService.get(created.recordId);
      return { job: toWorkerJob(item) };
    },

    async get(jobId) {
      return { job: toWorkerJob(await dashboardService.get(jobId)) };
    },

    async retry(jobId) {
      await dashboardService.retry(jobId);
      return { job: toWorkerJob(await dashboardService.get(jobId)) };
    },
  };
}

