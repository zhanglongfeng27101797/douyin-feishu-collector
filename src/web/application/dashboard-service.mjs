import {
  createRecord,
  getRecord,
  listAllRecords,
  updateRecord,
} from "../../feishu/client.mjs";
import { createFeishuContext } from "../../feishu/context.mjs";
import { mapRecord } from "../../feishu/fields.mjs";
import { INPUT_FIELD_NAME } from "../../feishu/schema.mjs";
import { JOB_FIELDS, JOB_STATUS } from "../../pipeline/job-state.mjs";
import { extractDouyinUrl } from "../../parse-douyin.mjs";
import {
  dashboardRecordOrder,
  toDashboardRecord,
} from "../domain/dashboard-record.mjs";

const CONTEXT_TTL_MS = 50 * 60 * 1000;
const DASHBOARD_LIMIT = 30;
const DASHBOARD_LIST_FIELDS = Object.freeze([
  INPUT_FIELD_NAME,
  "作品ID",
  "标题",
  "博主",
  "标准链接",
  "封面链接",
  "发布时间",
  "采集时间",
  "时长秒",
  "点赞数",
  "收藏数",
  "评论数",
  "分享数",
  "错误原因",
  "转写错误原因",
  JOB_FIELDS.STATUS,
  JOB_FIELDS.STAGE,
  JOB_FIELDS.ATTEMPTS,
  JOB_FIELDS.NEXT_RETRY_AT,
  JOB_FIELDS.ERROR_CODE,
]);

function summarize(items) {
  const count = (kind) => items.filter((item) => item.task.kind === kind).length;
  return {
    total: items.length,
    running: count("running"),
    waiting: count("waiting"),
    failed: count("failed"),
    completed: count("success"),
  };
}

export function createDashboardService({ contextFactory = createFeishuContext } = {}) {
  let cachedContext = null;
  let contextCreatedAt = 0;

  async function getContext({ refresh = false } = {}) {
    if (refresh || !cachedContext || Date.now() - contextCreatedAt >= CONTEXT_TTL_MS) {
      cachedContext = await contextFactory();
      contextCreatedAt = Date.now();
    }
    return cachedContext;
  }

  async function withContext(operation) {
    try {
      return await operation(await getContext());
    } catch (error) {
      if (!String(error.message).includes("Invalid access token")) throw error;
      return operation(await getContext({ refresh: true }));
    }
  }

  return {
    invalidate() {
      cachedContext = null;
      contextCreatedAt = 0;
    },

    async list() {
      return withContext(async (context) => {
        const records = await listAllRecords(
          context.token,
          context.appToken,
          context.table.table_id,
          { fieldNames: DASHBOARD_LIST_FIELDS },
        );
        const dashboardRecords = records
          .sort((left, right) => dashboardRecordOrder(right) - dashboardRecordOrder(left))
          .map(toDashboardRecord);
        const items = dashboardRecords.slice(0, DASHBOARD_LIMIT);
        return {
          tableName: context.table.name,
          items,
          summary: summarize(dashboardRecords),
        };
      });
    },

    async get(recordId) {
      const id = String(recordId || "").trim();
      if (!/^rec[A-Za-z0-9]+$/.test(id)) throw new Error("记录 ID 无效");
      return withContext(async (context) => {
        const record = await getRecord(
          context.token,
          context.appToken,
          context.table.table_id,
          id,
        );
        return toDashboardRecord(record);
      });
    },

    async create(input) {
      const source = String(input || "").trim();
      if (!source) throw new Error("请粘贴抖音分享内容或链接");
      if (source.length > 5000) throw new Error("分享内容过长，请保留抖音链接和必要文字");

      return withContext(async (context) => {
        const inputField = context.fields.find(
          (field) => field.field_name === INPUT_FIELD_NAME,
        );
        if (!inputField) throw new Error(`飞书表缺少“${INPUT_FIELD_NAME}”字段`);
        const storedSource = inputField.type === 15 ? extractDouyinUrl(source) : source;
        const fields = mapRecord(
          { [INPUT_FIELD_NAME]: storedSource, "采集状态": "等待处理" },
          context.fields,
        );
        const data = await createRecord(
          context.token,
          context.appToken,
          context.table.table_id,
          fields,
        );
        return { recordId: data.record?.record_id || "", status: "queued" };
      });
    },

    async retry(recordId) {
      const id = String(recordId || "").trim();
      if (!/^rec[A-Za-z0-9]+$/.test(id)) throw new Error("记录 ID 无效");

      return withContext(async (context) => {
        const fields = mapRecord(
          {
            "采集状态": "等待重试",
            "错误原因": "",
            "转写错误原因": "",
            [JOB_FIELDS.STATUS]: JOB_STATUS.RETRY_WAIT,
            [JOB_FIELDS.LEASE_UNTIL]: null,
            [JOB_FIELDS.ATTEMPTS]: 0,
            [JOB_FIELDS.NEXT_RETRY_AT]: Date.now(),
            [JOB_FIELDS.ERROR_CODE]: "",
          },
          context.fields,
          { includeEmpty: true },
        );
        await updateRecord(
          context.token,
          context.appToken,
          context.table.table_id,
          id,
          fields,
        );
        return { recordId: id, status: "retry_wait" };
      });
    },
  };
}
