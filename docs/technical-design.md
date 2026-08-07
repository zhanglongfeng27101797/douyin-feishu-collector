# 技术设计与配置参考

本文面向维护者和二次开发者，记录系统边界、代码结构、处理状态、存储、性能策略、配置项和扩展方式。普通使用者请先阅读项目根目录的 [README](../README.md)。

## 设计目标

- 单机单进程即可运行，降低部署和维护成本。
- 飞书作为业务数据主存储，不额外引入数据库。
- 外部服务失败时可以分类、重试和恢复，避免永久卡在“处理中”。
- 媒体只读取一次，同时生成转写音频和可选归档文件。
- 模型、媒体保存和飞书配置可替换，不把具体供应商固化在业务流程中。
- 保留旧环境文件和命令行入口，页面配置作为增量能力。

## 系统边界

系统保持单体部署，内部按职责分层：

```text
入口（app / web / watch / collect / setup）
                ↓
应用服务与流水线编排（web/application / pipeline）
                ↓
飞书、AI、媒体和抖音适配器（feishu / ai / media）
                ↓
配置、错误模型和 HTTP 传输（config / core）
```

入口只负责加载配置和启动用例；流水线控制阶段顺序、租约和失败聚合；外部 API 细节留在适配器中。

## 目录结构

```text
src/
  ai/                    转写、校对、分析和模型适配
  config/                环境加载、运行参数和本机设置写入
  core/                  错误分类和统一 HTTP 请求策略
  feishu/                飞书 API、字段、附件和初始化
  media/                 下载候选、FFmpeg 音频与视频准备
  pipeline/              任务状态和采集阶段编排
  web/
    domain/              页面数据契约和任务状态映射
    application/         页面用例与飞书数据编排
    http/                路由、响应头和静态文件
    public/              页面、语言包、交互和样式
  app.mjs                页面与监听器统一入口
  collect-to-feishu.mjs  单条采集入口
  parse-douyin.mjs       分享文本和作品解析
  setup-fields.mjs       字段初始化入口
  watch-feishu.mjs       飞书轮询入口
scripts/                 维护和静态检查脚本
test/                    不依赖真实云凭证的自动化测试
deploy/macos/            LaunchAgent 后台运行模板
```

## 处理流程

```text
页面或飞书写入分享文本
          ↓
提取抖音链接并按作品 ID 去重
          ↓
解析元数据、封面和媒体候选地址
          ↓
领取任务租约并写入当前阶段
          ↓
单次读取媒体 → 32 kbps MP3 → ASR → 可选校对
          ↓
逐字稿质量门控与模型降级
          ↓
内容结构分析
          ↓
上传封面和可选视频 → 写入完成状态 → 清理临时文件
```

每个阶段只处理自己的输入和输出。最后一次状态写入中断时，监听器会识别已有完整结果并补写成功状态，而不是重新消耗模型额度。

## 任务状态、租约与重试

任务通过飞书字段保存以下运行信息：

- 任务状态和当前处理阶段
- 执行 ID 和租约截止时间
- 尝试次数、下次重试时间和错误代码
- 面向用户的错误原因

有效租约会阻止多个轮询同时处理同一记录。租约过期后，其他进程可以接管。临时网络、限流和服务端错误进入指数退避；无效输入和缺少运行配置属于不可重试错误。达到最大尝试次数后停止自动重试，用户可以修正问题后从页面重新排队。

## 存储设计

系统不挂载独立数据库：

| 数据 | 存储位置 | 生命周期 |
| --- | --- | --- |
| 输入、状态和重试信息 | 飞书多维表格记录 | 持久 |
| 元数据、逐字稿和分析结果 | 飞书多维表格字段 | 持久 |
| 封面和可选视频 | 飞书云盘附件 | 按飞书空间策略 |
| 运行配置和密钥 | `.env.local` 或 `ENV_FILE` 指定文件 | 本机持久，权限 `0600` |
| 源媒体、音频和待上传视频 | 操作系统临时目录 | 正常完成或失败后删除 |
| 主题偏好 | 浏览器 `localStorage` | 当前浏览器 |

页面不缓存业务记录。进程被强制结束时，操作系统临时目录可能短期残留媒体文件，但它们不是业务主数据。

## 飞书表格设计

一条作品对应一条飞书记录，不按处理阶段拆表。字段分为：

- 任务输入和作品标识
- 标题、作者、发布时间、互动数据、话题和媒体信息
- 视频逐字稿及其来源
- 开头钩子、钩子类型、主题和核心知识点
- 任务阶段、租约、尝试次数和错误信息
- 封面与可选视频附件

保持单表可以避免跨表关联、分布式幂等和迁移成本。数据量明显增长后，优先把完成时间较久的记录归档到历史表，而不是按流水线阶段拆分。

飞书初始化支持两种方式：

