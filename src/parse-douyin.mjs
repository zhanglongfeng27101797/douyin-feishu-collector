import { fileURLToPath } from "node:url";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 Mobile/15E148";

export function extractDouyinUrl(input) {
  const candidates = String(input || "").match(
    /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g,
  ) || [];
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[,!?;:)}\]]+$/u, "");
    try {
      const host = new URL(cleaned).hostname.toLowerCase();
      if (host === "douyin.com" || host.endsWith(".douyin.com")) {
        return cleaned;
      }
    } catch {
      // 继续检查下一段候选文本。
    }
  }
  throw new Error("分享内容中未找到有效的抖音链接");
}

async function resolveAwemeId(sourceUrl) {
  let current = sourceUrl;

  for (let step = 0; step < 4; step += 1) {
    const idMatch = current.match(/\/(?:video|share\/video)\/(\d{10,})/);
    if (idMatch) return { awemeId: idMatch[1], resolvedUrl: current };

    const response = await fetch(current, {
      redirect: "manual",
      headers: { "user-agent": MOBILE_UA },
    });
    const location = response.headers.get("location");
    if (!location) break;
    current = new URL(location, current).toString();
  }

  throw new Error("无法从短链接解析作品ID");
}

function findAwemeDetail(value, awemeId) {
  if (!value || typeof value !== "object") return null;
  if (
    value.aweme_id === awemeId &&
    value.author &&
    value.statistics
  ) {
    return value;
  }
  for (const child of Object.values(value)) {
    const found = findAwemeDetail(child, awemeId);
    if (found) return found;
  }
  return null;
}

function formatShanghaiTime(unixSeconds) {
  if (!unixSeconds) return null;
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(unixSeconds * 1000));
  return `${parts} +08:00`;
}

function toNoWatermarkUrl(url) {
  if (!url) return null;
  return url
    .replace("/aweme/v1/playwm/", "/aweme/v1/play/")
    .replace("/aweme/v2/playwm/", "/aweme/v2/play/");
}

async function fetchAwemeDetail(awemeId) {
  const shareUrl = `https://www.iesdouyin.com/share/video/${awemeId}/?from_ssr=1`;
  const response = await fetch(shareUrl, {
    headers: { "user-agent": MOBILE_UA },
  });
  if (!response.ok) {
    throw new Error(`抖音分享页请求失败: HTTP ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(/window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s);
  if (!match) throw new Error("页面中未找到作品数据");

  const routerData = JSON.parse(match[1].trim().replace(/;$/, ""));
  const detail = findAwemeDetail(routerData, awemeId);
  if (!detail) throw new Error("页面中未找到对应作品");
  return detail;
}

function toCollectionRecord(detail, sourceUrl) {
  const desc = detail.desc || "";
  const structuredHashtags = (detail.text_extra || [])
    .map((item) => item.hashtag_name)
    .filter(Boolean);
  const inlineHashtags = [...desc.matchAll(/#\s*([^#\s，。！？、,.!?:：;；]+)/gu)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);
  const hashtags = [...new Set([...structuredHashtags, ...inlineHashtags])];
  const stats = detail.statistics || {};
  const video = detail.video || {};
  const author = detail.author || {};

  return {
    "原始链接": sourceUrl,
    "标准链接": `https://www.douyin.com/video/${detail.aweme_id}`,
    "作品ID": detail.aweme_id,
    "标题": desc.split("\n")[0].trim(),
    "正文": desc,
    "话题标签": hashtags,
    "博主": author.nickname || null,
    "抖音号": author.short_id || author.unique_id || null,
    "博主主页": author.sec_uid
      ? `https://www.douyin.com/user/${author.sec_uid}`
      : null,
    "封面链接": video.cover?.url_list?.[0] || null,
    "视频链接": toNoWatermarkUrl(video.play_addr?.url_list?.[0]),
    "点赞数": stats.digg_count ?? null,
    "收藏数": stats.collect_count ?? null,
    "评论数": stats.comment_count ?? null,
    "分享数": stats.share_count ?? null,
    "发布时间": formatShanghaiTime(detail.create_time),
    "时长秒": video.duration ? Math.round(video.duration / 100) / 10 : null,
    "分辨率": video.width && video.height ? `${video.width}x${video.height}` : null,
    "采集时间": new Date().toISOString(),
    "采集状态": "成功",
  };
}

export async function parseDouyinShare(input) {
  const sourceUrl = extractDouyinUrl(input);
  const { awemeId } = await resolveAwemeId(sourceUrl);
  const detail = await fetchAwemeDetail(awemeId);
  return toCollectionRecord(detail, sourceUrl);
}

async function main() {
  const input = process.argv.slice(2).join(" ").trim();
  if (!input) {
    console.error('用法: npm run parse -- "抖音分享文案或链接"');
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(await parseDouyinShare(input), null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    console.error(JSON.stringify({ "采集状态": "失败", "错误原因": error.message }, null, 2));
    process.exitCode = 1;
  });
}
