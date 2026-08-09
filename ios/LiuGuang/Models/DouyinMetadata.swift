import Foundation

struct DouyinMetadata: Sendable {
    let sourceURL: String
    let canonicalURL: String
    let awemeID: String
    let title: String
    let body: String
    let hashtags: [String]
    let author: String?
    let douyinID: String?
    let authorURL: String?
    let coverURLs: [URL]
    let videoURLs: [URL]
    let likes: Int?
    let favorites: Int?
    let comments: Int?
    let shares: Int?
    let publishedAt: Date?
    let durationSeconds: Double?
    let resolution: String?

    var feishuFields: [String: Any] {
        var values: [String: Any?] = [
            "原始链接": sourceURL,
            "标准链接": canonicalURL,
            "作品ID": awemeID,
            "标题": title,
            "正文": body,
            "话题标签": hashtags,
            "博主": author,
            "抖音号": douyinID,
            "博主主页": authorURL,
            "封面链接": coverURLs.first?.absoluteString,
            "视频链接": videoURLs.first?.absoluteString,
            "点赞数": likes,
            "收藏数": favorites,
            "评论数": comments,
            "分享数": shares,
            "发布时间": publishedAt,
            "时长秒": durationSeconds,
            "分辨率": resolution,
            "采集时间": Date(),
            "采集状态": "采集中"
        ]
        return values.compactMapValues { $0 }
    }
}

struct TranscriptResult: Sendable {
    let text: String
    let source: String

    var feishuFields: [String: Any] {
        [
            "视频逐字稿": text,
            "转写状态": "成功（需校对）",
            "转写时间": Date(),
            "转写来源": source,
            "逐字稿字数": text.count,
            "转写错误原因": "",
            "采集状态": "成功"
        ]
    }
}

