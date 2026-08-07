# 抖音 → 飞书多维表格采集器

把抖音“分享 → 复制链接”得到的整段文本粘贴到本地管理页面或飞书多维表格，后台服务会自动完成链接解析、作品信息采集、压缩音频提取、语音转写和内容结构分析。

项目采用本地单体运行，业务记录与附件保存在飞书；真实飞书和模型服务密钥不会提交到仓库。

## 已实现能力

- 从混有口令、时间、话题和说明文字的分享内容中提取抖音链接。
- 获取标题、作者、作品 ID、发布时间、时长、分辨率、互动数据和话题标签。
- 按作品 ID 去重，避免重复写入。
- 默认只临时提取 32 kbps MP3 音频，不保存完整视频；可显式开启飞书视频归档。
- OpenRouter、火山引擎或百炼均可完成语音转写，按本地配置自动选择。
- 保守修正错别字和标点，不改写原句表达与语义，并清理平台尾音。
- 从逐字稿生成：开头钩子、钩子类型、20 字内主题、核心知识点。
- 本地管理页面可提交任务、查看实时阶段、结果和错误，并恢复失败任务。
- 页面支持浅色/深色主题和本机配置管理，中文文案已拆为独立语言包。
- 首次配置时可由应用自动创建飞书多维表格、数据表和所需字段。
- 同一台 Mac 可用不同环境文件同时监听个人版和企业版飞书表格。

## 工作流程

```text
飞书粘贴抖音分享文本
        ↓
轮询发现待采集记录
        ↓
提取链接并解析抖音作品数据
        ↓
写入元数据和话题标签
        ↓
单次读取视频流 → 临时提取压缩音频 → ASR → 保守校对
        ↓
写入最终逐字稿 → 生成内容结构分析字段
        ↓
上传封面 → 可选归档视频 → 删除本机临时媒体文件
```

## 目录结构

```text
src/
  ai/                               转写、校对、分析和模型适配
  config/                           环境加载与运行参数读取
  core/                             统一错误模型和 HTTP 请求策略
  feishu/                           飞书 API、字段、文件和初始化适配
  media/                            视频候选地址和 FFmpeg 媒体准备
  pipeline/                         元数据、媒体、转写、分析阶段编排
    job-state.mjs                   任务租约、状态和失败退避策略
  web/                              本地管理页面
    domain/                         页面数据契约和任务状态映射
    application/                    页面用例与飞书数据编排
    http/                           HTTP 路由、响应和静态资源
    public/                         页面入口、交互脚本和分区样式
  app.mjs                           页面与监听器统一启动入口
  collect-to-feishu.mjs             单条采集入口
  parse-douyin.mjs                  分享文本和抖音页面解析
  setup-fields.mjs                  统一字段初始化入口
  watch-feishu.mjs                  飞书轮询入口
scripts/                            静态检查脚本
test/                               不依赖真实云端凭证的单元测试
deploy/macos/                       macOS 后台运行模板
```

## 运行要求

