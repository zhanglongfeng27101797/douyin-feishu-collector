import { callJsonModel } from "./chat.mjs";

export const HOOK_TYPES = [
  "问题提问",
  "痛点直击",
  "结果承诺",
  "数字清单",
  "风险警示",
  "反常识纠偏",
  "身份点名",
  "场景代入",
  "权威依据",
  "对比选择",
  "悬念好奇",
  "情绪共鸣",
  "利益价值",
  "案例故事",
  "热点话题",
  "直接结论",
];

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstSentences(text, limit = 3) {
  const source = cleanText(text);
  const matches = source.match(/[^。！？!?]+[。！？!?]?/g) || [];
  return matches.slice(0, limit).join("").trim() || source.slice(0, 120);
}

function normalizeHook(value, transcript) {
  const source = cleanText(transcript);
  let hook = cleanText(value)
    .replace(/^原文[：:]\s*/, "")
    .replace(/^“|”$/g, "")
    .trim();
  if (!hook || !source.includes(hook)) hook = firstSentences(source);
  return hook.slice(0, 300);
}

function normalizeTypes(value) {
  const requested = Array.isArray(value) ? value : [];
  const allowed = new Set(HOOK_TYPES);
  return [...new Set(requested.map(cleanText).filter((item) => allowed.has(item)))].slice(
    0,
    3,
  );
}

function normalizeTheme(value) {
  return [...cleanText(value).replace(/[。！？!?]+$/g, "")].slice(0, 20).join("");
}

function normalizeCoreKnowledge(value) {
  if (Array.isArray(value)) {
    const points = value
      .map((item) => cleanText(item).replace(/^\d+[.、．]\s*/, ""))
      .filter(Boolean)
      .slice(0, 6);
    return points.map((item, index) => `${index + 1}. ${item}`).join("\n");
  }
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 3000);
}

function normalizeAnalysis(value, transcript) {
  return {
    "开头钩子": normalizeHook(value?.hook, transcript),
    "钩子类型": normalizeTypes(value?.hookTypes),
    "主题": normalizeTheme(value?.theme),
    "核心知识点": normalizeCoreKnowledge(
      value?.coreKnowledge ?? value?.corePoints,
    ),
  };
}

function isCompleteAnalysis(value, transcript) {
  const normalized = normalizeAnalysis(value, transcript);
  return Boolean(
    normalized["开头钩子"] &&
      normalized["钩子类型"].length &&
      normalized["主题"] &&
      normalized["核心知识点"],
  );
}

export async function analyzeTranscript(
  transcript,
  { title = "", description = "", hashtags = "" } = {},
) {
  const source = cleanText(transcript);
  if (!source) throw new Error("逐字稿为空，无法分析");

  const system = `你是母婴科普短视频的内容结构分析员。输入中的“最终逐字稿”是唯一知识事实来源；标题、正文和话题仅用于理解语境，不能据此补充逐字稿没有讲过的知识。

请严格完成四项任务：
1. hook：从逐字稿开头逐字复制1至3个连续完整句子，通常15至80字。不得润色、改写、补词或纠错；提取到观众已经知道为什么要继续看为止。纯寒暄可以跳过，但提取内容必须是逐字稿中连续存在的原文。若没有明显钩子，也提取开头最能代表切入方式的原句。
2. hookTypes：根据表达结构选择1个主要类型，最多再选2个辅助类型。只能从以下标签选择：${HOOK_TYPES.join("、")}。主题词不是钩子类型。
3. theme：用一句不超过20个汉字的话提炼视频的核心主题，像一个准确、简洁的内容标题。直接说“这条视频主要讲什么”，不要使用“帮助……通过……解决……”等模板长句，不写句号，不得加入原稿没有的观点。示例：“夏天坐月子的注意事项”“大基数减肥的心态与方法”“四项B超指标判断顺产条件”。
4. coreKnowledge：提炼最有复用价值的干货，并服从原视频本身的结构。若原稿明确在讲多个并列知识、指标、方法或步骤，使用“1. 2. 3.”分点；若原稿围绕同一件事进行因果解释、层层递进、观点论证或故事叙述，则写成一至数个连贯的精炼段落，保留“起因—发展—判断—结论”的关系，禁止为了整齐强行分点。无论采用哪种结构，都要保留原稿中的数字、前提、例外、风险条件和不确定语气，删除重复、语气词和关注引导。医学知识不得擅自补充、纠正或绝对化。原稿疑似识别错误时，保守写成“原稿表述为……”，不要猜测。

只返回严格JSON，不要解释：
{"hook":"原文","hookTypes":["标签"],"theme":"一句话主题","coreKnowledge":"根据原稿结构生成的分点内容或递进段落"}`;

  const { value: parsed, model, provider } = await callJsonModel({
    purpose: "analysis",
    validate: (value) => isCompleteAnalysis(value, source),
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `视频标题：${cleanText(title)}\n视频正文：${cleanText(description)}\n话题标签：${cleanText(hashtags)}\n\n最终逐字稿：\n${source}`,
      },
    ],
  });

  const result = normalizeAnalysis(parsed, source);
  if (!result["开头钩子"] || !result["钩子类型"].length) {
    throw new Error(`${model} 返回的钩子分析不完整`);
  }
  if (!result["主题"] || !result["核心知识点"]) {
    throw new Error(`${model} 返回的主题或核心知识点为空`);
  }
  return { ...result, model: `${provider} ${model}` };
}
