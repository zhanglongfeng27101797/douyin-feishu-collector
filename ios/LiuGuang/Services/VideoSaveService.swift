import Foundation
import Photos

struct SavedDouyinVideo: Sendable {
    let title: String
    let author: String?
}

final class VideoSaveService: Sendable {
    private let douyin: DouyinClient
    private let media: MediaProcessor

    init(
        douyin: DouyinClient = DouyinClient(),
        media: MediaProcessor = MediaProcessor()
    ) {
        self.douyin = douyin
        self.media = media
    }

    func saveToPhotoLibrary(from source: String) async throws -> SavedDouyinVideo {
        let metadata = try await douyin.collect(from: source)
        let prepared = try await media.downloadVideo(videoURLs: metadata.videoURLs)
        defer { prepared.cleanup() }

        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            throw PipelineError.invalidResponse("没有相册写入权限，请在系统设置中允许“流光”添加照片")
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            PHPhotoLibrary.shared().performChanges {
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: prepared.url)
            } completionHandler: { success, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if success {
                    continuation.resume(returning: ())
                } else {
                    continuation.resume(throwing: PipelineError.invalidResponse("视频未能保存到相册"))
                }
            }
        }

        return SavedDouyinVideo(title: metadata.title, author: metadata.author)
    }
}
