import Foundation

enum WorkerAPIError: LocalizedError {
    case invalidBaseURL
    case missingAccessToken
    case invalidResponse
    case unauthorized
    case rejected(String)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL: "请输入有效的 HTTPS 任务节点地址"
        case .missingAccessToken: "请输入任务节点访问令牌"
        case .invalidResponse: "任务节点返回了无法识别的数据"
        case .unauthorized: "访问令牌无效，请重新配置"
        case .rejected(let message): message
        }
    }
}

private struct APIErrorEnvelope: Decodable {
    struct Details: Decodable { let message: String }
    let error: Details
}

struct WorkerAPIClient: Sendable {
    let baseURL: URL
    let accessToken: String
    var session: URLSession = .shared

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    init(configuration: WorkerConfiguration, accessToken: String, session: URLSession = .shared) throws {
        guard let url = configuration.normalizedURL else { throw WorkerAPIError.invalidBaseURL }
        let token = accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else { throw WorkerAPIError.missingAccessToken }
        self.baseURL = url
        self.accessToken = token
        self.session = session
    }

    func verify() async throws -> WorkerVerification {
        try await send(path: "/v1/session/verify", method: "POST", body: Optional<String>.none)
    }

    func submit(source: String, requestId: UUID = UUID()) async throws -> CollectionJob {
        let envelope: JobEnvelope = try await send(
            path: "/v1/jobs",
            method: "POST",
            body: CreateJobRequest(source: source, clientRequestId: requestId)
        )
        return envelope.job
    }

    func jobs(limit: Int = 30) async throws -> [CollectionJob] {
        let safeLimit = min(max(limit, 1), 100)
        let envelope: JobListEnvelope = try await send(
            path: "/v1/jobs?limit=\(safeLimit)",
            method: "GET",
            body: Optional<String>.none
        )
        return envelope.items
    }

    func job(id: String) async throws -> CollectionJob {
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        let envelope: JobEnvelope = try await send(
            path: "/v1/jobs/\(encoded)",
            method: "GET",
            body: Optional<String>.none
        )
        return envelope.job
    }

    func retry(id: String) async throws -> CollectionJob {
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        let envelope: JobEnvelope = try await send(
            path: "/v1/jobs/\(encoded)/retry",
            method: "POST",
            body: Optional<String>.none
        )
        return envelope.job
    }

    private func send<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body?
    ) async throws -> Response {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw WorkerAPIError.invalidBaseURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try Self.encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw WorkerAPIError.invalidResponse }
        if http.statusCode == 401 { throw WorkerAPIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? Self.decoder.decode(APIErrorEnvelope.self, from: data).error.message)
                ?? "任务节点请求失败（HTTP \(http.statusCode)）"
            throw WorkerAPIError.rejected(message)
        }
        do {
            return try Self.decoder.decode(Response.self, from: data)
        } catch {
            throw WorkerAPIError.invalidResponse
        }
    }
}

