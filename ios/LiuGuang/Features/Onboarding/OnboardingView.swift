import SwiftUI
import UIKit

struct OnboardingView: View {
    @EnvironmentObject private var model: AppModel
    @State private var step = 0
    @State private var appID = ""
    @State private var appSecret = ""
    @State private var baseURL = ""
    @State private var provider: SpeechProvider = .volcengine
    @State private var speechAPIKey = ""
    @State private var errorMessage: String?

    private let totalSteps = 4

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()
                VStack(spacing: 0) {
                    progressHeader
                    TabView(selection: $step) {
                        WelcomeStep().tag(0)
                        FeishuStep(appID: $appID, appSecret: $appSecret).tag(1)
                        BaseStep(baseURL: $baseURL).tag(2)
                        SpeechStep(provider: $provider, apiKey: $speechAPIKey).tag(3)
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .animation(.snappy, value: step)
                    footer
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var progressHeader: some View {
        VStack(spacing: 14) {
            HStack {
                Label("流光", systemImage: "sparkles")
                    .font(.headline.bold())
                    .foregroundStyle(.tint)
                Spacer()
                Text("\(step + 1) / \(totalSteps)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            ProgressView(value: Double(step + 1), total: Double(totalSteps))
                .tint(.blue)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 12)
        .background(.ultraThinMaterial)
    }

    private var footer: some View {
        VStack(spacing: 10) {
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
            HStack(spacing: 12) {
                if step > 0 {
                    Button("上一步") { step -= 1 }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                }
                Button {
                    advance()
                } label: {
                    Text(step == totalSteps - 1 ? "保存并进入工作台" : "下一步")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!currentStepIsValid)
            }
        }
        .padding(20)
        .background(.ultraThinMaterial)
    }

    private var currentStepIsValid: Bool {
        switch step {
        case 0: true
        case 1: !appID.trimmed.isEmpty && !appSecret.trimmed.isEmpty
        case 2: UserServiceConfiguration.isFeishuBaseURL(baseURL)
        default: !speechAPIKey.trimmed.isEmpty
        }
    }

    private func advance() {
        errorMessage = nil
        guard step == totalSteps - 1 else {
            step += 1
            return
        }
        do {
            try model.save(userConfiguration: UserServiceConfiguration(
                feishuAppID: appID,
                feishuAppSecret: appSecret,
                feishuBaseURL: baseURL,
                speechProvider: provider,
                speechAPIKey: speechAPIKey
            ))
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct WelcomeStep: View {
    var body: some View {
        SetupPage(
            eyebrow: "开始配置",
            title: "先准备好 3 项服务",
            subtitle: "流光不使用开发者的账号。飞书、表格和语音服务都由你自己创建，数据和费用也归你自己管理。",
            symbol: "checklist.checked"
        ) {
            FieldCard {
                SetupRequirementRow(number: "1", title: "飞书自建应用", detail: "获取 App ID 和 App Secret")
                Divider()
                SetupRequirementRow(number: "2", title: "飞书多维表格", detail: "创建表格并把应用加为协作者")
                Divider()
                SetupRequirementRow(number: "3", title: "火山引擎豆包语音", detail: "开通极速版并创建 API Key")
            }
            NavigationLink {
                SetupGuideIndexView()
            } label: {
                GuideEntryLabel(title: "先看完整配置说明", subtitle: "约 5–10 分钟，可随时回到当前进度")
            }
            .buttonStyle(.plain)
            PrivacyNote(text: "App Secret 和 API Key 只保存在当前 iPhone 的 Keychain 中。")
        }
    }
}

private struct FeishuStep: View {
    @Binding var appID: String
    @Binding var appSecret: String

    var body: some View {
        SetupPage(
            eyebrow: "第 1 步 · 飞书应用",
            title: "连接你自己的飞书",
            subtitle: "在飞书开放平台创建应用并开通多维表格权限。你的密钥只保存在当前设备。",
            symbol: "building.2.crop.circle.fill"
        ) {
            FieldCard {
                SetupTextField(title: "App ID", placeholder: "cli_xxxxxxxxx", text: $appID)
                Divider()
                VStack(alignment: .leading, spacing: 8) {
                    Label("App Secret · 安全存储", systemImage: "lock.fill")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    SecureField("粘贴 App Secret", text: $appSecret)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            NavigationLink {
                SetupGuideView(topic: .feishuApplication)
            } label: {
                GuideEntryLabel(title: "App ID 和 Secret 在哪里？", subtitle: "创建应用、开权限、发布应用")
            }
            .buttonStyle(.plain)
            PrivacyNote(text: "App Secret 会进入 iPhone Keychain，不会显示在界面、日志或上传到开发者服务器。")
        }
    }
}

private struct BaseStep: View {
    @Binding var baseURL: String

    var body: some View {
        SetupPage(
            eyebrow: "第 2 步 · 飞书表格",
            title: "选择内容写入位置",
            subtitle: "打开目标多维表格，复制浏览器地址并粘贴到下面。App 会从链接中读取 Base 信息。",
            symbol: "tablecells.badge.ellipsis"
        ) {
            FieldCard {
                SetupTextField(
                    title: "多维表格链接",
                    placeholder: "https://xxx.feishu.cn/base/...",
                    text: $baseURL,
                    keyboard: .URL
                )
            }
            if !baseURL.isEmpty {
                StatusNote(
                    passed: UserServiceConfiguration.isFeishuBaseURL(baseURL),
                    text: UserServiceConfiguration.isFeishuBaseURL(baseURL)
                        ? "已识别飞书多维表格链接"
                        : "请粘贴以 https:// 开头的飞书 Base 链接"
                )
            }
            NavigationLink {
                SetupGuideView(topic: .feishuBase)
            } label: {
                GuideEntryLabel(title: "如何准备多维表格？", subtitle: "创建表格、复制链接、添加应用协作者")
            }
            .buttonStyle(.plain)
        }
    }
}

private struct SpeechStep: View {
    @Binding var provider: SpeechProvider
    @Binding var apiKey: String

    var body: some View {
        SetupPage(
            eyebrow: "第 3 步 · 语音识别",
            title: "连接火山语音",
            subtitle: "基础版先接通我们现有后台使用的火山极速转写。其他服务商将在基础链路稳定后增加。",
            symbol: "waveform.circle.fill"
        ) {
            VStack(spacing: 12) {
                ForEach([SpeechProvider.volcengine]) { item in
                    ProviderCard(provider: item, selected: provider == item) {
                        withAnimation(.snappy) { provider = item }
                    }
                }
            }
            FieldCard {
                VStack(alignment: .leading, spacing: 8) {
                    Label("API Key · 安全存储", systemImage: "lock.fill")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    SecureField("粘贴 \(provider.title) 的 API Key", text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            NavigationLink {
                SetupGuideView(topic: .volcengineSpeech)
            } label: {
                GuideEntryLabel(title: "如何获取火山 API Key？", subtitle: "开通录音文件识别极速版")
            }
            .buttonStyle(.plain)
            PrivacyNote(text: "只保存配置，不额外发起测试请求，也不会消耗你的模型额度。")
        }
    }
}

private struct SetupRequirementRow: View {
    let number: String
    let title: String
    let detail: String

    var body: some View {
        HStack(spacing: 14) {
            Text(number)
                .font(.headline.monospacedDigit())
                .foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .background(Color.accentColor, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

private struct SetupPage<Content: View>: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    let symbol: String
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Image(systemName: symbol)
                    .font(.system(size: 42))
                    .foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 8) {
                    Text(eyebrow).font(.subheadline.bold()).foregroundStyle(.tint)
                    Text(title).font(.largeTitle.bold())
                    Text(subtitle).font(.body).foregroundStyle(.secondary)
                }
                content
            }
            .padding(24)
            .padding(.bottom, 20)
        }
        .scrollDismissesKeyboard(.interactively)
    }
}

private struct FieldCard<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) { content }
            .padding(18)
            .background(.background, in: RoundedRectangle(cornerRadius: 20))
            .shadow(color: .black.opacity(0.05), radius: 16, y: 6)
    }
}

private struct SetupTextField: View {
    let title: String
    let placeholder: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.caption.bold()).foregroundStyle(.secondary)
            TextField(placeholder, text: $text, axis: .vertical)
                .keyboardType(keyboard)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
    }
}

private struct ProviderCard: View {
    let provider: SpeechProvider
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: provider.symbol)
                    .font(.title2)
                    .foregroundStyle(selected ? Color.white : Color.accentColor)
                    .frame(width: 48, height: 48)
                    .background(selected ? Color.accentColor : Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text(provider.title).font(.headline).foregroundStyle(.primary)
                    Text(provider.subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(selected ? Color.accentColor : Color.secondary.opacity(0.45))
            }
            .padding(14)
            .background(selected ? Color.accentColor.opacity(0.08) : Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .stroke(selected ? Color.accentColor : .clear, lineWidth: 2)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct PrivacyNote: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "lock.shield.fill")
            .font(.footnote)
            .foregroundStyle(.secondary)
    }
}

private struct StatusNote: View {
    let passed: Bool
    let text: String

    var body: some View {
        Label(text, systemImage: passed ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
            .font(.footnote.bold())
            .foregroundStyle(passed ? .green : .orange)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background((passed ? Color.green : Color.orange).opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
