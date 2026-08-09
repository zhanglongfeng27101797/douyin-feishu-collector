import Foundation

struct FeishuBaseReference: Equatable, Sendable {
    let appToken: String
    let tableID: String?

    init(urlString: String) throws {
        guard let components = URLComponents(string: urlString.trimmingCharacters(in: .whitespacesAndNewlines)),
              let baseIndex = components.path.split(separator: "/").firstIndex(of: "base") else {
            throw PipelineError.invalidFeishuBaseURL
        }
        let parts = components.path.split(separator: "/")
        let tokenIndex = parts.index(after: baseIndex)
        guard tokenIndex < parts.endIndex, !parts[tokenIndex].isEmpty else {
            throw PipelineError.invalidFeishuBaseURL
        }
        appToken = String(parts[tokenIndex])
        tableID = components.queryItems?.first(where: { $0.name == "table" })?.value
    }
}

struct FeishuField: Sendable {
    let name: String
    let type: Int
}

struct FeishuTableContext: Sendable {
    let token: String
    let appToken: String
    let tableID: String
    let fields: [FeishuField]
}

final class FeishuClient: Sendable {
    private let session: URLSession
    private let root = "https://open.feishu.cn/open-apis"

    init(session: URLSession = .shared) {
        self.session = session
    }

    func prepare(configuration: UserServiceConfiguration) async throws -> FeishuTableContext {
        let reference = try FeishuBaseReference(urlString: configuration.feishuBaseURL)
        let token = try await tenantToken(appID: configuration.feishuAppID, appSecret: configuration.feishuAppSecret)
        let tableID: String
        if let selected = reference.tableID, !selected.isEmpty {
            tableID = selected
        } else {
            let tables = try await listTables(token: token, appToken: reference.appToken)
            guard let table = tables.first(where: { ($0["name"] as? String) == "采集库" }) ?? tables.first,
                  let id = table["table_id"] as? String else {
                throw PipelineError.missingFeishuTable
            }
            tableID = id
        }
        let fields = try await listFields(token: token, appToken: reference.appToken, tableID: tableID)
        return FeishuTableContext(token: token, appToken: reference.appToken, tableID: tableID, fields: fields)
    }

    func prepareTranscriptLibrary(configuration: UserServiceConfiguration) async throws -> FeishuTableContext {
        let reference = try FeishuBaseReference(urlString: configuration.feishuBaseURL)
        let token = try await tenantToken(appID: configuration.feishuAppID, appSecret: configuration.feishuAppSecret)
        let tables = try await listTables(token: token, appToken: reference.appToken)
        let tableID: String
        if let existing = tables.first(where: { ($0["name"] as? String) == "逐字稿库" }),
           let existingID = existing["table_id"] as? String {
            tableID = existingID
        } else {
            tableID = try await createTranscriptLibrary(token: token, appToken: reference.appToken)
        }
        let fields = try await listFields(token: token, appToken: reference.appToken, tableID: tableID)
        return FeishuTableContext(token: token, appToken: reference.appToken, tableID: tableID, fields: fields)
    }

    func transcriptRecord(context: FeishuTableContext, awemeID: String) async throws -> (recordID: String, transcript: String)? {
        var pageToken: String?
        repeat {
            var components = URLComponents()
            components.path = "/bitable/v1/apps/\(context.appToken)/tables/\(context.tableID)/records"
            var queryItems = [URLQueryItem(name: "page_size", value: "100")]
            if let pageToken { queryItems.append(URLQueryItem(name: "page_token", value: pageToken)) }
            components.queryItems = queryItems
            guard let path = components.string else {
                throw PipelineError.invalidResponse("飞书逐字稿查询地址无效")
            }
            let data = try await api(path: path, token: context.token)
            for item in data["items"] as? [[String: Any]] ?? [] {
                guard let fields = item["fields"] as? [String: Any],
                      scalarText(fields["作品ID"]) == awemeID,
                      let recordID = item["record_id"] as? String else { continue }
                return (recordID, scalarText(fields["视频逐字稿"]) ?? "")
            }
            pageToken = (data["has_more"] as? Bool) == true ? data["page_token"] as? String : nil
        } while pageToken != nil
        return nil
    }

    func createRecord(context: FeishuTableContext, values: [String: Any]) async throws -> String {
        let mapped = map(values: values, fields: context.fields)
        let data = try await api(
            path: "/bitable/v1/apps/\(context.appToken)/tables/\(context.tableID)/records",
            token: context.token,
            method: "POST",
            body: ["fields": mapped]
        )
        guard let record = data["record"] as? [String: Any],
              let recordID = record["record_id"] as? String else {
            throw PipelineError.invalidResponse("飞书创建记录成功，但未返回记录编号")
        }
        return recordID
    }

    func updateRecord(context: FeishuTableContext, recordID: String, values: [String: Any]) async throws {
        let mapped = map(values: values, fields: context.fields, includeEmpty: true)
        _ = try await api(
            path: "/bitable/v1/apps/\(context.appToken)/tables/\(context.tableID)/records/\(recordID)",
            token: context.token,
            method: "PUT",
            body: ["fields": mapped]
        )
    }

