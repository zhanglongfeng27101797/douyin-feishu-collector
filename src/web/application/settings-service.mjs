import {
  readLocalSettings,
  saveGeneratedFeishuConfig,
  saveLocalSettings,
} from "../../config/local-settings.mjs";
import { provisionFeishuTable } from "../../feishu/bootstrap.mjs";

export function createSettingsService({
  readSettings = readLocalSettings,
  saveSettings = saveLocalSettings,
  saveGenerated = saveGeneratedFeishuConfig,
  provision = provisionFeishuTable,
  onChange = () => {},
} = {}) {
  return {
    read() {
      return readSettings();
    },

    async save(input) {
      const settings = await saveSettings(input || {});
      onChange();
      return settings;
    },

    async setup(input) {
      await saveSettings(input || {});
      const appId = process.env.FEISHU_APP_ID?.trim();
      const appSecret = process.env.FEISHU_APP_SECRET?.trim();
      if (!appId || !appSecret) throw new Error("请填写飞书 App ID 和 App Secret");

      const result = await provision(
        {
          appId,
          appSecret,
          appToken: process.env.FEISHU_APP_TOKEN?.trim() || "",
          baseName: process.env.FEISHU_BASE_NAME?.trim() || "抖音内容采集库",
          tableName: process.env.FEISHU_TABLE_NAME?.trim() || "采集库",
        },
        { onAppTokenResolved: saveGenerated },
      );
      await saveGenerated({
        appToken: result.appToken,
        tableName: result.tableName,
      });
      onChange();
      return {
        ...result,
        settings: await readSettings(),
      };
    },
  };
}
