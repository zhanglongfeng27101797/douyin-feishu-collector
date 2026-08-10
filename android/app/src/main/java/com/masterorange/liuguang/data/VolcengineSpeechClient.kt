package com.masterorange.liuguang.data

import android.util.Base64
import com.masterorange.liuguang.domain.TranscriptResult
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.util.UUID

class VolcengineSpeechClient {
    suspend fun transcribe(wav: ByteArray, apiKey: String): TranscriptResult {
        require(wav.size <= 100 * 1024 * 1024) { "音频超过火山极速版 100MB 限制" }
        val identity = apiKey.trim()
        val body = buildJsonObject {
            putJsonObject("user") { put("uid", identity) }
            putJsonObject("audio") { put("data", Base64.encodeToString(wav, Base64.NO_WRAP)) }
            putJsonObject("request") { put("model_name", "bigmodel") }
        }
        val payload = DirectHttpClient.json(
            ENDPOINT,
            "POST",
            mapOf(
                "X-Api-Resource-Id" to "volc.bigasr.auc_turbo",
                "X-Api-Request-Id" to UUID.randomUUID().toString(),
                "X-Api-Sequence" to "-1",
                "X-Api-Key" to identity,
            ),
            body,
            timeoutMillis = 180_000,
        )
        val raw = payload.objectValue("result").string("text")?.trim().orEmpty()
        require(raw.isNotEmpty()) { "火山引擎没有返回有效逐字稿" }
        return TranscriptResult(cleanTranscript(raw), "火山引擎 豆包大模型录音文件极速版")
    }

    companion object {
        private const val ENDPOINT = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
        private val DOUYIN_SUFFIX = Regex("(?:[。！？!?]\\s*)?(?:抖音(?:记录美好生活)?|douyin)\\s*[。！？!?]*\\s*$", RegexOption.IGNORE_CASE)
        fun cleanTranscript(value: String): String = value.trim().replace(DOUYIN_SUFFIX, "").trim()
    }
}
