import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  callJsonModel,
  getChatFallbackModels,
  getChatModel,
  getChatProvider,
} from "../src/ai/chat.mjs";
import {
  transcriptQualityIssues,
  transcribeWithOpenRouter,
} from "../src/ai/openrouter.mjs";
import { analyzeTranscript } from "../src/ai/analysis.mjs";
import { collectCloudTranscripts } from "../src/ai/transcription.mjs";

async function withEnvironment(values, callback) {
  const previous = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );
  for (const [name, value] of Object.entries(values)) {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function withFetch(mock, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = original;
  }
}

test("auto 模式优先选择已配置的 OpenRouter", { concurrency: false }, async () => {
  await withEnvironment(
    {
      AI_PROVIDER: "auto",
      OPENROUTER_API_KEY: "test-openrouter-key",
      DASHSCOPE_API_KEY: "test-dashscope-key",
    },
    async () => {
      assert.equal(getChatProvider().name, "openrouter");
    },
  );
});

test("OpenRouter 文本模型使用统一 JSON 调用", { concurrency: false }, async () => {
  await withEnvironment(
    {
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "test-openrouter-key",
      OPENROUTER_ANALYSIS_MODEL: "test/model",
    },
    async () => {
      await withFetch(async (url, options) => {
        assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
        assert.equal(options.headers.authorization, "Bearer test-openrouter-key");
        assert.equal(JSON.parse(options.body).model, "test/model");
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }, async () => {
        const result = await callJsonModel({
          purpose: "analysis",
          messages: [{ role: "user", content: "test" }],
        });
        assert.deepEqual(result.value, { ok: true });
        assert.equal(result.provider, "openrouter");
      });
    },
  );
});

test("内容分析默认使用低成本 Qwen 模型", { concurrency: false }, async () => {
  await withEnvironment(
    { OPENROUTER_ANALYSIS_MODEL: null },
    async () => {
      assert.equal(
        getChatModel("analysis", "openrouter"),
        "qwen/qwen3.7-flash",
      );
    },
  );
});

test("内容分析提示词适用于通用短视频而非固定行业", { concurrency: false }, async () => {
  await withEnvironment(
    {
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "test-openrouter-key",
      OPENROUTER_ANALYSIS_MODEL: "test/model",
    },
    async () => {
      await withFetch(async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.match(body.messages[0].content, /短视频内容结构分析员/);
        assert.doesNotMatch(body.messages[0].content, /母婴科普短视频/);
        return new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: JSON.stringify({
                  hook: "第一次去斯里兰卡应该注意什么？",
                  hookTypes: ["问题提问"],
                  theme: "斯里兰卡旅行准备",
                  coreKnowledge: "提前确认签证、交通和当地支付方式。",
                }),
              },
            }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }, async () => {
        const result = await analyzeTranscript(
          "第一次去斯里兰卡应该注意什么？提前确认签证、交通和当地支付方式。",
        );
        assert.equal(result["主题"], "斯里兰卡旅行准备");
      });
    },
  );
});

test("内容分析支持可配置的多模型备用链", { concurrency: false }, async () => {
  await withEnvironment(
    {
      OPENROUTER_ANALYSIS_FALLBACK_MODEL: "legacy/model",
      OPENROUTER_ANALYSIS_FALLBACK_MODELS: "test/one, test/two",
    },
    async () => {
      assert.deepEqual(getChatFallbackModels("analysis", "openrouter"), [
        "test/one",
        "test/two",
      ]);
    },
  );
});

