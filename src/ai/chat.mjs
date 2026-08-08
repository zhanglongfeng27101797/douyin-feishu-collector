import { CollectorError } from "../core/errors.mjs";
import { aiHttpRequest } from "../core/http.mjs";

const PROVIDERS = {
  openrouter: {
    keyName: "OPENROUTER_API_KEY",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
  },
  dashscope: {
    keyName: "DASHSCOPE_API_KEY",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
};

const DEFAULT_MODELS = {
  openrouter: {
    analysis: "qwen/qwen3.7-flash",
    review: "qwen/qwen3.7-flash",
    verify: "openai/gpt-oss-20b",
  },
  dashscope: {
    analysis: "qwen3.7-flash-2026-07-15",
    review: "qwen3.7-flash-2026-07-15",
    verify: "qwen3.7-plus",
  },
};

const DEFAULT_FALLBACK_MODELS = {
  openrouter: {
    analysis: ["openai/gpt-oss-20b", "deepseek/deepseek-v4-flash"],
    review: ["openai/gpt-oss-20b"],
    verify: ["qwen/qwen3.7-flash"],
  },
};

function modelList(value) {
  return String(value || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function configuredProviderName() {
  const requested = String(process.env.AI_PROVIDER || "auto").trim().toLowerCase();
  if (requested !== "auto" && !PROVIDERS[requested]) {
    throw new CollectorError(`不支持的 AI_PROVIDER: ${requested}`, {
      code: "invalid_ai_provider",
      retryable: false,
    });
  }
  if (requested !== "auto") return requested;
  if (process.env.OPENROUTER_API_KEY?.trim()) return "openrouter";
  if (process.env.DASHSCOPE_API_KEY?.trim()) return "dashscope";
  return null;
}

export function getChatProvider({ requiredFor = "调用文本模型" } = {}) {
  const name = configuredProviderName();
  if (!name) {
    throw new CollectorError(
      `缺少 OPENROUTER_API_KEY 或 DASHSCOPE_API_KEY，无法${requiredFor}`,
      { code: "missing_ai_config", retryable: false },
    );
  }
  const definition = PROVIDERS[name];
  const apiKey = process.env[definition.keyName]?.trim();
  if (!apiKey) {
    throw new CollectorError(`AI_PROVIDER=${name}，但缺少 ${definition.keyName}`, {
      code: "missing_ai_config",
      retryable: false,
    });
  }
  const baseUrlName = `${name.toUpperCase()}_BASE_URL`;
  const baseUrl = (process.env[baseUrlName] || definition.defaultBaseUrl).replace(
    /\/$/,
    "",
  );
  return { name, apiKey, baseUrl };
}

export function getChatModel(purpose, providerName) {
  const purposeName = String(purpose).toUpperCase();
  const providerPrefix = providerName === "openrouter" ? "OPENROUTER" : "BAILIAN";
  return (
    process.env[`${providerPrefix}_${purposeName}_MODEL`] ||
    DEFAULT_MODELS[providerName]?.[purpose]
  );
}

export function getChatFallbackModels(purpose, providerName) {
  const purposeName = String(purpose).toUpperCase();
  const providerPrefix = providerName === "openrouter" ? "OPENROUTER" : "BAILIAN";
  const pluralName = `${providerPrefix}_${purposeName}_FALLBACK_MODELS`;
  if (Object.hasOwn(process.env, pluralName)) {
    return modelList(process.env[pluralName]);
  }
  return [
    ...modelList(process.env[`${providerPrefix}_${purposeName}_FALLBACK_MODEL`]),
    ...(DEFAULT_FALLBACK_MODELS[providerName]?.[purpose] || []),
  ];
}

export function getChatFallbackModel(purpose, providerName) {
  return getChatFallbackModels(purpose, providerName)[0] || null;
}

async function requestJsonModel({ provider, model, messages, validate }) {
  const response = await aiHttpRequest(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${provider.name} ${model} 调用失败: ${payload?.error?.message || payload?.message || `HTTP ${response.status}`}`,
    );
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${provider.name} ${model} 未返回内容`);
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(`${provider.name} ${model} 没有返回有效 JSON`);
  }
  if (validate && !validate(value)) {
    throw new Error(`${provider.name} ${model} 返回内容未通过业务校验`);
  }
  return value;
}

export async function callJsonModel({ purpose, messages, validate = null }) {
  const provider = getChatProvider();
  const primaryModel = getChatModel(purpose, provider.name);
  const models = [
    ...new Set([
      primaryModel,
      ...getChatFallbackModels(purpose, provider.name),
    ].filter(Boolean)),
  ];
  const errors = [];
  for (const model of models) {
    try {
      const value = await requestJsonModel({ provider, model, messages, validate });
      if (model !== primaryModel) {
        console.warn(`[模型回退] ${primaryModel} 未通过，已使用 ${model}`);
      }
      return { value, model, provider: provider.name };
    } catch (error) {
      errors.push(error);
    }
  }
  throw new Error(errors.map((error) => error.message).join("；"));
}
