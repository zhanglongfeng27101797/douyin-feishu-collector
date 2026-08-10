package com.masterorange.liuguang.data

import com.masterorange.liuguang.domain.DouyinMetadata
import com.masterorange.liuguang.domain.FeishuCollectionRecord
import com.masterorange.liuguang.domain.FeishuRecordField
import com.masterorange.liuguang.domain.TranscriptResult
import com.masterorange.liuguang.domain.UserServiceConfiguration
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

data class FeishuField(val name: String, val type: Int)
data class FeishuTableContext(val token: String, val appToken: String, val tableId: String, val fields: List<FeishuField>)

class FeishuDirectClient {
    suspend fun prepare(configuration: UserServiceConfiguration): FeishuTableContext {
        val (appToken, selectedTableId) = parseFeishuBaseReference(configuration.feishuBaseUrl)
        val token = tenantToken(configuration.feishuAppId, configuration.feishuAppSecret)
        val tableId = selectedTableId ?: listTables(token, appToken)
            .firstOrNull { it.string("name") == "采集库" }
            ?.string("table_id")
            ?: listTables(token, appToken).firstOrNull()?.string("table_id")
            ?: error("飞书多维表格中没有可用的数据表")
        return FeishuTableContext(token, appToken, tableId, listFields(token, appToken, tableId))
    }

    suspend fun prepareTranscriptLibrary(configuration: UserServiceConfiguration): FeishuTableContext {
        val (appToken) = parseFeishuBaseReference(configuration.feishuBaseUrl)
        val token = tenantToken(configuration.feishuAppId, configuration.feishuAppSecret)
        val tableId = listTables(token, appToken).firstOrNull { it.string("name") == "逐字稿库" }?.string("table_id")
            ?: createTranscriptLibrary(token, appToken)
        return FeishuTableContext(token, appToken, tableId, listFields(token, appToken, tableId))
    }

    suspend fun transcriptRecord(context: FeishuTableContext, awemeId: String): Pair<String, String>? {
        var pageToken: String? = null
        do {
            val suffix = pageToken?.let { "&page_token=${encode(it)}" }.orEmpty()
            val data = api("/bitable/v1/apps/${context.appToken}/tables/${context.tableId}/records?page_size=100$suffix", context.token)
            data.arrayValue("items").mapNotNull { it as? JsonObject }.forEach { item ->
                val fields = item["fields"] as? JsonObject ?: return@forEach
                if (displayValue(fields["作品ID"] ?: JsonNull, null).first == awemeId) {
                    val recordId = item.string("record_id") ?: return@forEach
                    return recordId to displayValue(fields["视频逐字稿"] ?: JsonNull, null).first
                }
            }
            pageToken = if (data["has_more"]?.jsonPrimitive?.booleanOrNull == true) data.string("page_token") else null
        } while (pageToken != null)
        return null
    }

    suspend fun createTranscriptRecord(
        context: FeishuTableContext,
        source: String,
        metadata: DouyinMetadata,
    ): String = createRecord(
        context,
        mapOf(
            "标题" to metadata.title,
            "作品ID" to metadata.awemeId,
            "原始分享内容" to source,
            "标准链接" to metadata.canonicalUrl,
            "博主" to metadata.author,
            "提取时间" to System.currentTimeMillis(),
            "转写状态" to "提取中",
            "错误原因" to "",
        ),
    )

    suspend fun updateTranscriptLibrary(context: FeishuTableContext, recordId: String, transcript: TranscriptResult) {
        updateRecord(
            context,
            recordId,
            mapOf(
                "视频逐字稿" to transcript.text,
                "提取时间" to System.currentTimeMillis(),
                "转写状态" to "成功（需校对）",
                "转写来源" to transcript.source,
                "错误原因" to "",
            ),
        )
    }

    suspend fun markTranscriptFailed(context: FeishuTableContext, recordId: String, message: String) {
        updateRecord(
            context,
            recordId,
            mapOf("提取时间" to System.currentTimeMillis(), "转写状态" to "失败", "错误原因" to message),
        )
    }

    suspend fun listRecords(context: FeishuTableContext, maximumCount: Int = 500): List<FeishuCollectionRecord> {
        val records = mutableListOf<FeishuCollectionRecord>()
        var pageToken: String? = null
        do {
            val suffix = pageToken?.let { "&page_token=${encode(it)}" }.orEmpty()
            val data = api(
                "/bitable/v1/apps/${context.appToken}/tables/${context.tableId}/records?page_size=100$suffix",
                context.token,
            )
            data.arrayValue("items").mapNotNullTo(records) { decodeRecord(it as? JsonObject ?: return@mapNotNullTo null, context.fields) }
            pageToken = if (data["has_more"]?.jsonPrimitive?.booleanOrNull == true) data.string("page_token") else null
        } while (pageToken != null && records.size < maximumCount)
        return records.take(maximumCount).sortedByDescending { it.modifiedAt ?: it.createdAt ?: 0 }
    }

