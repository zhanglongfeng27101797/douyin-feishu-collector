function adaptValue(value, field, includeEmpty) {
  if (value == null || value === "") return includeEmpty ? value : undefined;
  if (field.type === 4) return Array.isArray(value) ? value : [String(value)];
  if (field.type === 17) return Array.isArray(value) ? value : [value];
  if (field.type === 5) return new Date(value).getTime();
  if (field.type === 15) return { link: String(value), text: String(value) };
  if (field.type === 2) return Number(value);
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

export function mapRecord(record, fields, { includeEmpty = false } = {}) {
  const byName = new Map(fields.map((field) => [field.field_name, field]));
  const mapped = {};
  for (const [name, value] of Object.entries(record)) {
    const field = byName.get(name);
    if (!field) continue;
    const adapted = adaptValue(value, field, includeEmpty);
    if (adapted !== undefined) mapped[name] = adapted;
  }
  return mapped;
}

export function fieldsSubset(values, fieldNames) {
  const allowed = new Set(fieldNames);
  return Object.fromEntries(Object.entries(values).filter(([name]) => allowed.has(name)));
}

export function getLinkValue(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.link === "string") {
    return value.link.trim();
  }
  if (Array.isArray(value)) {
    const text = value.map((item) => item?.text || item?.link || "").join("");
    return text.match(/https?:\/\/[^\s]+/i)?.[0] || "";
  }
  return "";
}

export function getShareText(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return String(value.text || value.link || "").trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => item?.text || item?.link || "").join("").trim();
  }
  return "";
}

export function getInputLink(row) {
  return (
    getShareText(row?.["抖音分享内容（粘贴这里）"]) ||
    getLinkValue(row?.["标准链接"]) ||
    getLinkValue(row?.["原始链接"])
  );
}
