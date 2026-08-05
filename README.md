# 抖音 → 飞书多维表格采集器

把抖音“分享 → 复制链接”得到的整段文本粘贴到飞书多维表格，后台服务会自动完成链接解析、作品信息采集、封面与原视频上传、语音转写和母婴科普内容分析。

> 当前为本地运行的 MVP。代码可供协作者整理架构；真实飞书、阿里云和火山引擎密钥不会提交到仓库。

## 已实现能力

- 从混有口令、时间、话题和说明文字的分享内容中提取抖音链接。
- 获取标题、作者、作品 ID、发布时间、时长、分辨率、互动数据和话题标签。
- 按作品 ID 去重，避免重复写入。
- 下载封面和无水印视频流，上传为飞书附件后立即清理本机临时文件。
- 火山引擎录音文件极速版作为主听写，百炼 Paraformer 作为旁证。
- 保守修正错别字和标点，不改写原句表达与语义，并清理平台尾音。
- 从逐字稿生成：开头钩子、钩子类型、20 字内主题、核心知识点。
- 同一台 Mac 可用不同环境文件同时监听个人版和企业版飞书表格。

## 工作流程

```text
飞书粘贴抖音分享文本
        ↓
轮询发现待采集记录
        ↓
提取链接并解析抖音作品数据
        ↓
写入元数据、话题标签、封面和视频附件
        ↓
临时提取音频 → 双云 ASR → 保守校对
        ↓
写入最终逐字稿 → 生成母婴内容分析字段
        ↓
删除本机临时媒体文件
```

## 目录结构

```text
src/
  watch-feishu.mjs                 飞书轮询入口
  collect-to-feishu.mjs            单条采集与字段写入
  parse-douyin.mjs                 分享文本和抖音页面解析
  feishu-media.mjs                 封面、视频附件上传
  transcribe-media.mjs             火山/百炼/本地转写编排
  review-transcript.mjs            保守校对与尾音清理
  analyze-transcript.mjs           钩子、主题、知识点分析
  config/                           环境变量加载与配置校验
  feishu/                           飞书 API 客户端和字段适配
  pipeline/                         元数据、媒体、转写、分析阶段编排
  setup-*.mjs                      创建或调整飞书字段
scripts/                           辅助脚本与数据回填
test/                              不依赖真实云端凭证的单元测试
deploy/macos/                      macOS 后台运行模板
```

## 运行要求

- Node.js 18 或更高版本
- FFmpeg（转写时从视频流提取音频）
- 飞书自建应用，并具有多维表格读写及文件上传权限
- 至少配置一个语音识别服务：火山引擎或阿里云百炼

## 本地配置

复制示例文件并填写真实值：

```bash
cp .env.example .env.local
```

主要配置：

| 配置项 | 用途 |
| --- | --- |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | 飞书自建应用凭证 |
| `FEISHU_APP_TOKEN` | 多维表格链接中 `/base/` 后的 token |
| `FEISHU_TABLE_NAME` | 监听的数据表名称，默认“采集库” |
| `VOLCENGINE_SPEECH_API_KEY` | 火山引擎豆包语音新版 API Key |
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key |
| `BAILIAN_VOCABULARY_ID` | 可选的母婴专业热词表 ID |

`.env.local`、`.env.company.local` 等真实配置已被 Git 忽略，禁止把密钥写进源码、README、日志或提交记录。

## 使用方法

先验证分享文本能否正确提取链接：

```bash
npm run parse -- "7.12 ... https://v.douyin.com/xxxxxxxx/ 复制此链接打开抖音"
```

直接采集单条：

```bash
npm run collect -- "7.12 ... https://v.douyin.com/xxxxxxxx/ 复制此链接打开抖音"
```

持续监听飞书表格：

```bash
npm run watch
```

监听器默认读取“抖音分享内容（粘贴这里）”字段。字段必须是普通文本类型；旧字段“标准链接”和“原始链接”仍可作为备用入口。

## 飞书字段初始化

按当前代码为目标表创建封面、视频附件和内容分析字段：

```bash
node src/setup-cover-field.mjs
node src/setup-video-attachment.mjs
node src/setup-content-analysis-fields.mjs
```

为第二个飞书企业执行时指定环境文件：

```bash
ENV_FILE=.env.company.local node src/setup-content-analysis-fields.mjs
```

## 双云语音识别策略

推荐配置：

```text
VOLCENGINE_SPEECH_RESOURCE_ID=volc.bigasr.auc_turbo
BAILIAN_ASR_MODEL=paraformer-v2
BAILIAN_REVIEW_MODEL=qwen3.7-flash-2026-07-15
ENABLE_TEXT_PROOFREAD=false
```

火山结果作为主稿，Paraformer 仅作为独立旁证。只有证据支持时才修正最小范围的错字或标点；程序不会润色、压缩或改变原句语义。飞书只保存一个最终“视频逐字稿”。若只配置一个云服务，则使用可用服务；配置云服务后不会自动降级到耗时较长的本机 Whisper。

## 母婴科普内容分析

逐字稿完成后独立生成四个字段：

- `开头钩子`：原样提取开头 1～3 句话，不编写新文案。
- `钩子类型`：从固定多选标签中选择。
- `主题`：用不超过 20 个汉字的一句话概括。
- `核心知识点`：并列知识按要点整理；因果、递进、论证或故事则使用连贯短段落。

分析步骤不会修改“视频逐字稿”。模型可通过 `BAILIAN_ANALYSIS_MODEL` 单独指定。

## macOS 后台运行

`deploy/macos/` 内提供个人版和企业版 LaunchAgent 模板。将模板中的 `__NODE_PATH__`、`__PROJECT_DIR__` 替换为本机绝对路径，再复制到 `~/Library/LaunchAgents/` 后加载。Mac 需保持开机、登录用户账户、未深度睡眠且网络可用；飞书客户端无需一直打开。

## 安全与限制

- 抖音接口和页面结构可能变化，解析逻辑需要随平台更新。
- 封面和视频源地址可能过期，飞书附件才是持久保存结果。
- 请只采集你有权处理的内容，并遵守平台规则和相关法律。
- `outputs/` 仅用于本机日志和导出，不进入 Git 仓库。

## 开发与回归检查

修改代码后先运行：

```bash
npm run check
npm test
```

单元测试不访问真实飞书、抖音或语音服务，也不读取 `.env.local`。对接真实云服务的脚本保留在 `scripts/` 中，需要明确指定时才会运行，避免日常测试误消耗额度。