    suspend fun createInitialRecord(context: FeishuTableContext, source: String, metadata: DouyinMetadata): String {
        val values = linkedMapOf<String, Any?>(
            "原始链接" to metadata.sourceUrl,
            "标准链接" to metadata.canonicalUrl,
            "作品ID" to metadata.awemeId,
            "标题" to metadata.title,
            "正文" to metadata.body,
            "话题标签" to metadata.hashtags,
            "博主" to metadata.author,
            "抖音号" to metadata.douyinId,
            "博主主页" to metadata.authorUrl,
            "封面链接" to metadata.coverUrls.firstOrNull(),
            "视频链接" to metadata.videoUrls.firstOrNull(),
            "点赞数" to metadata.likes,
            "收藏数" to metadata.favorites,
            "评论数" to metadata.comments,
            "分享数" to metadata.shares,
            "发布时间" to metadata.publishedAtMillis,
            "时长秒" to metadata.durationSeconds,
            "分辨率" to metadata.resolution,
            "采集时间" to System.currentTimeMillis(),
            "采集状态" to "采集中",
            "抖音分享内容（粘贴这里）" to source,
        )
        val data = api(
            "/bitable/v1/apps/${context.appToken}/tables/${context.tableId}/records",
            context.token,
            "POST",
            buildJsonObject { put("fields", mapValues(values, context.fields)) },
        )
        return data.objectValue("record").string("record_id") ?: error("飞书创建记录成功，但未返回记录编号")
    }

    suspend fun updateTranscript(context: FeishuTableContext, recordId: String, transcript: TranscriptResult) {
        updateRecord(
            context,
            recordId,
            mapOf(
                "视频逐字稿" to transcript.text,
                "转写状态" to "成功（需校对）",
                "转写时间" to System.currentTimeMillis(),
                "转写来源" to transcript.source,
                "逐字稿字数" to transcript.text.length,
                "转写错误原因" to "",
                "采集状态" to "成功",
            ),
        )
    }

    suspend fun markFailed(context: FeishuTableContext, recordId: String, message: String) {
        updateRecord(context, recordId, mapOf("采集状态" to "失败", "转写状态" to "失败", "转写错误原因" to message))
    }

    private suspend fun updateRecord(context: FeishuTableContext, recordId: String, values: Map<String, Any?>) {
        api(
            "/bitable/v1/apps/${context.appToken}/tables/${context.tableId}/records/$recordId",
            context.token,
            "PUT",
            buildJsonObject { put("fields", mapValues(values, context.fields, includeEmpty = true)) },
        )
    }

    private suspend fun tenantToken(appId: String, appSecret: String): String {
        val payload = DirectHttpClient.json(
            "$ROOT/auth/v3/tenant_access_token/internal",
            "POST",
            body = jsonCredentials(appId, appSecret),
        )
        require(payload.int("code") == 0) { "获取飞书凭证失败：${payload.string("msg") ?: "请检查 App ID、Secret 与应用权限"}" }
        return payload.string("tenant_access_token") ?: error("飞书没有返回访问凭证")
    }

    private suspend fun listTables(token: String, appToken: String): List<JsonObject> =
        api("/bitable/v1/apps/$appToken/tables?page_size=100", token).arrayValue("items").mapNotNull { it as? JsonObject }

    private suspend fun listFields(token: String, appToken: String, tableId: String): List<FeishuField> =
        api("/bitable/v1/apps/$appToken/tables/$tableId/fields?page_size=100", token).arrayValue("items").mapNotNull {
            val field = it as? JsonObject ?: return@mapNotNull null
            val name = field.string("field_name") ?: return@mapNotNull null
            val type = field.int("type") ?: return@mapNotNull null
            FeishuField(name, type)
        }

    private suspend fun createTranscriptLibrary(token: String, appToken: String): String {
        val fields = listOf(
            "标题" to 1, "作品ID" to 1, "原始分享内容" to 1, "标准链接" to 15,
            "博主" to 1, "视频逐字稿" to 1, "提取时间" to 5, "转写状态" to 1,
            "转写来源" to 1, "错误原因" to 1,
        )
        val data = api(
            "/bitable/v1/apps/$appToken/tables",
            token,
            "POST",
            buildJsonObject {
                putJsonObject("table") {
                    put("name", "逐字稿库")
                    put("default_view_name", "全部逐字稿")
                    put("fields", buildJsonArray {
                        fields.forEach { (name, type) -> add(buildJsonObject { put("field_name", name); put("type", type) }) }
                    })
                }
            },
        )
        return data.string("table_id") ?: error("逐字稿库已请求创建，但飞书没有返回数据表编号")
    }

