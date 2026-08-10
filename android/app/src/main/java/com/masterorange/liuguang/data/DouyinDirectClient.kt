package com.masterorange.liuguang.data

import com.masterorange.liuguang.domain.DouyinMetadata
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class DouyinDirectClient {
    suspend fun collect(input: String): DouyinMetadata {
        val sourceUrl = extractUrl(input) ?: error("请粘贴有效的抖音分享内容")
        val awemeId = resolveAwemeId(sourceUrl)
        val shareUrl = "https://www.iesdouyin.com/share/video/$awemeId/?from_ssr=1"
        val (html) = DirectHttpClient.text(shareUrl, mapOf("User-Agent" to MOBILE_USER_AGENT))
        val router = ROUTER_DATA.find(html)?.groupValues?.get(1)?.trim()?.trimEnd(';')
            ?: error("抖音分享页没有返回作品数据")
        val root = runCatching { DirectHttpClient.json.parseToJsonElement(router) }
            .getOrElse { error("抖音分享页数据无法读取") }
        val detail = findDetail(root, awemeId) ?: error("抖音分享页没有找到目标作品")
        return metadata(detail, awemeId, sourceUrl)
    }

    private suspend fun resolveAwemeId(url: String): String {
        AWEME_ID.find(url)?.groupValues?.get(1)?.let { return it }
        val (_, finalUrl) = DirectHttpClient.text(url, mapOf("User-Agent" to MOBILE_USER_AGENT))
        return AWEME_ID.find(finalUrl)?.groupValues?.get(1) ?: error("无法从分享链接识别作品编号")
    }

    private fun metadata(detail: JsonObject, awemeId: String, sourceUrl: String): DouyinMetadata {
        val description = detail.string("desc").orEmpty()
        val video = detail.objectValue("video")
        val author = detail.objectValue("author")
        val statistics = detail.objectValue("statistics")
        val videoUrls = videoCandidates(video)
        require(videoUrls.isNotEmpty()) { "作品没有可用的视频地址" }
        val structuredTags = detail.arrayValue("text_extra").mapNotNull { (it as? JsonObject)?.string("hashtag_name") }
        val inlineTags = HASHTAG.findAll(description).map { it.groupValues[1].trim() }.toList()
        val width = video.int("width")
        val height = video.int("height")
        return DouyinMetadata(
            sourceUrl = sourceUrl,
            canonicalUrl = "https://www.douyin.com/video/$awemeId",
            awemeId = awemeId,
            title = description.lineSequence().firstOrNull()?.trim().orEmpty(),
            body = description,
            hashtags = (structuredTags + inlineTags).filter(String::isNotBlank).distinct(),
            author = author.string("nickname"),
            douyinId = author.string("short_id") ?: author.string("unique_id"),
            authorUrl = author.string("sec_uid")?.let { "https://www.douyin.com/user/$it" },
            coverUrls = listOf("origin_cover", "cover", "dynamic_cover").flatMap {
                video.objectValue(it).stringArray("url_list")
            }.distinct(),
            videoUrls = videoUrls,
            likes = statistics.int("digg_count"),
            favorites = statistics.int("collect_count"),
            comments = statistics.int("comment_count"),
            shares = statistics.int("share_count"),
            publishedAtMillis = detail.long("create_time")?.times(1000),
            durationSeconds = video.double("duration")?.let { kotlin.math.round(it / 100.0) / 10.0 },
            resolution = if (width != null && height != null) "${width}x$height" else null,
        )
    }

    private fun videoCandidates(video: JsonObject): List<String> {
        val rates = video.arrayValue("bit_rate").mapNotNull { it as? JsonObject }.sortedByDescending {
            it.int("bit_rate") ?: it.int("bitrate") ?: 0
        }
        val raw = rates.flatMap { it.objectValue("play_addr").stringArray("url_list") } +
            video.objectValue("download_addr").stringArray("url_list") +
            video.objectValue("play_addr").stringArray("url_list")
        return raw.map {
            it.replace("/aweme/v1/playwm/", "/aweme/v1/play/")
                .replace("/aweme/v2/playwm/", "/aweme/v2/play/")
        }.distinct()
    }

    private fun findDetail(value: JsonElement, awemeId: String): JsonObject? = when (value) {
        is JsonObject -> {
            if (value.string("aweme_id") == awemeId && value["author"] != null && value["statistics"] != null) value
            else value.values.firstNotNullOfOrNull { findDetail(it, awemeId) }
        }
        is JsonArray -> value.firstNotNullOfOrNull { findDetail(it, awemeId) }
        else -> null
    }

    companion object {
        private const val MOBILE_USER_AGENT = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Mobile Safari/537.36"
        private val SHARE_URL = Regex("https?://[^\\s]+", RegexOption.IGNORE_CASE)
        private val AWEME_ID = Regex("/(?:video|share/video)/(\\d{10,})")
        private val ROUTER_DATA = Regex("window\\._ROUTER_DATA\\s*=\\s*(.*?)</script>", setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE))
        private val HASHTAG = Regex("#\\s*([^#\\s，。！？、,.!?:：;；]+)")

        fun extractUrl(input: String): String? = SHARE_URL.find(input)?.value?.trimEnd('。', '，', ',', '.', ')', '）')
        fun isValid(input: String): Boolean = extractUrl(input) != null
    }
}

internal fun JsonObject.objectValue(name: String): JsonObject = this[name] as? JsonObject ?: JsonObject(emptyMap())
internal fun JsonObject.arrayValue(name: String): JsonArray = this[name] as? JsonArray ?: JsonArray(emptyList())
internal fun JsonObject.string(name: String): String? = this[name]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank)
internal fun JsonObject.int(name: String): Int? = this[name]?.jsonPrimitive?.intOrNull
internal fun JsonObject.long(name: String): Long? = this[name]?.jsonPrimitive?.contentOrNull?.toLongOrNull()
internal fun JsonObject.double(name: String): Double? = this[name]?.jsonPrimitive?.doubleOrNull
internal fun JsonObject.stringArray(name: String): List<String> = arrayValue(name).mapNotNull { it.jsonPrimitive.contentOrNull }
