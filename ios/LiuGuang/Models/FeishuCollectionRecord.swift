import Foundation

struct FeishuRecordField: Identifiable, Equatable, Sendable {
    let name: String
    let text: String
    let values: [String]
    let links: [URL]

    var id: String { name }
    var isEmpty: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

struct FeishuCollectionRecord: Identifiable, Equatable, Sendable {
    let id: String
    let fields: [FeishuRecordField]
    let createdAt: Date?
    let modifiedAt: Date?

    func field(named name: String) -> FeishuRecordField? {
        fields.first { $0.name == name }
    }

    func text(_ names: String...) -> String? {
        for name in names {
            if let value = field(named: name)?.text, !value.isEmpty { return value }
        }
        return nil
    }

    func link(_ names: String...) -> URL? {
        for name in names {
            guard let field = field(named: name) else { continue }
            if let link = field.links.first { return link }
            if let link = URL(string: field.text), link.scheme?.hasPrefix("http") == true { return link }
        }
        return nil
    }

    var title: String {
        text("标题", "主题", "博主") ?? "未命名采集"
    }

    var status: String {
        text("采集状态", "转写状态") ?? "—"
    }

    var sourceSummary: String {
        text("抖音分享内容（粘贴这里）", "抖音分享内容", "原始链接") ?? ""
    }

    var coverURL: URL? {
        link("封面链接", "封面")
    }

    var highlight: String? {
        text("爆款")
    }

    var benchmark: String? {
        text("对标参考")
    }
}

enum FeishuRecordDecoder {
    static func decode(item: [String: Any], fieldDefinitions: [FeishuField]) -> FeishuCollectionRecord? {
        guard let recordID = item["record_id"] as? String else { return nil }
        let rawFields = item["fields"] as? [String: Any] ?? [:]
        let definitions = Dictionary(uniqueKeysWithValues: fieldDefinitions.map { ($0.name, $0) })
        let orderedNames = fieldDefinitions.map(\.name) + rawFields.keys
            .filter { definitions[$0] == nil }
            .sorted()

        let fields = orderedNames.compactMap { name -> FeishuRecordField? in
            guard let raw = rawFields[name] else { return nil }
            let value = displayValue(raw, type: definitions[name]?.type)
            guard !value.text.isEmpty || !value.links.isEmpty else { return nil }
            return FeishuRecordField(name: name, text: value.text, values: value.values, links: value.links)
        }

        return FeishuCollectionRecord(
            id: recordID,
            fields: fields,
            createdAt: timestamp(item["created_time"]),
            modifiedAt: timestamp(item["last_modified_time"])
        )
    }

    private static func displayValue(_ raw: Any, type: Int?) -> (text: String, values: [String], links: [URL]) {
        if type == 5, let date = timestamp(raw) {
            let text = DateFormatter.feishuDate.string(from: date)
            return (text, [text], [])
        }
        if let string = raw as? String {
            let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
            let link = URL(string: trimmed).flatMap { $0.scheme?.hasPrefix("http") == true ? $0 : nil }
            return (trimmed, trimmed.isEmpty ? [] : [trimmed], link.map { [$0] } ?? [])
        }
        if let number = raw as? NSNumber {
            let text = number.doubleValue.rounded() == number.doubleValue
                ? String(number.int64Value)
                : String(number.doubleValue)
            return (text, [text], [])
        }
        if let dictionary = raw as? [String: Any] {
            return dictionaryValue(dictionary)
        }
        if let array = raw as? [Any] {
            var values: [String] = []
            var links: [URL] = []
            for item in array {
                let parsed = displayValue(item, type: nil)
                if !parsed.text.isEmpty { values.append(parsed.text) }
                links.append(contentsOf: parsed.links)
            }
            let uniqueValues = values.reduce(into: [String]()) { result, value in
                if !result.contains(value) { result.append(value) }
            }
            return (uniqueValues.joined(separator: "、"), uniqueValues, links)
        }
        let text = String(describing: raw)
        return (text, [text], [])
    }

    private static func dictionaryValue(_ dictionary: [String: Any]) -> (text: String, values: [String], links: [URL]) {
        let candidateKeys = ["text", "name", "value"]
        let text = candidateKeys.compactMap { dictionary[$0] as? String }.first ?? ""
        let linkKeys = ["link", "url", "tmp_url"]
        let links = linkKeys.compactMap { key -> URL? in
            guard let value = dictionary[key] as? String else { return nil }
            return URL(string: value)
        }
        let display = !text.isEmpty ? text : (links.first?.absoluteString ?? "")
        return (display, display.isEmpty ? [] : [display], links)
    }

    private static func timestamp(_ raw: Any?) -> Date? {
        let milliseconds: Double?
        if let number = raw as? NSNumber { milliseconds = number.doubleValue }
        else if let string = raw as? String { milliseconds = Double(string) }
        else { milliseconds = nil }
        guard let milliseconds else { return nil }
        return Date(timeIntervalSince1970: milliseconds / 1000)
    }
}

private extension DateFormatter {
    static let feishuDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy/MM/dd HH:mm"
        return formatter
    }()
}
