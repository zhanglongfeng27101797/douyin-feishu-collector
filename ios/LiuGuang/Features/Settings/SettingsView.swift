import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showDisconnectConfirmation = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("账号与服务") {
                LabeledContent("凭证归属", value: "用户自有")
                Text("飞书和语音服务使用你自己的账号。敏感密钥仅保存在本机 Keychain。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Section("快捷指令") {
                Label("系统中搜索“提交到流光”", systemImage: "wand.and.stars")
                Text("可把抖音分享文本传给该动作，提交后无需等待处理完成。")
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