test("文本模型业务校验失败时回退高质量模型", { concurrency: false }, async () => {
  const models = [];
  await withEnvironment(
    {
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "test-openrouter-key",
      OPENROUTER_ANALYSIS_MODEL: "test/lite",
      OPENROUTER_ANALYSIS_FALLBACK_MODEL: "test/flash",
    },
    async () => {
      await withFetch(async (_url, options) => {
        const model = JSON.parse(options.body).model;
        models.push(model);
        const content = model === "test/lite" ? '{"ok":false}' : '{"ok":true}';
        return new Response(
          JSON.stringify({ choices: [{ message: { content } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }, async () => {
        const result = await callJsonModel({
          purpose: "analysis",
          messages: [{ role: "user", content: "test" }],
          validate: (value) => value.ok === true,
        });
        assert.deepEqual(result.value, { ok: true });
        assert.equal(result.model, "test/flash");
      });
    },
  );
  assert.deepEqual(models, ["test/lite", "test/flash"]);
});

test("OpenRouter 转写发送压缩 MP3 并返回来源", { concurrency: false }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "openrouter-test-"));
  const audioPath = join(directory, "audio.mp3");
  await writeFile(audioPath, Buffer.from("mp3-data"));
  try {
    await withEnvironment(
      {
        OPENROUTER_API_KEY: "test-openrouter-key",
        OPENROUTER_ASR_MODEL: "test/whisper",
      },
      async () => {
        await withFetch(async (url, options) => {
          assert.equal(url, "https://openrouter.ai/api/v1/audio/transcriptions");
          const body = JSON.parse(options.body);
          assert.equal(body.model, "test/whisper");
          assert.equal(body.input_audio.format, "mp3");
          assert.equal(body.input_audio.data, Buffer.from("mp3-data").toString("base64"));
          return new Response(JSON.stringify({ text: "测试逐字稿" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }, async () => {
          const result = await transcribeWithOpenRouter(audioPath);
          assert.equal(result.text, "测试逐字稿");
          assert.equal(result.source, "OpenRouter test/whisper");
        });
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("OpenRouter ASR 质量异常时回退 Large V3", { concurrency: false }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "openrouter-fallback-test-"));
  const audioPath = join(directory, "audio.mp3");
  await writeFile(audioPath, Buffer.alloc(120_000));
  const models = [];
  try {
    await withEnvironment(
      {
        OPENROUTER_API_KEY: "test-openrouter-key",
        OPENROUTER_ASR_MODEL: "test/turbo",
        OPENROUTER_ASR_FALLBACK_MODEL: "test/large",
        OPENROUTER_ASR_QUALITY_GATE: "true",
      },
      async () => {
        await withFetch(async (_url, options) => {
          const model = JSON.parse(options.body).model;
          models.push(model);
          return new Response(
            JSON.stringify({
              text: model === "test/turbo" ? "嗯" : "这是通过质量门控得到的完整逐字稿",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }, async () => {
          const result = await transcribeWithOpenRouter(audioPath);
          assert.equal(result.text, "这是通过质量门控得到的完整逐字稿");
          assert.match(result.source, /test\/large/);
        });
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  assert.deepEqual(models, ["test/turbo", "test/large"]);
});

test("ASR 质量门控识别过短和高重复文本", () => {
  assert.ok(transcriptQualityIssues("嗯", { audioBytes: 120_000 }).length > 0);
  assert.ok(
    transcriptQualityIssues("宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝宝")
      .length > 0,
  );
  assert.deepEqual(
    transcriptQualityIssues("今天介绍婴幼儿睡眠安排和常见注意事项。", {
      audioBytes: 8_000,
    }),
    [],
  );
});

test("ASR fallback 在首个服务成功后停止", async () => {
  const calls = [];
  const result = await collectCloudTranscripts("audio.mp3", {
    mode: "fallback",
    providers: [
      {
        name: "primary",
        run: async () => {
          calls.push("primary");
          return { text: "主结果", source: "primary" };
        },
      },
      {
        name: "backup",
        run: async () => {
          calls.push("backup");
          return { text: "备用结果", source: "backup" };
        },
      },
    ],
  });
  assert.deepEqual(calls, ["primary"]);
  assert.equal(result.results.length, 1);
});

test("ASR compare 显式启用时才调用全部服务", async () => {
  const calls = [];
  const providers = ["first", "second"].map((name) => ({
    name,
    run: async () => {
      calls.push(name);
      return { text: name, source: name };
    },
  }));
  const result = await collectCloudTranscripts("audio.mp3", {
    mode: "compare",
    providers,
  });
  assert.deepEqual(calls, ["first", "second"]);
  assert.equal(result.results.length, 2);
});
