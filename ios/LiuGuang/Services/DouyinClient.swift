import Foundation

final class DouyinClient: Sendable {
    private let session: URLSession
    private let mobileUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"

    init(session: URLSession = .shared) {
        self.session = session
    }

    func collect(from input: String) async throws -> DouyinMetadata {
        guard let sourceURL = DouyinInput.extractURL(from: input) else {
            throw PipelineError.invalidDouyinSource
        }
        let awemeID = try await resolveAwemeID(sourceURL)
        let detail = try await fetchDetail(awemeID: awemeID)
        return try makeMetadata(detail: detail, awemeID: awemeID, sourceURL: sourceURL)
    }

    private func resolveAwemeID(_ sourceURL: URL) async throws -> String {
        if let id = Self.awemeID(in: sourceURL.absoluteString) { return id }
        var request = URLRequest(url: sourceURL)
        request.setValue(mobileUserAgent, forHTTPHeaderField: "User-Agent")
        let (_, response) = try await session.data(for: request)
        if let finalURL = response.url,
           let id = Self.awemeID(in: finalURL.absoluteString) {
            return id
        }
        throw PipelineError.cannotResolveAwemeID
    }

    private func fetchDetail(awemeID: String) async throws -> [String: Any] {
        guard let url = URL(string: "https://www.iesdouyin.com/share/video/\(awemeID)/?from_ssr=1") else {
            throw PipelineError.invalidDouyinPage
        }
        var request = URLRequest(url: url)
        request.setValue(mobileUserAgent, forHTTPHeaderField: "User-Agent")
        let (data, response) = try await session.data(for: request)
        try Self.requireSuccess(response, data: data, service: "抖音分享页")
        guard let html = String(data: data, encoding: .utf8),
              let jsonText = Self.routerData(in: html),
              let jsonData = jsonText.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: jsonData),
              let detail = Self.findDetail(in: root, awemeID: awemeID) else {
            throw PipelineError.invalidDouyinPage
        }
        return detail
    }

    private func makeMetadata(detail: [String: Any], awemeID: String, sourceURL: URL) throws -> DouyinMetadata {
        let description = detail.string("desc") ?? ""
        let video = detail.dictionary("video") ?? [:]
        let author = detail.dictionary("author") ?? [:]
        let statistics = detail.dictionary("statistics") ?? [:]
        let videoURLs = Self.videoCandidates(video)
        guard !videoURLs.isEmpty else { throw PipelineError.noVideo }

        let structuredTags = (detail.array("text_extra") ?? []).compactMap { ($0 as? [String: Any])?.string("hashtag_name") }
        let inlineTags = Self.inlineHashtags(description)
        let hashtags = Self.unique(structuredTags + inlineTags)
        let duration = video.double("duration").map { (10 * $0).rounded() / 100 }
        let width = video.int("width")
        let height = video.int("height")
        let publishedAt = detail.double("create_time").map { Date(timeIntervalSince1970: $0) }

        return DouyinMetadata(
            sourceURL: sourceURL.absoluteString,
            canonicalURL: "https://www.douyin.com/video/\(awemeID)",
            awemeID: awemeID,
            title: description.components(separatedBy: .newlines).first?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            body: description,
            hashtags: hashtags,
            author: author.string("nickname"),
            douyinID: author.string("short_id") ?? author.string("unique_id"),
            authorURL: author.string("sec_uid").map { "https://www.douyin.com/user/\($0)" },
            coverURLs: Self.coverCandidates(video),
            videoURLs: videoURLs,
            likes: statistics.int("digg_count"),
            favorites: statistics.int("collect_count"),
            comments: statistics.int("comment_count"),
            shares: statistics.int("share_count"),
            publishedAt: publishedAt,
            durationSeconds: duration,
            resolution: width.flatMap { w in height.map { "\(w)x\($0)" } }
        )
    }

    private static func awemeID(in value: String) -> String? {
        let pattern = #"/(?:video|share/video)/(\d{10,})"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)),
              let range = Range(match.range(at: 1), in: value) else { return nil }
        return String(value[range])
    }

    private static func routerData(in html: String) -> String? {
        let pattern = #"window\._ROUTER_DATA\s*=\s*(.*?)</script>"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .dotMatchesLineSeparators),
              let match = regex.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
              let range = Range(match.range(at: 1), in: html) else { return nil }
        return String(html[range]).trimmingCharacters(in: CharacterSet(charactersIn: "; \n\r\t"))
    }

    private static func findDetail(in value: Any, awemeID: String) -> [String: Any]? {
        if let dictionary = value as? [String: Any] {
            if dictionary.string("aweme_id") == awemeID,
               dictionary["author"] != nil,
               dictionary["statistics"] != nil {
                return dictionary
            }
            for child in dictionary.values {
                if let result = findDetail(in: child, awemeID: awemeID) { return result }
            }
        } else if let array = value as? [Any] {
            for child in array {
                if let result = findDetail(in: child, awemeID: awemeID) { return result }
            }
        }
        return nil
    }

    private static func videoCandidates(_ video: [String: Any]) -> [URL] {
        let rates = (video.array("bit_rate") ?? []).compactMap { $0 as? [String: Any] }.sorted {
            ($0.int("bit_rate") ?? $0.int("bitrate") ?? 0) > ($1.int("bit_rate") ?? $1.int("bitrate") ?? 0)
        }
        let rateURLs = rates.flatMap { $0.dictionary("play_addr")?.stringArray("url_list") ?? [] }
        let raw = rateURLs
            + (video.dictionary("download_addr")?.stringArray("url_list") ?? [])
            + (video.dictionary("play_addr")?.stringArray("url_list") ?? [])
        return unique(raw.map {
            $0.replacingOccurrences(of: "/aweme/v1/playwm/", with: "/aweme/v1/play/")
                .replacingOccurrences(of: "/aweme/v2/playwm/", with: "/aweme/v2/play/")
        }).compactMap(URL.init(string:))
    }

    private static func coverCandidates(_ video: [String: Any]) -> [URL] {
        unique(
            (video.dictionary("origin_cover")?.stringArray("url_list") ?? [])
            + (video.dictionary("cover")?.stringArray("url_list") ?? [])
            + (video.dictionary("dynamic_cover")?.stringArray("url_list") ?? [])
        ).compactMap(URL.init(string:))
    }

    private static func inlineHashtags(_ text: String) -> [String] {
        let pattern = #"#\s*([^#\s，。！？、,.!?:：;；]+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        return regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap {
            guard let range = Range($0.range(at: 1), in: text) else { return nil }
            return String(text[range]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    private static func unique(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values.filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    private static func requireSuccess(_ response: URLResponse, data: Data, service: String) throws {
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw PipelineError.invalidResponse("\(service)请求失败（HTTP \(status)）")
        }
    }
}

private extension Dictionary where Key == String, Value == Any {
    func dictionary(_ key: String) -> [String: Any]? { self[key] as? [String: Any] }
    func array(_ key: String) -> [Any]? { self[key] as? [Any] }
    func string(_ key: String) -> String? {
        if let value = self[key] as? String, !value.isEmpty { return value }
        if let value = self[key] as? NSNumber { return value.stringValue }
        return nil
    }
    func int(_ key: String) -> Int? {
        if let value = self[key] as? NSNumber { return value.intValue }
        if let value = self[key] as? String { return Int(value) }
        return nil
    }
    func double(_ key: String) -> Double? {
        if let value = self[key] as? NSNumber { return value.doubleValue }
        if let value = self[key] as? String { return Double(value) }
        return nil
    }
    func stringArray(_ key: String) -> [String]? { self[key] as? [String] }
}
