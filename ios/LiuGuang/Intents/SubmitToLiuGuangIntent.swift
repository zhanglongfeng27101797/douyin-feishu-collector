import AppIntents
import Foundation

struct SubmitToLiuGuangIntent: AppIntent {
    static let title: LocalizedStringResource = "提交到流光"
    static let description = IntentDescription("使用你自己的飞书和火山凭证，采集抖音作品并写入多维表格。")
    static let openAppWhenRun = false

    @Parameter(title: "抖音分享内容")
    var source: String

    static var parameterSummary: some ParameterSummary {
        Summary("采集 \(\.$source)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard DouyinInput.isValid(source) else {
            throw PipelineError.invalidDouyinSource
        }
        guard let configuration = try UserConfigurationStore().load() else {
            throw PipelineError.invalidResponse("请先打开流光 App 完成服务配置")
        }
        let outcome = try await DirectCollectionPipeline().run(
            source: source,
            configuration: configuration,
            progress: { _, _, _, _ in }
        )
        return .result(dialog: "采集完成：\(outcome.title)。结果已写入飞书。")
    }
}

struct LiuGuangShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SubmitToLiuGuangIntent(),
            phrases: [
                "用 \(.applicationName) 采集抖音",
                "提交到 \(.applicationName)"
            ],
            shortTitle: "提交到流光",
            systemImageName: "paperplane.fill"
        )
    }
}
