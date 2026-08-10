package com.masterorange.liuguang.data

import android.content.ContentValues
import android.content.Context
import android.media.MediaCodec
import android.media.AudioFormat
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.Build
import android.provider.MediaStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.roundToInt

class AndroidMediaProcessor(private val context: Context) {
    suspend fun downloadVideo(videoUrls: List<String>): File = DirectHttpClient.downloadToFile(
        videoUrls,
        headers = mapOf(
            "User-Agent" to "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Mobile Safari/537.36",
            "Referer" to "https://www.douyin.com/",
        ),
        directory = context.cacheDir,
    )

    suspend fun prepareWav(videoUrls: List<String>): ByteArray = withContext(Dispatchers.IO) {
        val file = downloadVideo(videoUrls)
        try {
            decodeToWav(file)
        } finally {
            file.delete()
        }
    }

    suspend fun saveVideo(video: File, title: String) = withContext(Dispatchers.IO) {
        val values = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, safeName(title) + ".mp4")
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            if (Build.VERSION.SDK_INT >= 29) {
                put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/流光")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
            ?: error("系统相册无法创建视频文件")
        try {
            resolver.openOutputStream(uri)?.use { output -> video.inputStream().buffered().use { it.copyTo(output) } }
                ?: error("系统相册无法写入视频")
            if (Build.VERSION.SDK_INT >= 29) {
                values.clear()
                values.put(MediaStore.Video.Media.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            }
        } catch (error: Exception) {
            resolver.delete(uri, null, null)
            throw error
        }
    }

    private fun decodeToWav(file: File): ByteArray {
        val extractor = MediaExtractor()
        extractor.setDataSource(file.absolutePath)
        val trackIndex = (0 until extractor.trackCount).firstOrNull {
            extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
        } ?: run { extractor.release(); error("视频中没有可识别的音轨") }
        extractor.selectTrack(trackIndex)
        val inputFormat = extractor.getTrackFormat(trackIndex)
        inputFormat.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
        val mime = inputFormat.getString(MediaFormat.KEY_MIME) ?: error("视频音轨格式无效")
        val codec = MediaCodec.createDecoderByType(mime)
        codec.configure(inputFormat, null, null, 0)
        codec.start()
        val pcm = ByteArrayOutputStream()
        val info = MediaCodec.BufferInfo()
        var inputEnded = false
        var outputEnded = false
        var sampleRate = inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        var channels = inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

        try {
            while (!outputEnded) {
                if (!inputEnded) {
                    val index = codec.dequeueInputBuffer(10_000)
                    if (index >= 0) {
                        val buffer = codec.getInputBuffer(index) ?: error("无法读取音频输入缓冲区")
                        val size = extractor.readSampleData(buffer, 0)
                        if (size < 0) {
                            codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputEnded = true
                        } else {
                            codec.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }
                when (val index = codec.dequeueOutputBuffer(info, 10_000)) {
                    MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        val format = codec.outputFormat
                        sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                        channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                    }
                    else -> if (index >= 0) {
                        codec.getOutputBuffer(index)?.let { buffer ->
                            if (info.size > 0) {
                                buffer.position(info.offset)
                                buffer.limit(info.offset + info.size)
                                val chunk = ByteArray(info.size)
                                buffer.get(chunk)
                                pcm.write(chunk)
                            }
                        }
                        outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                        codec.releaseOutputBuffer(index, false)
                    }
                }
            }
        } finally {
            codec.stop()
            codec.release()
            extractor.release()
        }
        val normalized = resampleMono16(pcm.toByteArray(), sampleRate, channels, 16_000)
        return wav(normalized, 16_000, 1)
    }

    private fun resampleMono16(pcm: ByteArray, sourceRate: Int, channels: Int, targetRate: Int): ByteArray {
        require(channels > 0 && sourceRate > 0) { "音频参数无效" }
        val shorts = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        val frames = shorts.remaining() / channels
        require(frames > 0) { "视频音轨没有可识别的音频数据" }
        val mono = ShortArray(frames)
        for (frame in 0 until frames) {
            var sum = 0
            for (channel in 0 until channels) sum += shorts.get(frame * channels + channel).toInt()
            mono[frame] = (sum / channels).toShort()
        }
        val outputFrames = (frames.toDouble() * targetRate / sourceRate).roundToInt().coerceAtLeast(1)
        val output = ByteBuffer.allocate(outputFrames * 2).order(ByteOrder.LITTLE_ENDIAN)
        for (index in 0 until outputFrames) {
            val source = index.toDouble() * sourceRate / targetRate
            val left = source.toInt().coerceIn(0, mono.lastIndex)
            val right = (left + 1).coerceAtMost(mono.lastIndex)
            val fraction = source - left
            output.putShort((mono[left] * (1 - fraction) + mono[right] * fraction).roundToInt().toShort())
        }
        return output.array()
    }

    private fun wav(pcm: ByteArray, sampleRate: Int, channels: Int): ByteArray {
        val output = ByteArrayOutputStream()
        fun ascii(value: String) = output.write(value.toByteArray(Charsets.US_ASCII))
        fun short(value: Int) = output.write(ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(value.toShort()).array())
        fun int(value: Int) = output.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value).array())
        ascii("RIFF"); int(36 + pcm.size); ascii("WAVE")
        ascii("fmt "); int(16); short(1); short(channels); int(sampleRate); int(sampleRate * channels * 2); short(channels * 2); short(16)
        ascii("data"); int(pcm.size); output.write(pcm)
        return output.toByteArray()
    }

    private fun safeName(value: String): String = value.trim().ifEmpty { "流光视频" }.replace(Regex("[\\/:*?\"<>|]"), "_").take(80)
}
