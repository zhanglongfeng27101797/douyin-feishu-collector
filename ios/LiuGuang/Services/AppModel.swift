import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var isConfigured = false
    @Published private(set) var jobs: [CollectionJob] = []
    @Published var lastError: String?

    private let configurationStore: ConfigurationStore

    init(configurationStore: ConfigurationStore = ConfigurationStore()) {
        self.configurationStore = configurationStore
        self.isConfigured = (try? configurationStore.load()) != nil
    }

    func client() throws -> WorkerAPIClient {
        guard let session = try configurationStore.load() else {
            throw WorkerAPIError.missingAccessToken
        }
        return try WorkerAPIClient(
            configuration: session.configuration,
            accessToken: session.accessToken
        )
    }

    func save(configuration: WorkerConfiguration, token: String) throws {
        try configurationStore.save(configuration: configuration, accessToken: token)
        isConfigured = true
    }

    func disconnect() throws {
        try configurationStore.clear()
        jobs = []
        isConfigured = false
    }

    func refreshJobs() async {
        do {
            jobs = try await client().jobs()
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    func submit(_ source: String) async throws -> CollectionJob {
        let job = try await client().submit(source: source)
        jobs.removeAll { $0.id == job.id }
        jobs.insert(job, at: 0)
        return job
    }

    func retry(_ job: CollectionJob) async {
        do {
            let updated = try await client().retry(id: job.id)
            jobs.removeAll { $0.id == updated.id }
            jobs.insert(updated, at: 0)
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }
}