1. 已有 `FEISHU_APP_TOKEN`：查找目标数据表并补齐字段。
2. App Token 为空：创建多维表格，重命名默认数据表并补齐字段，然后把生成的 token 写回本机配置。

字段创建之间保留短暂间隔，降低连续写入触发飞书限流的概率。

## 媒体策略

### 候选地址与恢复

解析器会收集多个视频候选地址，按码率和分辨率排序并去重。下载、TLS 或音轨提取失败时自动切换下一个地址；全部失效时只重新解析作品一次，避免无限循环。

### 单次媒体读取

FFmpeg 从同一输入流生成：

- 供 ASR 使用的 32 kbps MP3
- 可选的飞书归档视频

`none` 不生成归档文件；`feishu_compressed` 生成兼容的 720p H.264/AAC 文件；`feishu` 使用无损复制保留原视频。归档策略不改变 ASR 音频质量。

## AI 与转写策略

`ASR_MODE` 支持三种调用方式：

- `primary`：只调用第一个可用服务。
- `fallback`：首选失败或未通过质量门控后再调用下一个，默认使用。
- `compare`：调用全部已配置服务，用于兼容旧的多服务旁证流程。

OpenRouter 转写默认使用 Whisper Large V3 Turbo，检测到文本过短、长音频有效文本过少或异常重复时回退 Whisper Large V3。火山引擎和阿里云百炼可以作为替代服务。

内容分析与转写解耦，输出固定为开头钩子、钩子类型、主题和核心知识点。提示词只允许使用最终逐字稿中的事实，不针对固定行业，也不修改原逐字稿。

文本模型通过主模型和备用模型链配置。区域不可用、限流、网络失败或业务校验不通过时按顺序降级。

## Web 应用

### 接口

业务接口统一使用 POST：

| 路径 | 用途 |
| --- | --- |
| `/api/records/list` | 获取轻量任务列表和汇总 |
| `/api/records/get` | 获取当前记录的完整详情 |
| `/api/records/create` | 从页面创建采集任务 |
| `/api/records/retry` | 重新排队失败任务 |
| `/api/settings/get` | 读取非敏感设置和密钥是否存在 |
| `/api/settings/save` | 写入本机设置 |
| `/api/settings/setup` | 保存设置并创建或初始化飞书表格 |

`GET /health` 用于本地健康检查。

### 性能

- 列表接口只请求页面需要的轻量字段。
- 只有选中记录会读取完整逐字稿和分析结果。
- 前端每三秒同步，但数据签名未变化时不重建 DOM。
- 逐字稿搜索、选中标签和输入焦点不会被无变化轮询打断。
- 视频不以 Base64 或大文本形式写入表格，只使用飞书附件。

### 安全

- 默认绑定 `127.0.0.1`，不向局域网或公网开放。
- 请求体限制为 64 KiB。
- 静态资源做路径边界校验。
- 响应包含 CSP、`X-Frame-Options: DENY`、`nosniff` 和 `no-referrer`。
- 密钥只写入权限为 `0600` 的本机环境文件；读取接口只返回“是否已配置”。
- 页面输入和飞书内容在渲染前进行 HTML 转义，外部链接只接受 HTTPS。

当前服务没有用户认证，因此不要把 `WEB_HOST` 改为公网地址。需要远程访问时，应先增加认证、TLS、CSRF 防护和访问审计。

## 配置系统

配置加载顺序：

1. 当前进程环境变量。
2. `ENV_FILE` 指定的环境文件。
3. 默认 `.env.local`。
4. 代码中的安全默认值。

页面只维护高频配置；完整配置仍可写入环境文件。旧的 `.env.local`、`.env.company.local`、`ENV_FILE` 和命令行入口继续兼容。

### 飞书与页面

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `FEISHU_APP_ID` | 空 | 飞书自建应用 App ID |
| `FEISHU_APP_SECRET` | 空 | 飞书自建应用 App Secret |
| `FEISHU_APP_TOKEN` | 空 | 已有多维表格 token；自动创建时可留空 |
| `FEISHU_BASE_NAME` | `抖音内容采集库` | 自动创建的多维表格名称 |
| `FEISHU_TABLE_NAME` | `采集库` | 目标数据表名称 |
| `FEISHU_RECORD_CONCURRENCY` | `2` | 并发处理记录数，范围 1～5 |
| `WEB_HOST` | `127.0.0.1` | 页面监听地址 |
| `WEB_PORT` | `3210` | 页面监听端口 |

### 媒体和运行策略

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `VIDEO_STORAGE_MODE` | `none` | `none`、`feishu_compressed` 或 `feishu` |
| `VIDEO_ARCHIVE_MAX_WIDTH` | `720` | 压缩视频最大宽度，范围 360～2160 |
| `VIDEO_ARCHIVE_CRF` | `28` | H.264 CRF，范围 18～40，越大文件越小 |
| `FFMPEG_PATH` | 空 | 外部 FFmpeg；空值使用项目依赖 |
| `PIPELINE_LEASE_SECONDS` | `900` | 单次任务租约 |
| `PIPELINE_MAX_ATTEMPTS` | `5` | 最大尝试次数 |
| `PIPELINE_RETRY_BASE_SECONDS` | `60` | 首次退避时间 |
| `PIPELINE_RETRY_MAX_SECONDS` | `3600` | 最长退避时间 |

