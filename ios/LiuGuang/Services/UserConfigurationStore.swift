import Foundation

struct UserConfigurationStore {
    private enum Key {
        static let appID = "user.feishu.appID"
        static let appSecret = "user.feishu.appSecret"
        static let baseURL = "user.feishu.baseURL"
        static let speechProvider = "user.speech.provider"
        static let speechAPIKey = "user.speech.apiKey"
    }

    private let defaults: UserDefaults
    private let keychain: KeychainStore

    init(defaults: UserDefaults = .standard, keychain: KeychainStore = KeychainStore()) {
        self.defaults = defaults
        self.keychain = keychain
    }

    func load() throws -> UserServiceConfiguration? {
        let configuration = UserServiceConfiguration(
            feishuAppID: defaults.string(forKey: Key.appID) ?? "",
            feishuAppSecret: try keychain.value(for: Key.appSecret) ?? "",
            feishuBaseURL: defaults.string(forKey: Key.baseURL) ?? "",
            speechProvider: SpeechProvider(rawValue: defaults.string(forKey: Key.speechProvider) ?? "") ?? .volcengine,
            speechAPIKey: try keychain.value(for: Key.speechAPIKey) ?? ""
        )
        return configuration.isComplete ? configuration : nil
    }

    func save(_ configuration: UserServiceConfiguration) throws {
        guard configuration.isComplete else { throw UserConfigurationError.incomplete }
        defaults.set(configuration.feishuAppID.trimmingCharacters(in: .whitespacesAndNewlines), forKey: Key.appID)
        defaults.set(configuration.feishuBaseURL.trimmingCharacters(in: .whitespacesAndNewlines), forKey: Key.baseURL)
        defaults.set(configuration.speechProvider.rawValue, forKey: Key.speechProvider)
        try keychain.set(configuration.feishuAppSecret.trimmingCharacters(in: .whitespacesAndNewlines), for: Key.appSecret)
        try keychain.set(configuration.speechAPIKey.trimmingCharacters(in: .whitespacesAndNewlines), for: Key.speechAPIKey)
    }

    func clear() throws {
        defaults.removeObject(forKey: Key.appID)
        defaults.removeObject(forKey: Key.baseURL)
        defaults.removeObject(forKey: Key.speechProvider)
        try keychain.remove(Key.appSecret)
        try keychain.remove(Key.speechAPIKey)
    }
}

enum UserConfigurationError: LocalizedError {
    case incomplete

    var errorDescription: String? { "请完整填写飞书、表格和语音识别配置" }
}
