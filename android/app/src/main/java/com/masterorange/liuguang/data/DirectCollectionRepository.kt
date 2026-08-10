package com.masterorange.liuguang.data

import android.content.Context
import com.masterorange.liuguang.domain.CollectionJob
import com.masterorange.liuguang.domain.FeishuCollectionRecord
import com.masterorange.liuguang.domain.TranscriptResult
import com.masterorange.liuguang.domain.UserServiceConfiguration

data class CollectionOutcome(val title: String, val recordId: String)
data class TranscriptOutcome(val title: String, val author: String?, val transcript: String, val reusedExisting: Boolean)

class DirectCollectionRepository(
    context: Context,
    private val configurationStore: UserConfigurationStore,
    private val douyin: DouyinDirectClient = DouyinDirectClient(),
    private val feishu: FeishuDirectClient = FeishuDirectClient(),
    private val speech: VolcengineSpeechClient = VolcengineSpeechClient(),
) {
    private val media = AndroidMediaProcessor(context)

    fun configuration(): UserServiceConfiguration? = configurationStore.load()
    fun save(configuration: UserServiceConfiguration) = configurationStore.save(configuration)
    fun disconnect() = configurationStore.clear()

    suspend fun listRecords(): List<FeishuCollectionRecord> {
        val configuration = requireConfiguration()
        return feishu.listRecords(feishu.prepare(configuration))
    }

    suspend fun collect(
        source: String,
        progress: (CollectionJob.Stage, Int, String?, String?) -> Unit,
    ): CollectionOutcome {
        val configuration = requireConfiguration()
        progress(CollectionJob.Stage.METADATA, 8, null, null)
        val context = feishu.prepare(configuration)
        val metadata = douyin.collect(source)
        progress(CollectionJob.Stage.ARCHIVE, 28, metadata.title, null)
        val recordId = feishu.createInitialRecord(context, source, metadata)
        try {
            progress(CollectionJob.Stage.MEDIA, 42, metadata.title, recordId)
            val wav = media.prepareWav(metadata.videoUrls)
            progress(CollectionJob.Stage.TRANSCRIPT, 67, metadata.title, recordId)
            val transcript = speech.transcribe(wav, configuration.speechApiKey)
            progress(CollectionJob.Stage.ARCHIVE, 90, metadata.title, recordId)
            feishu.updateTranscript(context, recordId, transcript)
            progress(CollectionJob.Stage.COMPLETED, 100, metadata.title, recordId)
            return CollectionOutcome(metadata.title, recordId)
        } catch (error: Throwable) {
            runCatching { feishu.markFailed(context, recordId, error.message ?: "采集失败") }
            throw error
        }
    }

    suspend fun extractTranscript(source: String, progress: (String, Int) -> Unit): TranscriptOutcome {
        val configuration = requireConfiguration()
        progress("正在解析抖音作品", 8)
        val metadata = douyin.collect(source)
        progress("正在查询逐字稿库", 25)
        val context = feishu.prepareTranscriptLibrary(configuration)
        feishu.transcriptRecord(context, metadata.awemeId)?.takeIf { it.second.isNotBlank() }?.let { existing ->
            return TranscriptOutcome(metadata.title, metadata.author, existing.second, true)
        }
        val recordId = feishu.createTranscriptRecord(context, source, metadata)
        progress("正在准备视频音频", 38)
        try {
            val wav = media.prepareWav(metadata.videoUrls)
            progress("正在识别视频内容", 65)
            val transcript = speech.transcribe(wav, configuration.speechApiKey)
            progress("正在保存到飞书", 90)
            feishu.updateTranscriptLibrary(context, recordId, transcript)
            progress("完成", 100)
            return TranscriptOutcome(metadata.title, metadata.author, transcript.text, false)
        } catch (error: Throwable) {
            runCatching { feishu.markTranscriptFailed(context, recordId, error.message ?: "逐字稿提取失败") }
            throw error
        }
    }

    suspend fun saveVideo(source: String): String {
        val metadata = douyin.collect(source)
        val video = media.downloadVideo(metadata.videoUrls)
        try {
            media.saveVideo(video, metadata.title)
        } finally {
            video.delete()
        }
        return metadata.title
    }

    private fun requireConfiguration(): UserServiceConfiguration = configurationStore.load() ?: error("请先完成服务配置")
}
