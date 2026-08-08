# 流光 iOS MVP

这是“轻量 iOS 客户端 + 用户自有远程任务节点”方案的第一版工程。

## 当前已包含

- SwiftUI 主界面；
- 首次连接向导；
- HTTPS 节点地址校验；
- Keychain 保存访问令牌；
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

## 联调前必须完成

当前 Node 项目已有本地 Dashboard 接口，但还没有实现 iOS 使用的、带 Bearer 鉴权的 `/v1` 远程接口。接口约定见：

- `../docs/ios-worker-openapi.yaml`
- `../docs/ios-product-requirements.md`

在任务节点实现并部署这些接口前，App 的页面可以运行，但“测试并保存”和真实任务提交不会成功。

## 安全边界

- iOS 只保存任务节点访问令牌；
- 飞书和模型服务凭证保存在用户自己的任务节点；
- 不得把 `.env.local`、`.env.company.local` 或任何真实密钥加入 iOS 工程；
- 正式节点只允许 HTTPS；`http://localhost` 仅用于模拟器调试。

