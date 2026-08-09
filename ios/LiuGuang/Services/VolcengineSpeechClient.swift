import Foundation

final class VolcengineSpeechClient: Sendable {
    private let session: URLSession
    private let endpoint = URL(string: "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash")!

    init(session: URLSession = .shared) {
        self.session = session
    }

    func transcribe(wavURL: URL, apiKey: String) async throws -> TranscriptResult {
        let audio = try Data(contentsOf: wavURL)
        guard audio.count <= 100 * 1024 * 1024 else {
            throw PipelineError.invalidResponse("音频超过火山极速版 100MB 限制")
        }
        let identity = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let body: [String: Any] = [
            "user": ["uid": identity],
            "audio": ["data": audio.base64EncodedString()],
            "request": ["model_name": "bigmodel"]
        ]
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 180
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("volc.bigasr.auc_turbo", forHTTPHeaderField: "X-Api-Resource-Id")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Api-Request-Id")
        request.setValue("-1", forHTTPHeaderField: "X-Api-Sequence")
        request.setValue(identity, forHTTPHeaderField: "X-Api-Key")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw PipelineError.invalidResponse("火山引擎没有返回有效响应")
        }
        let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let result = payload?["result"] as? [String: Any]
        let rawText = result?["text"] as? String
        let statusCode = http.value(forHTTPHeaderField: "x-api-status-code")
        guard (200..<300).contains(http.statusCode),
              statusCode == nil || statusCode == "20000000",
              let rawText, !rawText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            let message = http.value(forHTTPHeaderField: "x-api-message")
                ?? payload?["message"] as? String
                ?? "HTTP \(http.statusCode)"
            throw PipelineError.invalidResponse("火山引擎转写失败：\(message)")
        }
        return TranscriptResult(
            text: Self.cleanTranscript(rawText),
            source: "火山引擎 豆包大模型录音文件极速版"
        )
    }

    static func cleanTranscript(_ text: String) -> String {
        var value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let pattern = #"(?:[。！？!?]\s*)?(?:抖音(?:记录美好生活)?|douyin)\s*[。！？!?]*\s*$"#
        if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
            value = regex.stringByReplacingMatches(
                in: value,
                range: NSRange(value.startIndex..., in: value),
                withTemplate: ""
            ).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return value
    }
}

