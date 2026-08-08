import Foundation

struct StoredWorkerSession: Sendable {
    let configuration: WorkerConfiguration
    let accessToken: String
}

struct ConfigurationStore {
    private enum Key {
        static let workerURL = "worker.baseURL"
        static let workerToken = "worker.accessToken"
    }

    private let defaults: UserDefaults
    private let keychain: KeychainStore

    init(defaults: UserDefaults = .standard, keychain: KeychainStore = KeychainStore()) {
        self.defaults = defaults
        self.keychain = keychain
    }

    func load() throws -> StoredWorkerSession? {
        let url = defaults.string(forKey: Key.workerURL) ?? ""
        let token = try keychain.value(for: Key.workerToken) ?? ""
        let configuration = WorkerConfiguration(baseURL: url)
        guard configuration.isValid, !token.isEmpty else { return nil }
        return StoredWorkerSession(configuration: configuration, accessToken: token)
    }

    func save(configuration: WorkerConfiguration, accessToken: String) throws {
        guard configuration.isValid else { throw WorkerAPIError.invalidBaseURL }
        let token = accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else { throw WorkerAPIError.missingAccessToken }
        defaults.set(configuration.baseURL.trimmingCharacters(in: .whitespacesAndNewlines), forKey: Key.workerURL)
        try keychain.set(token, for: Key.workerToken)
    }

    func clear() throws {
        defaults.removeObject(forKey: Key.workerURL)
        try keychain.remove(Key.workerToken)
    }
}
