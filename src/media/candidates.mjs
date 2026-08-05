function collectUrls(value, output) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, output));
    return;
  }
  if (typeof value === "object") {
    collectUrls(value.link || value.url, output);
    return;
  }

  const text = String(value).trim();
  if (!text) return;
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      collectUrls(JSON.parse(text), output);
      return;
    } catch {
      // 不是合法 JSON 时继续按普通文本提取。
    }
  }
  const matches = text.match(/https?:\/\/[^\s，,]+/gi) || [];
  for (const match of matches) output.push(match.replace(/[)\]}。！？!?;；]+$/u, ""));
}

export function uniqueHttpUrls(...values) {
  const collected = [];
  values.forEach((value) => collectUrls(value, collected));
  const result = [];
  for (const value of collected) {
    try {
      const url = new URL(value).toString();
      if (!result.includes(url)) result.push(url);
    } catch {
      // 忽略不完整或非 HTTP(S) 的候选值。
    }
  }
  return result;
}

export function getVideoCandidates(record) {
  return uniqueHttpUrls(record?.["视频候选链接"], record?.["视频链接"]);
}

export function getCoverCandidates(record) {
  return uniqueHttpUrls(record?.["封面候选链接"], record?.["封面链接"]);
}
