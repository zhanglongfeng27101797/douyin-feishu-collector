import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showDisconnectConfirmation = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("运行方式") {
                LabeledContent("处理位置", value: "远程任务节点")
                Text("App 和快捷指令只提交任务。下载、转写、分析与飞书写入均由你的节点完成。")
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
        .confirmationDialog("确定清除任务节点配置？", isPresented: $showDisconnectConfirmation) {
            Button("清除配置", role: .destructive) {
                do { try model.disconnect() } catch { errorMessage = error.localizedDescription }
            }
        }
    }
}

