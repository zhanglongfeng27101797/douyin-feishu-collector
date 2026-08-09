import Foundation

enum PipelineError: LocalizedError {
    case invalidDouyinSource
    case cannotResolveAwemeID
    case invalidDouyinPage
    case noVideo
    case unsupportedSpeechProvider
    case invalidFeishuBaseURL
    case missingFeishuTable
    case invalidResponse(String)

    var errorDescription: String? {
        switch self {
        case .invalidDouyinSource: "分享内容中未找到有效的抖音链接"
        case .cannotResolveAwemeID: "无法从短链接解析作品 ID"
        case .invalidDouyinPage: "抖音页面中未找到作品数据"
        case .noVideo: "作品中没有可用的视频地址"
        case .unsupportedSpeechProvider: "基础版暂时只接通火山引擎豆包语音"
        case .invalidFeishuBaseURL: "飞书多维表格链接无效"
        case .missingFeishuTable: "未找到名为“采集库”的数据表"
        case .invalidResponse(let detail): detail
        }
    }
}
