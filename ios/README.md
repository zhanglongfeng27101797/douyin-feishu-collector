# 流光 iOS MVP

这是“用户自带飞书与模型凭证”的轻量 iOS 客户端工程。

## 当前已包含

- SwiftUI 主界面；
- 三步首次配置向导（飞书应用、飞书表格、语音服务）；
- 基础版接入火山引擎豆包语音，其他服务商保留为后续适配器；
- App Secret 与模型 API Key 使用 Keychain 保存；
- 抖音混合分享文本识别；
- iPhone 直接解析抖音作品及基础数据；
- iPhone 本地下载临时视频、提取 16kHz 单声道 WAV，完成后立即删除；
- 火山引擎豆包录音文件极速版转写，并清理逐字稿末尾的平台尾音；
- 自动识别 Base App Token，优先使用链接中的 Table ID，否则查找“采集库”；
- 按飞书现有字段类型创建、更新记录；
- 本地任务列表、进度、详情和失败重试；
- App Intent“提交到流光”，可供系统快捷指令调用；
- 基础单元测试。

## 运行条件

1. 从 App Store 安装完整 Xcode。仅安装 Command Line Tools 无法编译 iOS App。
2. 安装 XcodeGen：

   ```bash
   brew install xcodegen
   ```

3. 生成工程：

   ```bash
   cd ios
   xcodegen generate
   open LiuGuang.xcodeproj
   ```

4. 在 Xcode 的 Signing & Capabilities 中选择自己的 Apple Developer Team。
5. 选择 iPhone 模拟器或真机运行。

## 当前开发边界

第一版先复用现有 Mac 后台的最小闭环：抖音分享文案 → 作品基础数据 → 视频音频 → 火山转写 → 飞书“采集库”。目前真正接通的语音服务是火山引擎；百炼与 OpenRouter 仍保留在配置界面，后续再接适配器。

封面附件、原视频附件、逐字稿校对、开头钩子、主题和核心知识点等增强能力暂未迁移。App 内发起任务时需要保持 App 在前台；快捷指令动作可以不打开主界面，但系统仍可能限制长视频任务的运行时间。

## 安全边界

- iOS 保存用户自己的飞书与模型服务凭证；
- App Secret 和 API Key 只进入 Keychain；普通配置保存到 UserDefaults；
- 不得把 `.env.local`、`.env.company.local` 或任何真实密钥加入 iOS 工程；
- 不得在日志、错误上报或界面回显完整密钥。
