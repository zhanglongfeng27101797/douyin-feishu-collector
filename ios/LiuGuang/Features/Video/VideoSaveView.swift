import SwiftUI
import UIKit

struct VideoSaveView: View {
    @State private var source = ""
    @State private var isSaving = false
    @State private var showUsageNotice = false
    @State private var successMessage: String?
    @State private var errorMessage: String?

    private let service = VideoSaveService()

    var body: some View {
        Form {
            Section {
                TextEditor(text: $source)
                    .frame(minHeight: 180)
                    .overlay(alignment: .topLeading) {
                        if source.isEmpty {
                            Text("粘贴抖音分享按钮复制的完整内容……")
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8)
                                .padding(.leading, 5)
                                .allowsHitTesting(false)
                        }
                    }
            } header: {
                Text("抖音分享内容")
            } footer: {
                Text("将尝试获取作品可用的高质量播放流，并保存到系统相册。")
            }

            Section {
                Button {
                    showUsageNotice = true
                } label: {
                    HStack {
                        Spacer()
                        if isSaving {
                            ProgressView()
                        } else {
                            Label("保存原视频到相册", systemImage: "square.and.arrow.down")
                        }
                        Spacer()
                    }
                }
                .disabled(isSaving || !DouyinInput.isValid(source))
            }

            if let successMessage {
                Section {
                    Label(successMessage, systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("保存原视频")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("粘贴") {
                    source = UIPasteboard.general.string ?? source
                }
            }
        }
        .alert("使用说明", isPresented: $showUsageNotice) {
            Button("取消", role: .cancel) {}
            Button("我已知晓并继续") {
                Task { await save() }
            }
        } message: {
            Text("本功能仅用于保存你本人创作、已获作者授权，或依法允许用于个人学习交流的视频。请尊重原创和平台规则，禁止未经授权转载、传播、商用或实施其他侵权行为。因使用不当产生的责任由使用者自行承担。")
        }
    }

    @MainActor
    private func save() async {
        isSaving = true
        successMessage = nil
        errorMessage = nil
        defer { isSaving = false }

        do {
            let saved = try await service.saveToPhotoLibrary(from: source)
            let prefix = saved.author.map { "\($0) · " } ?? ""
            successMessage = "已保存：\(prefix)\(saved.title)"
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
