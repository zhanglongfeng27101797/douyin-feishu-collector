import SwiftUI
import UIKit

struct SubmitView: View {
    @EnvironmentObject private var model: AppModel
    @State private var source = ""
    @State private var isSubmitting = false
    @State private var submittedJob: CollectionJob?
    @State private var errorMessage: String?

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
                if let url = DouyinInput.extractURL(from: source) {
                    Label(url.absoluteString, systemImage: "link")
                        .foregroundStyle(.secondary)
                } else if !source.isEmpty {
                    Text("没有识别到抖音链接").foregroundStyle(.orange)
                }
            }

            Section {
                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        Spacer()
                        if isSubmitting { ProgressView() } else { Label("开始采集", systemImage: "paperplane.fill") }
                        Spacer()
                    }
                }
                .disabled(isSubmitting || !DouyinInput.isValid(source))
            }

            Section("快捷工具") {
                NavigationLink {
                    VideoSaveView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("保存原视频")
                            Text("解析可用播放流，并保存到系统相册")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "square.and.arrow.down")
                            .foregroundStyle(Color.accentColor)
                    }
                }

                NavigationLink {
                    TranscriptExtractionView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("提取逐字稿")
                            Text("只转文字，并保存到飞书逐字稿库")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "waveform.and.mic")
                            .foregroundStyle(Color.accentColor)
                    }
                }
            }

            if submittedJob != nil {
                Section("已开始") {
                    Label("采集任务已创建", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text("请暂时保持 App 在前台。完成后，逐字稿会直接写入你的飞书多维表格。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red) }
            }
        }
        .navigationTitle("新建采集")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("粘贴") {
                    source = UIPasteboard.general.string ?? source
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            submittedJob = try await model.submit(source)
            source = ""
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
