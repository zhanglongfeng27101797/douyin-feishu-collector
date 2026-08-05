import { parseDouyinShare } from "./parse-douyin.mjs";
import { transcribeVideo } from "./transcribe-media.mjs";
import { proofreadTranscript } from "./review-transcript.mjs";
import { analyzeTranscript } from "./analyze-transcript.mjs";
import {
  downloadAndUploadCover,
  downloadAndUploadVideo,
} from "./feishu-media.mjs";
import {
  api,
  findTable,
  listFields,
  loadLocalEnv,
  mapRecord,
  tenantToken,
} from "./collect-to-feishu.mjs";

const DEFAULT_INTERVAL_SECONDS = 10;
const analysisRetryAfter = new Map();

function getLinkValue(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.link === "string") {
    return value.link.trim();
  }
  if (Array.isArray(value)) {
    const text = value.map((item) => item?.text || item?.link || "").join("");
    const match = text.match(/https?:\/\/[^\s]+/i);
    return match?.[0] || "";
  }
  return "";
}

function getShareText(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return String(value.text || value.link || "").trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => item?.text || item?.link || "").join("").trim();
  }
  return "";
}

function getInputLink(row) {
  return (
    getShareText(row?.["抖音分享内容（粘贴这里）"]) ||
    getLinkValue(row?.["标准链接"]) ||
    getLinkValue(row?.["原始链接"])
  );
}

async function listAllRecords(token, appToken, tableId) {
  const records = [];
  let pageToken = "";
  do {
    const url = new URL(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    );
    url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const data = await api(url.toString(), { token });
    records.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token || "" : "";
  } while (pageToken);
  return records;
}

async function updateRecord(token, appToken, tableId, recordId, fields) {
  return api(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    { token, method: "PUT", body: { fields } },
  );
}

function fieldsSubset(values, fieldNames) {
  const allowed = new Set(fieldNames);
  return Object.fromEntries(Object.entries(values).filter(([name]) => allowed.has(name)));
}

