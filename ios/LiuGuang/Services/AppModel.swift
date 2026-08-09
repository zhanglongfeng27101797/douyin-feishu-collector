import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var isConfigured = false
    @Published private(set) var jobs: [CollectionJob] = []
    @Published var lastError: String?

    private let userConfigurationStore: UserConfigurationStore
    private let pipeline: DirectCollectionPipeline

    init(
        userConfigurationStore: UserConfigurationStore = UserConfigurationStore(),
        pipeline: DirectCollectionPipeline = DirectCollectionPipeline()
    ) {
        self.userConfigurationStore = userConfigurationStore
        self.pipeline = pipeline
        self.isConfigured = (try? userConfigurationStore.load()) != nil
    }

    func save(userConfiguration: UserServiceConfiguration) throws {
        try userConfigurationStore.save(userConfiguration)
        isConfigured = true
    }

    func userConfiguration() throws -> UserServiceConfiguration? {
        try userConfigurationStore.load()
    }

    func disconnect() throws {
        try userConfigurationStore.clear()
        jobs = []
        isConfigured = false
    }

    func refreshJobs() async {
        lastError = nil
    }

    func submit(_ source: String) async throws -> CollectionJob {
        guard let configuration = try userConfigurationStore.load() else {
            throw PipelineError.invalidResponse("请先完成服务配置")
        }
        let now = Date()
        let job = CollectionJob(
            id: UUID().uuidString,
            status: .queued,
            stage: .queued,
            source: source,
            title: nil,
            progress: 0,
            feishuRecordId: nil,
            errorMessage: nil,
            canRetry: false,
            createdAt: now,
            updatedAt: now
        )
        jobs.insert(job, at: 0)
        Task { await process(jobID: job.id, source: source, configuration: configuration) }
        return job
    }

    func retry(_ job: CollectionJob) async {
        guard let configuration = try? userConfigurationStore.load() else {
            lastError = "请先完成服务配置"
            return
        }
        updateJob(id: job.id, status: .queued, stage: .queued, progress: 0, error: nil, canRetry: false)
        await process(jobID: job.id, source: job.source, configuration: configuration)
    }

    private func process(jobID: String, source: String, configuration: UserServiceConfiguration) async {
        do {
            let outcome = try await pipeline.run(source: source, configuration: configuration) { [weak self] stage, progress, title, recordID in
                self?.updateJob(
                    id: jobID,
                    status: stage == .completed ? .succeeded : .running,
                    stage: stage,
                    progress: progress,
                    title: title,
                    recordID: recordID
                )
            }
            updateJob(id: jobID, status: .succeeded, stage: .completed, progress: 100, title: outcome.title, recordID: outcome.recordID)
            lastError = nil
        } catch {
            updateJob(id: jobID, status: .failed, progress: nil, error: error.localizedDescription, canRetry: true)
            lastError = error.localizedDescription
        }
    }

    private func updateJob(
        id: String,
        status: CollectionJob.Status? = nil,
        stage: CollectionJob.Stage? = nil,
        progress: Int? = nil,
        title: String? = nil,
        recordID: String? = nil,
        error: String? = nil,
        canRetry: Bool? = nil
    ) {
        guard let index = jobs.firstIndex(where: { $0.id == id }) else { return }
        let old = jobs[index]
        jobs[index] = CollectionJob(
            id: old.id,
            status: status ?? old.status,
            stage: stage ?? old.stage,
            source: old.source,
            title: title ?? old.title,
            progress: progress ?? old.progress,
            feishuRecordId: recordID ?? old.feishuRecordId,
            errorMessage: error,
            canRetry: canRetry ?? old.canRetry,
            createdAt: old.createdAt,
            updatedAt: Date()
        )
    }
}