    func listRecords(context: FeishuTableContext, maximumCount: Int = 500) async throws -> [FeishuCollectionRecord] {
        var records: [FeishuCollectionRecord] = []
        var pageToken: String?

        repeat {
            var components = URLComponents()
            components.path = "/bitable/v1/apps/\(context.appToken)/tables/\(context.tableID)/records"
            var queryItems = [URLQueryItem(name: "page_size", value: "100")]
            if let pageToken { queryItems.append(URLQueryItem(name: "page_token", value: pageToken)) }
            components.queryItems = queryItems

            guard let path = components.string else {
                throw PipelineError.invalidResponse("飞书记录接口地址无效")
            }
            let data = try await api(path: path, token: context.token)
            let items = data["items"] as? [[String: Any]] ?? []
            records.append(contentsOf: items.compactMap {
                FeishuRecordDecoder.decode(item: $0, fieldDefinitions: context.fields)
            })

            let hasMore = (data["has_more"] as? Bool) == true
            pageToken = hasMore ? data["page_token"] as? String : nil
        } while pageToken != nil && records.count < maximumCount

        return Array(records.prefix(maximumCount)).sorted {
            ($0.modifiedAt ?? $0.createdAt ?? .distantPast) > ($1.modifiedAt ?? $1.createdAt ?? .distantPast)
        }
    }

    private func tenantToken(appID: String, appSecret: String) async throws -> String {
        let payload = try await request(
            url: URL(string: "\(root)/auth/v3/tenant_access_token/internal")!,
            method: "POST",
            body: ["app_id": appID, "app_secret": appSecret]
        )
        guard (payload["code"] as? NSNumber)?.intValue == 0,
              let token = payload["tenant_access_token"] as? String else {
            throw PipelineError.invalidResponse("获取飞书凭证失败：\(payload["msg"] as? String ?? "请检查 App ID、Secret 与应用权限")")
        }
        return token
    }

    private func listTables(token: String, appToken: String) async throws -> [[String: Any]] {
        let data = try await api(path: "/bitable/v1/apps/\(appToken)/tables?page_size=100", token: token)
        return data["items"] as? [[String: Any]] ?? []
    }

    private func listFields(token: String, appToken: String, tableID: String) async throws -> [FeishuField] {
        let data = try await api(path: "/bitable/v1/apps/\(appToken)/tables/\(tableID)/fields?page_size=100", token: token)
        return (data["items"] as? [[String: Any]] ?? []).compactMap {
            guard let name = $0["field_name"] as? String,
                  let type = ($0["type"] as? NSNumber)?.intValue else { return nil }
            return FeishuField(name: name, type: type)
        }
    }

    private func createTranscriptLibrary(token: String, appToken: String) async throws -> String {
        let fields: [[String: Any]] = [
            ["field_name": "标题", "type": 1],
            ["field_name": "作品ID", "type": 1],
            ["field_name": "原始分享内容", "type": 1],
            ["field_name": "标准链接", "type": 15],
            ["field_name": "博主", "type": 1],
            ["field_name": "视频逐字稿", "type": 1],
            ["field_name": "提取时间", "type": 5],
            ["field_name": "转写状态", "type": 1],
            ["field_name": "转写来源", "type": 1],
            ["field_name": "错误原因", "type": 1]
        ]
        let data = try await api(
            path: "/bitable/v1/apps/\(appToken)/tables",
            token: token,
            method: "POST",
            body: [
                "table": [
                    "name": "逐字稿库",
                    "default_view_name": "全部逐字稿",
                    "fields": fields
                ]
            ]
        )
        guard let tableID = data["table_id"] as? String else {
            throw PipelineError.invalidResponse("逐字稿库已请求创建，但飞书没有返回数据表编号")
        }
        return tableID
    }

    private func api(path: String, token: String, method: String = "GET", body: [String: Any]? = nil) async throws -> [String: Any] {
        guard let url = URL(string: "\(root)\(path)") else { throw PipelineError.invalidResponse("飞书接口地址无效") }
        let payload = try await request(url: url, token: token, method: method, body: body)
        if let code = payload["code"] as? NSNumber, code.intValue != 0 {
            throw PipelineError.invalidResponse("飞书接口失败：\(payload["msg"] as? String ?? "错误码 \(code)")")
        }
        return payload["data"] as? [String: Any] ?? [:]
    }

    private func request(url: URL, token: String? = nil, method: String, body: [String: Any]? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 60
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw PipelineError.invalidResponse("飞书网络请求失败（HTTP \(status)）")
        }
        guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw PipelineError.invalidResponse("飞书返回的数据无法读取")
        }
        return payload
    }

    private func map(values: [String: Any], fields: [FeishuField], includeEmpty: Bool = false) -> [String: Any] {
        let byName = Dictionary(uniqueKeysWithValues: fields.map { ($0.name, $0) })
        var result: [String: Any] = [:]
        for (name, value) in values {
            guard let field = byName[name] else { continue }
            if !includeEmpty, let string = value as? String, string.isEmpty { continue }
            switch field.type {
            case 2:
                if let number = value as? NSNumber { result[name] = number }
                else if let number = Double(String(describing: value)) { result[name] = number }
            case 4:
                result[name] = value as? [String] ?? [String(describing: value)]
            case 5:
                if let date = value as? Date { result[name] = Int(date.timeIntervalSince1970 * 1000) }
            case 15:
                let link = String(describing: value)
                result[name] = ["link": link, "text": link]
            case 17:
                result[name] = value is [Any] ? value : [value]
            default:
                result[name] = (value as? [String])?.joined(separator: ", ") ?? value
            }
        }
        return result
    }

    private func scalarText(_ value: Any?) -> String? {
        if let text = value as? String { return text }
        if let number = value as? NSNumber { return number.stringValue }
        if let items = value as? [[String: Any]] {
            return items.compactMap { $0["text"] as? String }.joined()
        }
        if let items = value as? [Any] {
            return items.compactMap { scalarText($0) }.joined(separator: ", ")
        }
        if let object = value as? [String: Any] {
            return object["text"] as? String ?? object["link"] as? String
        }
        return nil
    }
}