    private suspend fun createRecord(context: FeishuTableContext, values: Map<String, Any?>): String {
        val data = api(
            "/bitable/v1/apps/${context.appToken}/tables/${context.tableId}/records",
            context.token,
            "POST",
            buildJsonObject { put("fields", mapValues(values, context.fields)) },
        )
        return data.objectValue("record").string("record_id") ?: error("飞书创建记录成功，但未返回记录编号")
    }

    private suspend fun api(path: String, token: String, method: String = "GET", body: JsonElement? = null): JsonObject {
        val payload = DirectHttpClient.json(
            ROOT + path,
            method,
            mapOf("Authorization" to "Bearer $token"),
            body,
        )
        require(payload.int("code") == 0) { "飞书接口失败：${payload.string("msg") ?: payload.int("code")}" }
        return payload["data"] as? JsonObject ?: JsonObject(emptyMap())
    }

    private fun mapValues(values: Map<String, Any?>, fields: List<FeishuField>, includeEmpty: Boolean = false): JsonObject {
        val definitions = fields.associateBy(FeishuField::name)
        return buildJsonObject {
            values.forEach { (name, value) ->
                val type = definitions[name]?.type ?: return@forEach
                if (!includeEmpty && value is String && value.isEmpty()) return@forEach
                if (value == null) return@forEach
                put(name, when (type) {
                    2 -> JsonPrimitive(value.toString().toDoubleOrNull() ?: 0.0)
                    4 -> JsonArray((value as? List<*>)?.map { JsonPrimitive(it.toString()) } ?: listOf(JsonPrimitive(value.toString())))
                    5 -> JsonPrimitive((value as? Number)?.toLong() ?: value.toString().toLongOrNull() ?: 0)
                    15 -> buildJsonObject { put("link", value.toString()); put("text", value.toString()) }
                    17 -> JsonArray(listOf(toJson(value)))
                    else -> if (value is List<*>) JsonPrimitive(value.joinToString(", ")) else toJson(value)
                })
            }
        }
    }

    private fun decodeRecord(item: JsonObject, fields: List<FeishuField>): FeishuCollectionRecord? {
        val recordId = item.string("record_id") ?: return null
        val rawFields = item["fields"] as? JsonObject ?: JsonObject(emptyMap())
        val orderedNames = fields.map(FeishuField::name) + rawFields.keys.filter { key -> fields.none { it.name == key } }.sorted()
        val definitions = fields.associateBy(FeishuField::name)
        val decoded = orderedNames.distinct().mapNotNull { name ->
            val raw = rawFields[name] ?: return@mapNotNull null
            val display = displayValue(raw, definitions[name]?.type)
            display.takeIf { it.first.isNotBlank() || it.third.isNotEmpty() }?.let {
                FeishuRecordField(name, it.first, it.second, it.third)
            }
        }
        return FeishuCollectionRecord(
            recordId,
            decoded,
            item["created_time"]?.jsonPrimitive?.longOrNull,
            item["last_modified_time"]?.jsonPrimitive?.longOrNull,
        )
    }

    private fun displayValue(value: JsonElement, type: Int?): Triple<String, List<String>, List<String>> = when (value) {
        is JsonPrimitive -> {
            val text = value.contentOrNull.orEmpty()
            Triple(text, listOfNotNull(text.takeIf(String::isNotBlank)), listOfNotNull(text.takeIf { it.startsWith("http") }))
        }
        is JsonArray -> {
            val values = value.map { displayValue(it, null) }
            val texts = values.flatMap { it.second }.distinct()
            Triple(texts.joinToString("、"), texts, values.flatMap { it.third })
        }
        is JsonObject -> {
            val text = value.string("text") ?: value.string("name") ?: value.string("value") ?: value.string("link") ?: value.string("url").orEmpty()
            val links = listOfNotNull(value.string("link"), value.string("url"), value.string("tmp_url"))
            Triple(text, listOfNotNull(text.takeIf(String::isNotBlank)), links)
        }
        JsonNull -> Triple("", emptyList(), emptyList())
    }

    private fun toJson(value: Any): JsonElement = when (value) {
        is Number -> JsonPrimitive(value)
        is Boolean -> JsonPrimitive(value)
        else -> JsonPrimitive(value.toString())
    }

    private fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8.toString())

    companion object { private const val ROOT = "https://open.feishu.cn/open-apis" }
}