- Node.js 18 或更高版本
- FFmpeg（由项目依赖提供；`FFMPEG_PATH` 可覆盖）
- 飞书自建应用，并具有多维表格读写及文件上传权限
- 至少配置一个语音识别服务：OpenRouter、火山引擎或阿里云百炼

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
| `FEISHU_BASE_NAME` | 自动创建时使用的多维表格名称，默认“抖音内容采集库” |
| `FEISHU_TABLE_NAME` | 监听的数据表名称，默认“采集库” |
| `FEISHU_RECORD_CONCURRENCY` | 同时处理的记录数，默认 2，范围 1～5 |
| `WEB_HOST` / `WEB_PORT` | 本地管理页面地址，默认 `127.0.0.1:3210` |
| `VIDEO_STORAGE_MODE` | `none` 默认不保存；`feishu_compressed` 归档 720p 压缩视频；`feishu` 保留旧的原视频归档能力 |
| `VIDEO_ARCHIVE_MAX_WIDTH` | 压缩归档最大宽度，默认 720，范围 360～2160 |
| `VIDEO_ARCHIVE_CRF` | H.264 质量参数，默认 28，范围 18～40；越大文件越小 |
| `FFMPEG_PATH` | 可选的外部 FFmpeg 路径；留空使用项目自带版本 |
| `PIPELINE_LEASE_SECONDS` | 单次处理租约，默认 900 秒；超时后允许自动接管 |
| `PIPELINE_MAX_ATTEMPTS` | 最大尝试次数，默认 5 |
| `PIPELINE_RETRY_BASE_SECONDS` | 第一次失败后的基础等待时间，默认 60 秒 |
| `PIPELINE_RETRY_MAX_SECONDS` | 指数退避的最长等待时间，默认 3600 秒 |
| `HTTP_TIMEOUT_MS` | 普通 HTTP 请求超时，默认 30000 毫秒 |
| `HTTP_MAX_RETRIES` | 幂等 HTTP 请求最大重试次数，默认 2 |
| `HTTP_RETRY_BASE_MS` | HTTP 指数退避基础时间，默认 500 毫秒 |
| `HTTP_RETRY_MAX_MS` | 单次 HTTP 重试最长等待时间，默认 30000 毫秒 |
| `AI_HTTP_TIMEOUT_MS` | ASR 和大模型请求超时，默认 180000 毫秒 |
| `MEDIA_HTTP_TIMEOUT_MS` | 媒体下载和上传超时，默认 600000 毫秒 |
| `AI_PROVIDER` | 文本模型提供方；`auto` 优先 OpenRouter，其次百炼 |
| `ASR_MODE` | `primary` 仅首选、`fallback` 失败降级、`compare` 调用全部服务 |
| `OPENROUTER_API_KEY` | OpenRouter 统一 API Key，可同时用于转写和内容分析 |
| `OPENROUTER_ASR_MODEL` | OpenRouter 主转写模型，默认 Whisper Large V3 Turbo |
| `OPENROUTER_ASR_FALLBACK_MODEL` | 主转写失败或未通过质量门控时使用的模型 |
| `OPENROUTER_ASR_QUALITY_GATE` | 是否检测过短、有效文本过少和异常重复，默认开启 |
| `OPENROUTER_ANALYSIS_MODEL` | OpenRouter 内容分析主模型，默认 Qwen 3.7 Flash |
| `OPENROUTER_ANALYSIS_FALLBACK_MODELS` | 逗号分隔的备用模型链；默认依次使用 GPT-OSS 20B、DeepSeek V4 Flash |
| `OPENROUTER_ANALYSIS_FALLBACK_MODEL` | 兼容旧配置的单个备用模型，会接在主模型之后 |
| `VOLCENGINE_SPEECH_API_KEY` | 火山引擎豆包语音新版 API Key |
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key |
| `BAILIAN_VOCABULARY_ID` | 可选的百炼自定义热词表 ID |

`.env.local`、`.env.company.local` 等真实配置已被 Git 忽略，禁止把密钥写进源码、README、日志或提交记录。

## 数据保存位置

项目当前不挂载独立数据库，飞书多维表格就是业务数据主存储：

| 数据 | 保存位置 | 生命周期 |
| --- | --- | --- |
| 任务输入、处理状态、重试信息 | 飞书多维表格记录 | 持久保存 |
| 元数据、逐字稿、主题、钩子和核心知识点 | 飞书多维表格字段 | 持久保存 |
| 封面、压缩视频或原视频 | 飞书云盘附件 | 按飞书空间策略保存 |
| 飞书与模型配置 | 项目目录下 `.env.local` | 本机持久保存，文件权限 `0600` |
| 下载中的源视频、压缩音频和待上传视频 | 操作系统临时目录 | 任务完成或失败后自动删除 |

页面自身不把任务数据写入浏览器存储，服务重启或更换页面不会丢失已经写入飞书的记录。若进程被强制结束，操作系统临时目录可能短期残留未清理的媒体文件，但它们不属于业务主数据。

## 架构边界

代码保持单体部署，但按职责分层：

```text
命令入口（watch / collect / setup / scripts）
        ↓
流水线编排（pipeline）
        ↓
飞书、抖音、媒体、ASR 和内容分析适配器
        ↓
统一配置、错误模型和 HTTP 传输（config / core）
```

- 入口只负责加载参数并启动用例。
- 流水线只负责阶段顺序、租约、状态和失败聚合。
- 外部系统细节保留在各自适配器中，不进入任务状态模块。
- 所有网络请求通过统一 HTTP 客户端执行。GET、PUT 等幂等请求可自动重试；POST 默认不重放，避免重复创建任务或重复消费额度。
- 飞书连接、字段适配和字段初始化统一由 `feishu/` 提供，辅助脚本不再自行拼接接口。

## 使用方法

推荐使用一个命令同时启动管理页面和飞书监听器：

```bash
npm start
```

浏览器打开 `http://127.0.0.1:3210`。页面默认只监听本机地址，不会向局域网或公网暴露飞书和模型能力。

页面右上角“设置”可以维护飞书、OpenRouter、模型和视频保存配置。已有密钥不会返回给浏览器；新密钥写入被 Git 忽略且权限为 `0600` 的本机环境文件。旧的 `.env.local`、`ENV_FILE` 和命令行配置方式继续兼容。

首次使用时可以不填写 `FEISHU_APP_TOKEN`，点击“保存并准备飞书表格”。系统会使用飞书应用身份创建一份多维表格、重命名默认数据表并补齐字段。飞书应用必须已发布，并开通创建及管理多维表格的权限。

