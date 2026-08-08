import Foundation

struct CollectionJob: Codable, Identifiable, Equatable, Sendable {
    enum Status: String, Codable, Sendable {
        case queued
        case running
        case retryWait = "retry_wait"
        case succeeded
        case failed

        var title: String {
            switch self {
            case .queued: "等待处理"
            case .running: "处理中"
            case .retryWait: "等待重试"
            case .succeeded: "已完成"
            case .failed: "失败"
            }
        }
    }

    enum Stage: String, Codable, Sendable {
        case queued
        case metadata
        case media
        case transcript
        case proofread
        case analysis
        case archive
        case completed

        var title: String {
            switch self {
            case .queued: "排队"
            case .metadata: "解析作品"
            case .media: "准备媒体"
            case .transcript: "语音转写"
            case .proofread: "校对逐字稿"
            case .analysis: "分析内容"
            case .archive: "写入飞书"
            case .completed: "完成"
            }
        }
    }

    let id: String
    let status: Status
    let stage: Stage
    let source: String
    let title: String?
    let progress: Int?
    let feishuRecordId: String?
    let errorMessage: String?
    let canRetry: Bool?
    let createdAt: Date
    let updatedAt: Date
}

struct CreateJobRequest: Codable, Sendable {
    let source: String
    let clientRequestId: UUID
}

struct JobEnvelope: Codable, Sendable {
    let job: CollectionJob
}

struct JobListEnvelope: Codable, Sendable {
    let items: [CollectionJob]
}

