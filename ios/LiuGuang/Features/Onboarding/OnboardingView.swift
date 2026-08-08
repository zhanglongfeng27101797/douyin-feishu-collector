import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var model: AppModel
    @State private var baseURL = ""
    @State private var token = ""
    @State private var isTesting = false
    @State private var verification: WorkerVerification?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Image(systemName: "sparkles.rectangle.stack.fill")
                            .font(.system(size: 46))
                            .foregroundStyle(Color.accentColor)
                        Text("连接你的流光节点")
                            .font(.title.bold())
                        Text("节点在后台完成下载、转写、分析和飞书写入。提交成功后可以立即退出 App。")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 12)
                }

                Section("任务节点") {
                    TextField("https://你的节点域名", text: $baseURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                    SecureField("访问令牌", text: $token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } footer: {
                    Text("正式使用必须填写 HTTPS 地址。令牌仅保存在本机 Keychain。")
                }

                if let verification {
                    Section("配置检查") {
                        CheckRow(title: "飞书多维表格", passed: verification.feishuConfigured)
                        CheckRow(title: "语音识别", passed: verification.speechConfigured)
                        CheckRow(title: "内容分析", passed: verification.analysisConfigured)
                        if let table = verification.tableName, !table.isEmpty {
                            LabeledContent("目标数据表", value: table)
                        }
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task { await testAndSave() }
                    } label: {
                        HStack {
                            Spacer()
                            if isTesting { ProgressView() } else { Text("测试并保存") }
                            Spacer()
                        }
                    }
                    .disabled(isTesting || baseURL.isEmpty || token.isEmpty)
                }
            }
            .navigationTitle("开始使用")
        }
    }

    private func testAndSave() async {
        isTesting = true
        defer { isTesting = false }
        do {
            let configuration = WorkerConfiguration(baseURL: baseURL)
            let client = try WorkerAPIClient(configuration: configuration, accessToken: token)
            let result = try await client.verify()
            verification = result
            guard result.isReady else {
                throw WorkerAPIError.rejected("节点可以连接，但飞书或模型服务尚未配置完整")
            }
            try model.save(configuration: configuration, token: token)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct CheckRow: View {
    let title: String
    let passed: Bool

    var body: some View {
        HStack {
            Label(title, systemImage: passed ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
            Spacer()
            Text(passed ? "已配置" : "待配置")
                .foregroundStyle(passed ? .green : .orange)
        }
    }
}