当前不建议按处理阶段拆成多个数据表。拆表会增加关联查询、幂等写入和迁移复杂度。页面轮询已改为轻量字段列表，只有当前选中的记录会读取完整逐字稿和分析结果；后续优先按任务状态筛选监听器，并在历史数据量明显增长后把已完成记录归档到历史表。

只启动页面、不启动监听器时使用：

```bash
npm run web
```

以下命令行方式继续兼容。

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

按当前代码为目标表创建采集、转写、可选附件和内容分析字段：

```bash
npm run setup:fields
```

`setup:fields` 会一次性创建采集、媒体、转写、内容分析和任务状态字段；若目标表是刚创建的空表，还会把唯一的默认字段重命名为“抖音分享内容（粘贴这里）”。旧的 `setup:pipeline` npm 命令仍可使用，内部复用同一个统一入口，已有部署无需修改。

任务状态字段包括处理阶段、执行 ID、租约、尝试次数、下次重试时间和错误代码。监听器依靠这些字段在进程重启后恢复未完成任务；缺少字段时仍可运行，但退避信息只保存在当前进程内。

任务执行采用租约而不是永久的“处理中”标记：有效租约会让后续轮询跳过该记录，租约过期后自动恢复。临时错误按指数退避重试，达到最大次数或遇到明确的输入错误后标记为 `permanent_failed`。修正数据后可清空“任务状态”和“尝试次数”以重新进入队列。

为第二个飞书企业执行时指定环境文件：

```bash
ENV_FILE=.env.company.local npm run setup:fields
```

## 语音识别策略

推荐配置：

```text
VOLCENGINE_SPEECH_RESOURCE_ID=volc.bigasr.auc_turbo
BAILIAN_ASR_MODEL=paraformer-v2
BAILIAN_REVIEW_MODEL=qwen3.7-flash-2026-07-15
ENABLE_TEXT_PROOFREAD=false
```

默认 `ASR_MODE=fallback`：按照 OpenRouter、火山、百炼的顺序选择已配置服务，首选失败时才调用下一个，避免重复费用和等待。`primary` 只调用第一个已配置服务；旧的多服务旁证方式通过 `compare` 保留。只有证据支持时才修正最小范围的错字或标点；程序不会润色、压缩或改变原句语义。飞书只保存一个最终“视频逐字稿”。配置云服务后不会自动降级到耗时较长的本机 Whisper。

## 内容结构分析

逐字稿完成后独立生成四个字段：

- `开头钩子`：原样提取开头 1～3 句话，不编写新文案。
- `钩子类型`：从固定多选标签中选择。
- `主题`：用不超过 20 个汉字的一句话概括。
- `核心知识点`：并列知识按要点整理；因果、递进、论证或故事则使用连贯短段落。

分析步骤不会修改“视频逐字稿”。OpenRouter 与百炼可分别通过 `OPENROUTER_ANALYSIS_MODEL`、`BAILIAN_ANALYSIS_MODEL` 指定分析模型。

## macOS 后台运行

`deploy/macos/` 内提供个人版和企业版 LaunchAgent 模板。将模板中的 `__NODE_PATH__`、`__PROJECT_DIR__` 替换为本机绝对路径，再复制到 `~/Library/LaunchAgents/` 后加载。Mac 需保持开机、登录用户账户、未深度睡眠且网络可用；飞书客户端无需一直打开。

## 安全与限制

- 抖音接口和页面结构可能变化，解析逻辑需要随平台更新。
- 封面和视频源地址可能过期；如确有合规归档需求，优先设置 `VIDEO_STORAGE_MODE=feishu_compressed`，需要原文件时仍可使用旧的 `feishu`。
- 压缩归档使用 720p、H.264 CRF 28、AAC 48kbps；文件大小取决于画面复杂度，会增加本机编码开销，但不改变转写音频质量。
- OpenRouter 默认使用 Whisper Large V3 Turbo；调用失败或逐字稿过短、有效文本过少、异常重复时自动回退 Large V3。设置 `OPENROUTER_ASR_QUALITY_GATE=false` 可关闭质量门控。
- 解析器会按码率和分辨率保存多个视频候选地址；下载或音轨提取失败时自动换源，全部失效时仅重新解析该作品一次。
- 请只采集你有权处理的内容，并遵守平台规则和相关法律。
- `outputs/` 仅用于本机日志和导出，不进入 Git 仓库。

## 开发与回归检查

修改代码后先运行：

```bash
npm run check
npm test
```

单元测试不访问真实飞书、抖音或语音服务，也不读取 `.env.local`，不会在日常回归中消耗云服务额度。
