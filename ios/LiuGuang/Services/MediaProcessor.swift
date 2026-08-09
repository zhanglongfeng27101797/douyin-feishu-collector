import AVFoundation
import Foundation

final class MediaProcessor: Sendable {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func downloadVideo(videoURLs: [URL]) async throws -> (url: URL, cleanup: @Sendable () -> Void) {
        var lastError: Error?
        for candidate in videoURLs {
            do {
                let videoURL = try await download(candidate)
                return (videoURL, {
                    try? FileManager.default.removeItem(at: videoURL)
                })
            } catch {
                lastError = error
            }
        }
        throw lastError ?? PipelineError.noVideo
    }

    func prepareWAV(videoURLs: [URL]) async throws -> (url: URL, cleanup: @Sendable () -> Void) {
        var lastError: Error?
        for candidate in videoURLs {
            do {
                let videoURL = try await download(candidate)
                let wavURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent("liuguang-\(UUID().uuidString).wav")
                do {
                    try await extractWAV(from: videoURL, to: wavURL)
                    return (wavURL, {
                        try? FileManager.default.removeItem(at: videoURL)
                        try? FileManager.default.removeItem(at: wavURL)
                    })
                } catch {
                    try? FileManager.default.removeItem(at: videoURL)
                    try? FileManager.default.removeItem(at: wavURL)
                    throw error
                }
            } catch {
                lastError = error
            }
        }
        throw lastError ?? PipelineError.noVideo
    }

    private func download(_ url: URL) async throws -> URL {
        var request = URLRequest(url: url)
        request.timeoutInterval = 120
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", forHTTPHeaderField: "User-Agent")
        let (temporaryURL, response) = try await session.download(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw PipelineError.invalidResponse("视频下载失败（HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)）")
        }
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("liuguang-\(UUID().uuidString).mp4")
        try FileManager.default.moveItem(at: temporaryURL, to: destination)
        return destination
    }

    private func extractWAV(from videoURL: URL, to outputURL: URL) async throws {
        let asset = AVURLAsset(url: videoURL)
        guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
            throw PipelineError.invalidResponse("视频中没有可识别的音轨")
        }
        let reader = try AVAssetReader(asset: asset)
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false
        ]
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
        output.alwaysCopiesSampleData = false
        guard reader.canAdd(output) else {
            throw PipelineError.invalidResponse("当前视频音频格式无法转换")
        }
        reader.add(output)
        guard reader.startReading() else {
            throw reader.error ?? PipelineError.invalidResponse("无法开始提取音频")
        }

        var pcm = Data()
        while let sampleBuffer = output.copyNextSampleBuffer() {
            if let buffer = CMSampleBufferGetDataBuffer(sampleBuffer) {
                let length = CMBlockBufferGetDataLength(buffer)
                var chunk = Data(count: length)
                chunk.withUnsafeMutableBytes { rawBuffer in
                    guard let address = rawBuffer.baseAddress else { return }
                    CMBlockBufferCopyDataBytes(buffer, atOffset: 0, dataLength: length, destination: address)
                }
                pcm.append(chunk)
            }
        }
        guard reader.status == .completed, !pcm.isEmpty else {
            throw reader.error ?? PipelineError.invalidResponse("音频提取失败")
        }

        var wav = Self.wavHeader(pcmByteCount: pcm.count)
        wav.append(pcm)
        try wav.write(to: outputURL, options: .atomic)
    }

    private static func wavHeader(pcmByteCount: Int) -> Data {
        var data = Data()
        func ascii(_ value: String) { data.append(value.data(using: .ascii)!) }
        func uint16(_ value: UInt16) {
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
        }
        func uint32(_ value: UInt32) {
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
        }
        let sampleRate: UInt32 = 16_000
        let channels: UInt16 = 1
        let bits: UInt16 = 16
        let byteRate = sampleRate * UInt32(channels) * UInt32(bits / 8)
        ascii("RIFF"); uint32(UInt32(36 + pcmByteCount)); ascii("WAVE")
        ascii("fmt "); uint32(16); uint16(1); uint16(channels)
        uint32(sampleRate); uint32(byteRate); uint16(channels * bits / 8); uint16(bits)
        ascii("data"); uint32(UInt32(pcmByteCount))
        return data
    }
}
