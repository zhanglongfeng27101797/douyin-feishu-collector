import Foundation

enum DouyinInput {
    private static let pattern = #"https?://(?:v\.)?douyin\.com/[^\s，。；;！!？”"'<>]+"#

    static func extractURL(from source: String) -> URL? {
        guard let expression = try? NSRegularExpression(
            pattern: pattern,
            options: [.caseInsensitive]
        ) else { return nil }
        let range = NSRange(source.startIndex..<source.endIndex, in: source)
        guard let match = expression.firstMatch(in: source, range: range),
              let matchRange = Range(match.range, in: source) else { return nil }
        let candidate = String(source[matchRange]).trimmingCharacters(
            in: CharacterSet(charactersIn: "/").inverted.inverted
        )
        return URL(string: candidate)
    }

    static func isValid(_ source: String) -> Bool {
        let value = source.trimmingCharacters(in: .whitespacesAndNewlines)
        return !value.isEmpty && value.count <= 5_000 && extractURL(from: value) != nil
    }
}
