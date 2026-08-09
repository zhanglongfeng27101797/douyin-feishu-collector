# 流光 iOS MVP

这是“用户自带飞书与模型凭证”的轻量 iOS 客户端工程。

## 当前已包含

- SwiftUI 主界面；
- 三步首次配置向导（飞书应用、飞书表格、语音服务）；
- 支持选择火山引擎、阿里云百炼或 OpenRouter；
- App Secret 与模型 API Key 使用 Keychain 保存；
- 抖音混合分享文本识别；
- 提交任务、任务列表、详情和重试；
- App Intent“提交到流光”，可供系统快捷指令调用；
- `/v1` 任务节点 OpenAPI 契约；
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

三步配置向导和安全存储已经可运行。现有任务提交、列表与详情仍是旧的远程节点客户端，下一阶段需要用 iOS 直连适配器替换，依次接入：抖音媒体获取、语音识别、文本分析和飞书写入。

旧远程节点接口约定仍保留在：

- `../docs/ios-worker-openapi.yaml`
- `../docs/ios-product-requirements.md`

在任务节点实现并部署这些接口前，App 的页面可以运行，但“测试并保存”和真实任务提交不会成功。

## 安全边界

- iOS 保存用户自己的飞书与模型服务凭证；
- App Secret 和 API Key 只进入 Keychain；普通配置保存到 UserDefaults；
- 不得把 `.env.local`、`.env.company.local` 或任何真实密钥加入 iOS 工程；
- 不得在日志、错误上报或界面回显完整密钥。
