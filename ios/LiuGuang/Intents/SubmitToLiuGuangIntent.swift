import AppIntents
import Foundation

struct SubmitToLiuGuangIntent: AppIntent {
    static let title: LocalizedStringResource = "提交到流光"
    static let description = IntentDescription("把抖音分享内容提交到你的流光任务节点，任务会在后台继续处理。")
    static let openAppWhenRun = false

    @Parameter(title: "抖音分享内容")
    var source: String

    static var parameterSummary: some ParameterSummary {
        Summary("采集 \(\.$source)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard DouyinInput.isValid(source) else {
            throw WorkerAPIError.rejected("分享内容中没有识别到抖音链接")
        }
        guard let stored = try ConfigurationStore().load() else {
            throw WorkerAPIError.rejected("请先打开流光 App 配置任务节点")
        }
        let client = try WorkerAPIClient(
            configuration: stored.configuration,
            accessToken: stored.accessToken
        )
        let job = try await client.submit(source: source)
        return .result(dialog: "已提交到流光，任务编号：\(job.id)。现在可以退出快捷指令。")
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
