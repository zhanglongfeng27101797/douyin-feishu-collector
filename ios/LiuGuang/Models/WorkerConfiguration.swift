import Foundation

struct WorkerConfiguration: Codable, Equatable, Sendable {
    var baseURL: String = ""

    var normalizedURL: URL? {
        let value = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: value), let scheme = url.scheme?.lowercased() else {
            return nil
        }
        let isLocal = url.host == "127.0.0.1" || url.host == "localhost"
        guard scheme == "https" || (scheme == "http" && isLocal) else { return nil }
        return url
    }

    var isValid: Bool { normalizedURL != nil }
}

struct WorkerVerification: Codable, Equatable, Sendable {
    let ok: Bool
    let feishuConfigured: Bool
    let speechConfigured: Bool
    let analysisConfigured: Bool
    let tableName: String?

    var isReady: Bool {
        ok && feishuConfigured && speechConfigured && analysisConfigured
    }
}

