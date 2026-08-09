import SwiftUI
import UIKit

struct TranscriptExtractionView: View {
    @EnvironmentObject private var model: AppModel
    @State private var source = ""
    @State private var isRunning = false
    @State private var stageTitle = ""
    @State private var progress = 0
    @State private var outcome: TranscriptExtractionOutcome?
    @State private var errorMessage: String?
    @State private var copied = false
    private let pipeline = TranscriptExtractionPipeline()

    var body: some View {
        Form {
            Section {
                TextEditor(text: $source)
                    .frame(minHeight: 150)
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
                Text("只进行逐字稿提取，不执行爆款判断、钩子分析和内容提炼。")
            }

            Section {
                Button {
                    Task { await extract() }
                } label: {
                    HStack {
                        Spacer()
                        Label("提取逐字稿", systemImage: "waveform.and.mic")
                        Spacer()
                    }
                }
                .disabled(isRunning || !DouyinInput.isValid(source))
            }

            if isRunning {
                Section("处理进度") {
                    ProgressView(value: Double(progress), total: 100)
                    Text(stageTitle).foregroundStyle(.secondary)
                    Text("请暂时保持流光在前台运行")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            if let outcome {
                Section {
                    Text(outcome.title).font(.headline)
                    if let author = outcome.author, !author.isEmpty {
                        Label(author, systemImage: "person")
                            .foregroundStyle(.secondary)
                    }
                    if outcome.reusedExisting {
                        Label("已从逐字稿库读取，没有重复消耗转写额度", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    } else {
                        Label("已保存到飞书副表“逐字稿库”", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                    Text(outcome.transcript)
                        .textSelection(.enabled)
                    Button {
                        UIPasteboard.general.string = outcome.transcript
                        copied = true
                    } label: {
                        Label(copied ? "已复制" : "复制逐字稿", systemImage: copied ? "checkmark" : "doc.on.doc")
                    }
                    Button("重新识别这条视频") {
                        Task { await extract(force: true) }
                    }
                    .disabled(isRunning)
                } header: {
                    Text("提取结果")
                }
            }

            if let errorMessage {
                Section("未能完成") {
                    Text(errorMessage).foregroundStyle(.red)
                    Text("如果提示没有建表权限，请把飞书应用在该多维表格中的权限调整为可管理，然后重试一次。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("提取逐字稿")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("粘贴") { source = UIPasteboard.general.string ?? source }
            }
        }
    }

    private func extract(force: Bool = false) async {
        guard let configuration = try? model.userConfiguration() else {
            errorMessage = "请先完成服务配置"
            return
        }
        isRunning = true
        copied = false
        errorMessage = nil
        defer { isRunning = false }
        do {
            outcome = try await pipeline.run(source: source, configuration: configuration, force: force) { stage, value in
                stageTitle = stage.title
                progress = value
            }
            progress = 100
            stageTitle = "提取完成"
        } catch {
            outcome = nil
            errorMessage = error.localizedDescription
        }
    }
}