async function runOnce(context) {
  const { token, appToken, table, fields } = context;
  const hasCoverField = fields.some((field) => field.field_name === "封面");
  const records = await listAllRecords(token, appToken, table.table_id);
  const existingIds = new Map();
  for (const item of records) {
    const id = item.fields?.["作品ID"];
    if (id) existingIds.set(String(id), item.record_id);
  }

  const pending = records.filter((item) => {
    const row = item.fields || {};
    const link = getInputLink(row);
    const status = String(row["采集状态"] || "");
    const transcriptionStatus = String(row["转写状态"] || "");
    const needsMetadata = link && !row["作品ID"] && status !== "采集中";
    const needsTranscript =
      row["作品ID"] &&
      getLinkValue(row["视频链接"]) &&
      !row["视频逐字稿"] &&
      transcriptionStatus !== "转写中";
    const needsAudit =
      process.env.ENABLE_TEXT_PROOFREAD === "true" &&
      row["视频逐字稿"] &&
      !String(row["转写来源"] || "").includes("通义双模型校对");
    const needsAttachment =
      row["作品ID"] &&
      getLinkValue(row["视频链接"]) &&
      !row["视频附件"] &&
      (!String(row["错误原因"] || "").includes("视频附件上传失败") ||
        String(row["错误原因"] || "").includes("HTTP 403"));
    const needsCover =
      hasCoverField &&
      row["作品ID"] &&
      getLinkValue(row["封面链接"]) &&
      !row["封面"] &&
      !String(row["错误原因"] || "").includes("封面上传失败");
    const hasAnalysisFields = ["开头钩子", "钩子类型", "主题", "核心知识点"].every(
      (name) => fields.some((field) => field.field_name === name),
    );
    const needsContentAnalysis =
      hasAnalysisFields &&
      row["视频逐字稿"] &&
      (!row["开头钩子"] || !row["钩子类型"] || !row["主题"] || !row["核心知识点"]) &&
      Date.now() >= (analysisRetryAfter.get(item.record_id) || 0);
    return needsMetadata || needsTranscript || needsAudit || needsAttachment || needsCover || needsContentAnalysis;
  });

  if (pending.length === 0) {
    console.log(`[监听] 未发现待采集链接，共检查 ${records.length} 行`);
    return 0;
  }

  const fieldNames = fields.map((field) => field.field_name);
  for (const item of pending) {
    const originalRow = item.fields || {};
    const source = getInputLink(originalRow);
    try {
      let parsed = { ...originalRow };
      if (!originalRow["作品ID"]) {
        await updateRecord(
          token,
          appToken,
          table.table_id,
          item.record_id,
          fieldsSubset({ "采集状态": "采集中", "错误原因": "" }, fieldNames),
        );
        const metadata = await parseDouyinShare(source);
        const duplicateId = existingIds.get(String(metadata["作品ID"]));
        if (duplicateId && duplicateId !== item.record_id) {
          throw new Error(`该作品已存在，记录ID: ${duplicateId}`);
        }
        await updateRecord(
          token,
          appToken,
          table.table_id,
          item.record_id,
          mapRecord({ ...metadata, "采集状态": "基础信息成功，转写中", "错误原因": "" }, fields),
        );
        existingIds.set(String(metadata["作品ID"]), item.record_id);
        parsed = { ...parsed, ...metadata };
      }

      if (
        fieldNames.includes("封面") &&
        parsed["作品ID"] &&
        getLinkValue(parsed["封面链接"]) &&
        !parsed["封面"] &&
        !String(parsed["错误原因"] || "").includes("封面上传失败")
      ) {
        try {
          console.log(`[封面] ${parsed["作品ID"]} 正在上传封面`);
          const uploaded = await downloadAndUploadCover(
            getLinkValue(parsed["封面链接"]),
            { token, appToken, awemeId: parsed["作品ID"] },
          );
          const cover = [{ file_token: uploaded.fileToken }];
          await updateRecord(
            token,
            appToken,
            table.table_id,
            item.record_id,
            mapRecord({ "封面": cover }, fields),
          );
          parsed["封面"] = cover;
          console.log(`[封面成功] ${parsed["作品ID"]}`);
        } catch (coverError) {
          const message = `封面上传失败：${coverError.message}`;
          await updateRecord(
            token,
            appToken,
            table.table_id,
            item.record_id,
            fieldsSubset({ "错误原因": message }, fieldNames),
          ).catch(() => {});
          parsed["错误原因"] = message;
          console.error(`[封面失败] ${parsed["作品ID"]}: ${coverError.message}`);
        }
      }

      if (
        fieldNames.includes("视频附件") &&
        parsed["作品ID"] &&
        getLinkValue(parsed["视频链接"]) &&
        !parsed["视频附件"] &&
        (!String(parsed["错误原因"] || "").includes("视频附件上传失败") ||
          String(parsed["错误原因"] || "").includes("HTTP 403"))
      ) {
        try {
          console.log(`[视频附件] ${parsed["作品ID"]} 正在上传原视频`);
          let uploaded;
          try {
            uploaded = await downloadAndUploadVideo(
              getLinkValue(parsed["视频链接"]),
              {
                token,
                appToken,
                awemeId: parsed["作品ID"],
              },
            );
          } catch (downloadError) {
            const refreshSource = source || getLinkValue(parsed["标准链接"]);
            if (!String(downloadError.message).includes("HTTP 403") || !refreshSource) {
              throw downloadError;
            }
            console.log(`[视频附件] ${parsed["作品ID"]} 播放地址已过期，正在重新解析`);
            const refreshed = await parseDouyinShare(refreshSource);
            parsed = { ...parsed, ...refreshed };
            await updateRecord(
              token,
              appToken,
              table.table_id,
              item.record_id,
              mapRecord(refreshed, fields),
            );
            uploaded = await downloadAndUploadVideo(
              getLinkValue(refreshed["视频链接"]),
              {
                token,
                appToken,
                awemeId: parsed["作品ID"],
              },
            );
          }
          const attachment = [{ file_token: uploaded.fileToken }];
          await updateRecord(
            token,
            appToken,
            table.table_id,
            item.record_id,
            mapRecord({ "视频附件": attachment, "错误原因": "" }, fields),
          );
          parsed["视频附件"] = attachment;
          console.log(
            `[视频附件成功] ${parsed["作品ID"]} ${(uploaded.size / 1024 / 1024).toFixed(1)} MB`,
          );
        } catch (attachmentError) {
          const message = `视频附件上传失败：${attachmentError.message}`;
          await updateRecord(
            token,
            appToken,
            table.table_id,
            item.record_id,
            fieldsSubset({ "错误原因": message }, fieldNames),
          ).catch(() => {});
          parsed["错误原因"] = message;
          console.error(`[视频附件失败] ${parsed["作品ID"]}: ${attachmentError.message}`);
        }
      }

      if (!parsed["视频逐字稿"]) {
        const videoUrl = getLinkValue(parsed["视频链接"]);
        await updateRecord(
          token,
          appToken,
          table.table_id,
          item.record_id,
          fieldsSubset({ "转写状态": "转写中", "转写错误原因": "" }, fieldNames),
        );
        try {
          const prompt = [
            parsed["标题"],
            parsed["正文"],
            Array.isArray(parsed["话题标签"])
              ? parsed["话题标签"].join("、")
              : parsed["话题标签"],
          ]
            .filter(Boolean)
            .join("。")
            .slice(0, 500);
          const transcript = await transcribeVideo(videoUrl, { prompt });
          const asrCandidates = Array.isArray(transcript.__asrCandidates)
            ? transcript.__asrCandidates
            : [];
          delete transcript.__asrCandidates;
          if (
            asrCandidates.length >= 2 ||
            process.env.ENABLE_TEXT_PROOFREAD === "true"
          ) {
            try {
              const proofread = await proofreadTranscript(
                transcript["视频逐字稿"],
                {
                  title: String(parsed["标题"] || ""),
                  description: String(parsed["正文"] || ""),
                  hashtags: Array.isArray(parsed["话题标签"])
                    ? parsed["话题标签"].join("、")
                    : String(parsed["话题标签"] || ""),
                  referenceTranscript: asrCandidates[1]?.text || "",
                },
              );
              transcript["视频逐字稿"] = proofread.text;
              transcript["逐字稿字数"] = [...proofread.text].length;
              transcript["转写来源"] += `；证据校对 ${proofread.models}`;
              transcript["转写状态"] = proofread.unresolved.length
                ? "成功（需人工复核）"
                : "成功（双 ASR 校对）";
              transcript["转写错误原因"] = proofread.unresolved.length
                ? proofread.unresolved
                    .map((item) => `“${item.original}”疑似为“${item.suggestion}”`)
                    .join("；")
                : "";
            } catch (auditError) {
              console.error(`[审核失败，保留原始听写] ${auditError.message}`);
              transcript["转写来源"] += "；证据校对失败";
              transcript["转写错误原因"] = auditError.message;
            }
          }
          await updateRecord(
            token,
            appToken,
            table.table_id,
            item.record_id,
            mapRecord({ ...transcript, "采集状态": "成功" }, fields),
          );
          parsed = { ...parsed, ...transcript, "采集状态": "成功" };
          console.log(`[成功] ${parsed["作品ID"]} 已生成逐字稿`);
        } catch (transcriptionError) {
          await updateRecord(
            token,
            appToken,
            table.table_id,
            item.record_id,
            fieldsSubset({
              "采集状态": "部分成功",
              "转写状态": "失败",
              "转写错误原因": transcriptionError.message,
            }, fieldNames),
          );
          console.error(`[转写失败] ${parsed["作品ID"]}: ${transcriptionError.message}`);
          continue;
        }
      }

      if (
        process.env.ENABLE_TEXT_PROOFREAD === "true" &&
        parsed["视频逐字稿"] &&
        !String(parsed["转写来源"] || "").includes("通义双模型校对") &&
        !String(parsed["转写来源"] || "").includes("证据校对")
      ) {
        try {
          const proofread = await proofreadTranscript(String(parsed["视频逐字稿"]), {
            title: String(parsed["标题"] || ""),
            description: String(parsed["正文"] || ""),
            hashtags: Array.isArray(parsed["话题标签"])
              ? parsed["话题标签"].join("、")
              : String(parsed["话题标签"] || ""),
          });
          const source = `${String(parsed["转写来源"] || "")}；通义双模型校对 ${proofread.models}`
            .replace(/^；/, "");
          await updateRecord(
            token,
            appToken,
            table.table_id,
            item.record_id,
            mapRecord(
              {
                "视频逐字稿": proofread.text,
                "逐字稿字数": [...proofread.text].length,
                "转写来源": source,
                "转写状态":
                  proofread.unresolved.length > 0
                    ? "成功（需人工复核）"
                    : "成功（双模型校对）",
                "转写错误原因": proofread.unresolved.length
                  ? proofread.unresolved
                      .map((issue) => `“${issue.original}”疑似为“${issue.suggestion}”`)
                      .join("；")
                  : "",
              },
              fields,
            ),
          );
          console.log(
            `[双模型校对完成] ${parsed["作品ID"]}: 自动修正 ${proofread.changes.length} 处，待复核 ${proofread.unresolved.length} 处`,
          );
        } catch (auditError) {
          await updateRecord(
            token,
            appToken,
            table.table_id,
            item.record_id,
            mapRecord(
              {
                "转写来源": `${String(parsed["转写来源"] || "")}；通义双模型校对失败`.replace(/^；/, ""),
                "转写错误原因": auditError.message,
              },
              fields,
            ),
          );
          console.error(`[双模型校对失败且保留原文] ${auditError.message}`);
        }
      }

      if (
        parsed["视频逐字稿"] &&
        fieldNames.includes("开头钩子") &&
        fieldNames.includes("钩子类型") &&
        fieldNames.includes("主题") &&
        fieldNames.includes("核心知识点") &&
        (!parsed["开头钩子"] ||
          !parsed["钩子类型"] ||
          !parsed["主题"] ||
          !parsed["核心知识点"])
      ) {
        try {
          const analysis = await analyzeTranscript(String(parsed["视频逐字稿"]), {
            title: String(parsed["标题"] || ""),
            description: String(parsed["正文"] || ""),
            hashtags: Array.isArray(parsed["话题标签"])
              ? parsed["话题标签"].join("、")
              : String(parsed["话题标签"] || ""),
          });
          const { model, ...analysisFields } = analysis;
          await updateRecord(
            token,
            appToken,
            table.table_id,
            item.record_id,
            mapRecord(analysisFields, fields),
          );
          parsed = { ...parsed, ...analysisFields };
          analysisRetryAfter.delete(item.record_id);
          console.log(`[内容分析完成] ${parsed["作品ID"] || item.record_id}，模型 ${model}`);
        } catch (analysisError) {
          analysisRetryAfter.set(item.record_id, Date.now() + 10 * 60 * 1000);
          console.error(
            `[内容分析失败，10分钟后重试] ${parsed["作品ID"] || item.record_id}: ${analysisError.message}`,
          );
        }
      }

    } catch (error) {
      await updateRecord(
        token,
        appToken,
        table.table_id,
        item.record_id,
        fieldsSubset({ "采集状态": "失败", "错误原因": error.message }, fieldNames),
      ).catch(() => {});
      console.error(`[失败] ${source}: ${error.message}`);
    }
  }
  return pending.length;
}

