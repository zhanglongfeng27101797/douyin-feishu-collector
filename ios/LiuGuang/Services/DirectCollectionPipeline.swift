import Foundation

struct CollectionOutcome: Sendable {
    let title: String
    let recordID: String
}

final class DirectCollectionPipeline: Sendable {
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
        progress: @escaping @MainActor @Sendable (CollectionJob.Stage, Int, String?, String?) -> Void
    ) async throws -> CollectionOutcome {
        guard configuration.speechProvider == .volcengine else {
            throw PipelineError.unsupportedSpeechProvider
        }

        await progress(.metadata, 8, nil, nil)
        async let preparedContext = feishu.prepare(configuration: configuration)
        async let parsedMetadata = douyin.collect(from: source)
        let (context, metadata) = try await (preparedContext, parsedMetadata)

        await progress(.archive, 28, metadata.title, nil)
        var initialFields = metadata.feishuFields
        initialFields["抖音分享内容（粘贴这里）"] = source
        let recordID = try await feishu.createRecord(context: context, values: initialFields)

        do {
            await progress(.media, 42, metadata.title, recordID)
            let prepared = try await media.prepareWAV(videoURLs: metadata.videoURLs)
            defer { prepared.cleanup() }

            await progress(.transcript, 67, metadata.title, recordID)
            let transcript = try await speech.transcribe(
                wavURL: prepared.url,
                apiKey: configuration.speechAPIKey
            )

            await progress(.archive, 90, metadata.title, recordID)
            try await feishu.updateRecord(context: context, recordID: recordID, values: transcript.feishuFields)
            await progress(.completed, 100, metadata.title, recordID)
            return CollectionOutcome(title: metadata.title, recordID: recordID)
        } catch {
            try? await feishu.updateRecord(
                context: context,
                recordID: recordID,
                values: [
                    "采集状态": "失败",
                    "转写状态": "失败",
                    "转写错误原因": error.localizedDescription
                ]
            )
            throw error
        }
    }
}
