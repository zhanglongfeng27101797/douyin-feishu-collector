import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showDisconnectConfirmation = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("服务配置") {
                NavigationLink {
                    ConfigurationEditorView(kind: .feishu)
                } label: {
                    Label("飞书应用凭证", systemImage: "building.2")
                }
                NavigationLink {
                    ConfigurationEditorView(kind: .base)
                } label: {
                    Label("目标多维表格", systemImage: "tablecells")
                }
                NavigationLink {
                    ConfigurationEditorView(kind: .speech)
                } label: {
                    Label("火山语音 API Key", systemImage: "waveform.badge.mic")
                }
                Text("哪项配置有问题，就只修改并保存该项；其他凭证不会被清除。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("配置帮助") {
                NavigationLink {
                    SetupGuideIndexView()
                } label: {
                    Label("查看完整配置教程", systemImage: "book.pages")
                }
                Text("包含飞书应用、多维表格协作者、权限发布和火山 API Key 获取步骤。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("账号与服务") {
                LabeledContent("凭证归属", value: "用户自有")
                Text("飞书和语音服务使用你自己的账号。敏感密钥仅保存在本机 Keychain。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Section("快捷指令") {
                Label("系统中搜索“提交到流光”", systemImage: "wand.and.stars")
                Text("可把抖音分享文本传给该动作，快捷指令会完成解析、转写并写入飞书。长视频处理时请保持快捷指令运行。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Section {
                Button("断开并清除本机凭证", role: .destructive) {
                    showDisconnectConfirmation = true
                }
            }
            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red) }
            }
        }
        .navigationTitle("设置")
        .confirmationDialog("确定清除本机服务配置？", isPresented: $showDisconnectConfirmation) {
            Button("清除配置", role: .destructive) {
                do { try model.disconnect() } catch { errorMessage = error.localizedDescription }
            }
        }
    }
}

private enum ConfigurationKind {
    case feishu
    case base
    case speech

    var title: String {
        switch self {
        case .feishu: "飞书应用凭证"
        case .base: "目标多维表格"
        case .speech: "火山语音"
        }
    }
}

private struct ConfigurationEditorView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss

    let kind: ConfigurationKind
    @State private var appID = ""
    @State private var appSecret = ""
    @State private var baseURL = ""
    @State private var provider: SpeechProvider = .volcengine
    @State private var speechAPIKey = ""
    @State private var errorMessage: String?
    @State private var didLoad = false

    var body: some View {
        Form {
            switch kind {
            case .feishu:
                Section {
                    TextField("App ID", text: $appID)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("App Secret", text: $appSecret)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } footer: {
                    Text("App Secret 仍只保存在本机 Keychain。")
                }
                Section("获取凭证") {
                    NavigationLink("查看飞书应用、权限与发布教程") {
                        SetupGuideView(topic: .feishuApplication)
                    }
                }
            case .base:
                Section {
                    TextField("https://xxx.feishu.cn/base/...", text: $baseURL, axis: .vertical)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } footer: {
                    Text(UserServiceConfiguration.isFeishuBaseURL(baseURL) ? "已识别飞书 Base 链接" : "请填写飞书多维表格的完整链接")
                }
                Section("表格权限") {
                    NavigationLink("查看表格链接与应用协作者教程") {
                        SetupGuideView(topic: .feishuBase)
                    }
                }
            case .speech:
                Section {
                    LabeledContent("服务商", value: provider.title)
                    SecureField("火山语音 API Key", text: $speechAPIKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } footer: {
                    Text("请填写豆包语音控制台“快捷 API 接入”页面生成的 API Key。")
                }
                Section("获取密钥") {
                    NavigationLink("查看开通与密钥获取教程") {
                        SetupGuideView(topic: .volcengineSpeech)
                    }
                    Link("打开火山引擎豆包语音控制台", destination: URL(string: "https://console.volcengine.com/speech")!)
                    Link("查看极速版接口说明", destination: URL(string: "https://www.volcengine.com/docs/6561/1631584?lang=zh")!)
                }
            }

            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red) }
            }
        }
        .navigationTitle(kind.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("保存") { save() }
                    .disabled(!isValid || !didLoad)
            }
        }
        .onAppear(perform: load)
    }

    private var isValid: Bool {
        switch kind {
        case .feishu: !appID.trimmed.isEmpty && !appSecret.trimmed.isEmpty
        case .base: UserServiceConfiguration.isFeishuBaseURL(baseURL)
        case .speech: !speechAPIKey.trimmed.isEmpty
        }
    }

    private func load() {
        guard !didLoad else { return }
        do {
            guard let configuration = try model.userConfiguration() else {
                errorMessage = "未找到现有配置"
                return
            }
            appID = configuration.feishuAppID
            appSecret = configuration.feishuAppSecret
            baseURL = configuration.feishuBaseURL
            provider = configuration.speechProvider
            speechAPIKey = configuration.speechAPIKey
            didLoad = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func save() {
        do {
            guard var configuration = try model.userConfiguration() else {
                errorMessage = "未找到现有配置"
                return
            }
            switch kind {
            case .feishu:
                configuration.feishuAppID = appID
                configuration.feishuAppSecret = appSecret
            case .base:
                configuration.feishuBaseURL = baseURL
            case .speech:
                configuration.speechProvider = provider
                configuration.speechAPIKey = speechAPIKey
            }
            try model.save(userConfiguration: configuration)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