async function buildContext() {
  loadLocalEnv();
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_APP_TOKEN;
  const tableName = process.env.FEISHU_TABLE_NAME || "采集库";
  if (!appId || !appSecret || !appToken) {
    throw new Error("缺少飞书本机配置");
  }
  const token = await tenantToken(appId, appSecret);
  const table = await findTable(token, appToken, tableName);
  const fields = await listFields(token, appToken, table.table_id);
  return { token, appToken, table, fields };
}

async function main() {
  let context = await buildContext();
  if (process.argv.includes("--once")) {
    await runOnce(context);
    return;
  }
  const intervalArg = process.argv.find((arg) => arg.startsWith("--interval="));
  const intervalSeconds = Math.max(
    5,
    Number(intervalArg?.split("=")[1] || DEFAULT_INTERVAL_SECONDS),
  );
  console.log(`已开始监听“${context.table.name}”，每 ${intervalSeconds} 秒检查一次`);
  let contextCreatedAt = Date.now();
  while (true) {
    if (Date.now() - contextCreatedAt > 60 * 60 * 1000) {
      context = await buildContext();
      contextCreatedAt = Date.now();
      console.log("[监听] 已自动刷新飞书访问凭证");
    }
    try {
      await runOnce(context);
    } catch (error) {
      if (String(error.message).includes("Invalid access token")) {
        context = await buildContext();
        contextCreatedAt = Date.now();
        console.log("[监听] 飞书访问凭证已失效，刷新后重试");
        await runOnce(context);
      } else {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
