# 流光 Android

Android 版以仓库中的 iOS 客户端为产品基准：两端使用相同的首次配置步骤、主导航、采集状态、采集库、设置分组和快捷工具。Android 只保留系统层面的必要差异，例如 Android Keystore、系统分享入口、MediaStore 相册写入和返回键。

## 跨端一致性

- 首次配置均为 4 屏：准备说明、飞书应用、飞书 Base、火山语音；
- 主导航均为“采集 / 采集库 / 设置”；
- 采集页使用同样的分享文本输入、抖音链接识别、提交禁用状态和完成反馈；
- 采集库直接读取用户自己的飞书多维表格，并展示进行中任务、空状态、记录卡片和字段详情；
- 快捷工具均包含无水印视频保存、逐字稿提取和提词器；
- 设置按飞书应用、目标表格、火山语音三项独立编辑，清除凭证前二次确认。

Android 不再要求配置远程任务节点。抖音解析、媒体准备、火山转写和飞书读写与 iOS 一样在 App 进程内执行，因此长视频处理期间需要保持流光在前台。

## 安全边界

飞书 App Secret 与火山语音 API Key 使用 Android Keystore 中的 AES-GCM 密钥加密，应用禁止云备份。敏感值不会在设置列表中回显，也不会上传到开发者服务器。每位使用者必须配置自己的飞书和火山服务账号。

## 开发环境

准备 JDK 17、Android SDK Platform 37 和 Build Tools 36.0.0。工程使用 Gradle Wrapper，不需要另装 Gradle。

Apple Silicon Mac 上的命令行环境：

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export ANDROID_SDK_ROOT="$ANDROID_HOME"
```

构建与测试：

```bash
cd android
./gradlew testDebugUnitTest assembleDebug
```

Debug APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`，安装命令：

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 首次配置

1. 填写飞书自建应用的 App ID 与 App Secret；
2. 粘贴目标多维表格的完整 Base 链接；
3. 填写火山引擎豆包语音“快捷 API 接入”页面生成的 API Key；
4. 保存并进入工作台。

仓库不包含任何用户凭证或发布签名。制作 Release APK/AAB 前，应在本机或 CI 密钥库中配置独立签名，不要提交 `.jks`、`.keystore`、密码或 `local.properties`。
