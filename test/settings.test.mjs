import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readLocalSettings,
  saveLocalSettings,
} from "../src/config/local-settings.mjs";
import { provisionFeishuTable } from "../src/feishu/bootstrap.mjs";

const ENV_NAMES = [
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "FEISHU_APP_TOKEN",
  "FEISHU_BASE_NAME",
  "FEISHU_TABLE_NAME",
  "OPENROUTER_API_KEY",
];

async function withCleanRuntime(operation) {
  const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  try {
    return await operation();
  } finally {
    for (const [name, value] of previous) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("页面配置写入本机文件但读取接口不回显密钥", async () => {
  await withCleanRuntime(async () => {
    const directory = await mkdtemp(join(tmpdir(), "collector-settings-"));
    const filePath = join(directory, ".env.local");
    try {
      await saveLocalSettings(
        {
          feishuAppId: "cli_test",
          feishuAppSecret: "secret-value",
          feishuAppToken: "app-token",
          feishuBaseName: "抖音内容采集库",
          feishuTableName: "采集库",
          openrouterApiKey: "sk-test",
        },
        { filePath },
      );
      await saveLocalSettings(
        {
          feishuAppId: "cli_test",
          feishuAppSecret: "",
          feishuTableName: "新采集库",
        },
        { filePath },
      );
      const settings = await readLocalSettings({ filePath });
      assert.equal(settings.values.feishuAppId, "cli_test");
      assert.equal(settings.secrets.feishuAppSecret, true);
      assert.equal(settings.secrets.openrouterApiKey, true);
      assert.equal("feishuAppSecret" in settings.values, false);
      const savedSource = await readFile(filePath, "utf8");
      assert.match(savedSource, /FEISHU_APP_SECRET=secret-value/);
      assert.match(savedSource, /FEISHU_TABLE_NAME=新采集库/);
      assert.equal((await stat(filePath)).mode & 0o777, 0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

test("App Token 留空时创建多维表格并初始化默认数据表", async () => {
  const calls = [];
  const result = await provisionFeishuTable(
    { appId: "app", appSecret: "secret", tableName: "采集库" },
    {
      tenantToken: async () => "token",
      createBitable: async () => ({
        app_token: "app-new",
        default_table_id: "tbl-new",
        url: "https://example.feishu.cn/base/app-new",
      }),
      renameTable: async (...args) => calls.push(["rename", ...args.slice(1)]),
      listFields: async () => [{ field_id: "fld-primary", field_name: "文本", type: 1 }],
      ensureFieldsInContext: async (context, definitions, options) => {
        calls.push(["fields", context.appToken, definitions.length, options.renameOnlyFieldTo]);
      },
      onAppTokenResolved: async (config) => calls.push(["persist", config.appToken]),
    },
  );
  assert.equal(result.createdBase, true);
  assert.equal(result.appToken, "app-new");
  assert.deepEqual(calls[0], ["persist", "app-new"]);
  assert.deepEqual(calls[1], ["rename", "app-new", "tbl-new", "采集库"]);
  assert.equal(calls[2][0], "fields");
});

test("已有多维表格缺少目标数据表时只新增数据表", async () => {
  let createdBase = false;
  const result = await provisionFeishuTable(
    {
      appId: "app",
      appSecret: "secret",
      appToken: "app-existing",
      tableName: "采集库",
    },
    {
      tenantToken: async () => "token",
      createBitable: async () => {
        createdBase = true;
      },
      listTables: async () => [{ table_id: "tbl-other", name: "其他表" }],
      createTable: async () => ({ table_id: "tbl-created" }),
      listFields: async () => [],
      ensureFieldsInContext: async () => {},
    },
  );
  assert.equal(createdBase, false);
  assert.equal(result.createdTable, true);
  assert.equal(result.tableId, "tbl-created");
});