### HTTP

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `HTTP_TIMEOUT_MS` | `30000` | 普通请求超时 |
| `HTTP_MAX_RETRIES` | `2` | 幂等请求最大重试次数 |
| `HTTP_RETRY_BASE_MS` | `500` | HTTP 退避基础时间 |
| `HTTP_RETRY_MAX_MS` | `30000` | HTTP 单次最长退避 |
| `AI_HTTP_TIMEOUT_MS` | `180000` | AI 请求超时 |
| `MEDIA_HTTP_TIMEOUT_MS` | `600000` | 媒体传输超时 |

GET、PUT 等幂等请求允许自动重试；POST 默认不重放，避免重复创建记录或重复消耗模型额度。

### AI 与模型

| 配置项 | 说明 |
| --- | --- |
| `AI_PROVIDER` | `auto` 优先 OpenRouter，其次百炼 |
| `ASR_MODE` | `primary`、`fallback` 或 `compare` |
| `OPENROUTER_API_KEY` | OpenRouter 统一 API Key |
| `OPENROUTER_ASR_MODEL` | OpenRouter 主转写模型 |
| `OPENROUTER_ASR_FALLBACK_MODEL` | 转写质量异常时的备用模型 |
| `OPENROUTER_ASR_QUALITY_GATE` | 是否启用转写质量检测 |
| `OPENROUTER_ANALYSIS_MODEL` | 内容分析主模型 |
| `OPENROUTER_ANALYSIS_FALLBACK_MODELS` | 逗号分隔的分析备用模型链 |
| `OPENROUTER_ANALYSIS_FALLBACK_MODEL` | 兼容旧版的单一备用模型 |
| `OPENROUTER_REVIEW_MODEL` | OpenRouter 校对模型 |
| `OPENROUTER_VERIFY_MODEL` | OpenRouter 旁证模型 |
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key |
| `BAILIAN_ASR_MODEL` | 百炼转写模型 |
| `BAILIAN_REVIEW_MODEL` | 百炼校对模型 |
| `BAILIAN_VERIFY_MODEL` | 百炼旁证模型 |
| `BAILIAN_ANALYSIS_MODEL` | 百炼内容分析模型 |
| `BAILIAN_VOCABULARY_ID` | 可选热词表 ID |
| `ENABLE_TEXT_PROOFREAD` | 是否启用文本校对 |
| `VOLCENGINE_SPEECH_API_KEY` | 火山引擎新版语音 API Key |
| `VOLCENGINE_SPEECH_APP_KEY` | 火山引擎旧版 App Key |
| `VOLCENGINE_SPEECH_ACCESS_KEY` | 火山引擎旧版 Access Key |
| `VOLCENGINE_SPEECH_RESOURCE_ID` | 火山语音资源 ID |

默认值以 [`.env.example`](../.env.example) 为准。

## 运行入口

| 命令 | 说明 |
| --- | --- |
| `npm start` | 页面和监听器统一启动 |
| `npm run web` | 仅页面服务 |
| `npm run watch` | 仅飞书监听器 |
| `npm run collect -- "..."` | 单条采集 |
| `npm run parse -- "..."` | 仅解析分享文本 |
| `npm run setup:fields` | 初始化或补齐字段 |

`deploy/macos/` 提供个人版和企业版 LaunchAgent 模板。模板中的 Node 路径和项目目录必须替换为目标机器的绝对路径。

## 扩展点

- 新增 ASR：实现统一转写结果结构，并加入服务选择和降级链。
- 新增文本模型：复用聊天 JSON 调用边界和内容业务校验。
- 新增内容来源：把来源解析为流水线需要的作品元数据和媒体候选。
- 新增存储：在应用服务层实现数据接口，不把供应商 API 引入任务状态模块。
- 新增语言：在 `src/web/public/locales/` 增加语言包，通过现有 i18n 注册接口切换。
- 新增页面模块：保留 `app.js` 控制器、`dashboard-view.js` 视图和 `ui.js` 通用界面能力的边界，避免按几十行逻辑继续拆文件。

## 开发与验证

```bash
npm run check
npm test
```

测试不读取 `.env.local`，也不访问真实飞书、抖音或模型服务。当前覆盖配置写入、自动建表、任务状态、重试租约、媒体准备、模型降级、页面 API 和静态资源。

自动化测试只能证明本地控制流和回归行为；真实抖音地址、飞书权限、地区模型可用性和远程服务质量仍需在目标环境验收。
