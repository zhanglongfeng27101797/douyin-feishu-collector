import Foundation

enum SpeechProvider: String, Codable, CaseIterable, Identifiable, Sendable {
    case volcengine
    case bailian
    case openRouter

    var id: String { rawValue }

    var title: String {
        switch self {
        case .volcengine: "火山引擎豆包语音"
        case .bailian: "阿里云百炼 Paraformer"
        case .openRouter: "OpenRouter Whisper"
        }
    }

    var subtitle: String {
        switch self {
        case .volcengine: "国内推荐，额度充足、中文识别稳定"
        case .bailian: "中文专用，适合已有百炼账号"
        case .openRouter: "海外服务，多模型可切换"
        }
    }

    var symbol: String {
        switch self {
        case .volcengine: "waveform.badge.mic"
        case .bailian: "flame.fill"
        case .openRouter: "globe"
        }
    }

    var tintName: String {
        switch self {
        case .volcengine: "orange"
        case .bailian: "red"
        case .openRouter: "indigo"
        }
    }
}

struct UserServiceConfiguration: Equatable, Sendable {
    var feishuAppID: String
    var feishuAppSecret: String
    var feishuBaseURL: String
    var speechProvider: SpeechProvider
    var speechAPIKey: String

    var isComplete: Bool {
        !feishuAppID.trimmed.isEmpty &&
        !feishuAppSecret.trimmed.isEmpty &&
        Self.isFeishuBaseURL(feishuBaseURL) &&
        !speechAPIKey.trimmed.isEmpty
    }

    static func isFeishuBaseURL(_ value: String) -> Bool {
        guard let url = URL(string: value.trimmed),
              url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(),
              Self.matchesDomain(host, domain: "feishu.cn") ||
                Self.matchesDomain(host, domain: "larksuite.com") else { return false }
        return url.pathComponents.contains("base")
    }

    private static func matchesDomain(_ host: String, domain: String) -> Bool {
        host == domain || host.hasSuffix(".\(domain)")
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
