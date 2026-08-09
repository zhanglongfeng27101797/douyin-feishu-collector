import Foundation

struct TranscriptExtractionOutcome: Sendable {
    let title: String
    let author: String?
    let canonicalURL: String
    let transcript: String
    let recordID: String
    let reusedExisting: Bool
}

enum TranscriptExtractionStage: Sendable {
    case metadata
    case library
    case media
    case speech
    case saving

    var title: String {
        switch self {
        case .metadata: "正在解析抖音作品"
        case .library: "正在查询逐字稿库"
        case .media: "正在准备视频音频"
        case .speech: "正在识别视频内容"
        case .saving: "正在保存到飞书"
        }
    }
}

final class TranscriptExtractionPipeline: Sendable {
    private let douyin: DouyinClient
    private let feishu: FeishuClient
    private let media: MediaProcessor
    private let speech: VolcengineSpeechClient

    init(
        douyin: DouyinClient = DouyinClient(),
        feishu: FeishuClient = FeishuClient(),
        media: MediaProcessor = MediaProcessor(),
        speech: VolcengineSpeechClient = VolcengineSpeechClient()
    ) {
        self.douyin = douyin
        self.feishu = feishu
        self.media = media
        self.speech = speech
    }

    func run(
        source: String,
        configuration: UserServiceConfiguration,
        force: Bool = false,
        progress: @escaping @MainActor @Sendable (TranscriptExtractionStage, Int) -> Void
    ) async throws -> TranscriptExtractionOutcome {
        guard configuration.speechProvider == .volcengine else {
            throw PipelineError.unsupportedSpeechProvider
        }

        await progress(.metadata, 8)
        async let metadataTask = douyin.collect(from: source)
        async let contextTask = feishu.prepareTranscriptLibrary(configuration: configuration)
        let (metadata, context) = try await (metadataTask, contextTask)

        await progress(.library, 25)
        let existing = try await feishu.transcriptRecord(context: context, awemeID: metadata.awemeID)
        if !force,
           let existing,
           !existing.transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return TranscriptExtractionOutcome(
                title: metadata.title,
                author: metadata.author,
                canonicalURL: metadata.canonicalURL,
                transcript: existing.transcript,
                recordID: existing.recordID,
                reusedExisting: true
            )
        }

        let baseFields: [String: Any] = [
            "标题": metadata.title,
            "作品ID": metadata.awemeID,
            "原始分享内容": source,
            "标准链接": metadata.canonicalURL,
            "博主": metadata.author ?? "",
            "提取时间": Date(),
            "转写状态": "提取中",
            "错误原因": ""
        ]
        let recordID: String
        if let existing {
            recordID = existing.recordID
            try await feishu.updateRecord(context: context, recordID: recordID, values: baseFields)
        } else {
            recordID = try await feishu.createRecord(context: context, values: baseFields)
        }

        do {
            await progress(.media, 38)
            let prepared = try await media.prepareWAV(videoURLs: metadata.videoURLs)
            defer { prepared.cleanup() }

            await progress(.speech, 60)
            let transcript = try await speech.transcribe(wavURL: prepared.url, apiKey: configuration.speechAPIKey)

            await progress(.saving, 92)
            try await feishu.updateRecord(
                context: context,
                recordID: recordID,
                values: [
                    "视频逐字稿": transcript.text,
                    "提取时间": Date(),
                    "转写状态": "成功（需校对）",
                    "转写来源": transcript.source,
                    "错误原因": ""
                ]
            )
            return TranscriptExtractionOutcome(
                title: metadata.title,
                author: metadata.author,
                canonicalURL: metadata.canonicalURL,
                transcript: transcript.text,
                recordID: recordID,
                reusedExisting: false
            )
        } catch {
            try? await feishu.updateRecord(
                context: context,
                recordID: recordID,
                values: [
                    "提取时间": Date(),
                    "转写状态": "失败",
                    "错误原因": error.localizedDescription
                ]
            )
            throw error
        }
    }
}
