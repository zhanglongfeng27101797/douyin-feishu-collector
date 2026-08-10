package com.masterorange.liuguang.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

internal object DirectHttpClient {
    val json = Json { ignoreUnknownKeys = true }

    suspend fun json(
        url: String,
        method: String = "GET",
        headers: Map<String, String> = emptyMap(),
        body: JsonElement? = null,
        timeoutMillis: Int = 60_000,
    ): JsonObject = withContext(Dispatchers.IO) {
        val connection = open(url, method, headers, timeoutMillis)
        try {
            if (body != null) {
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.doOutput = true
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val status = connection.responseCode
            val bytes = responseBytes(connection, status)
            val text = bytes.toString(Charsets.UTF_8)
            require(status in 200..299) { "网络请求失败（HTTP $status）" }
            json.parseToJsonElement(text).jsonObject
        } finally {
            connection.disconnect()
        }
    }

    suspend fun text(url: String, headers: Map<String, String> = emptyMap()): Pair<String, String> = withContext(Dispatchers.IO) {
        val connection = open(url, "GET", headers, 60_000)
        try {
            val status = connection.responseCode
            val bytes = responseBytes(connection, status)
            require(status in 200..299) { "网络请求失败（HTTP $status）" }
            bytes.toString(Charsets.UTF_8) to connection.url.toString()
        } finally {
            connection.disconnect()
        }
    }

    suspend fun downloadToFile(
        urls: List<String>,
        headers: Map<String, String>,
        directory: File,
        maximumBytes: Long = 500L * 1024 * 1024,
    ): File = withContext(Dispatchers.IO) {
        var lastError: Throwable? = null
        for (url in urls) {
            val destination = File.createTempFile("liuguang-", ".mp4", directory)
            var connection: HttpURLConnection? = null
            try {
                connection = open(url, "GET", headers, 120_000)
                require(connection.responseCode in 200..299) { "视频下载失败（HTTP ${connection.responseCode}）" }
                var written = 0L
                connection.inputStream.use { input ->
                    destination.outputStream().buffered().use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            written += read
                            require(written <= maximumBytes) { "视频文件超过大小限制" }
                            output.write(buffer, 0, read)
                        }
                    }
                }
                require(written > 16 * 1024) { "下载的视频文件无效" }
                return@withContext destination
            } catch (error: Exception) {
                destination.delete()
                if (error is CancellationException) throw error
                lastError = error
            } finally {
                connection?.disconnect()
            }
        }
        throw lastError ?: IllegalStateException("作品没有可用的视频地址")
    }

    private fun open(url: String, method: String, headers: Map<String, String>, timeoutMillis: Int): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = timeoutMillis.coerceAtMost(30_000)
            readTimeout = timeoutMillis
            instanceFollowRedirects = true
            headers.forEach { (name, value) -> setRequestProperty(name, value) }
        }

    private fun responseBytes(connection: HttpURLConnection, status: Int): ByteArray {
        val input = if (status in 200..299) connection.inputStream else connection.errorStream
        return input?.use { it.readBytes() } ?: ByteArray(0)
    }
}

internal fun parseFeishuBaseReference(value: String): Pair<String, String?> {
    val uri = URI(value.trim())
    val parts = uri.path.split('/').filter(String::isNotBlank)
    val baseIndex = parts.indexOf("base")
    require(baseIndex >= 0 && baseIndex + 1 < parts.size) { "飞书多维表格链接无效" }
    val tableId = uri.query?.split('&')?.mapNotNull {
        val pair = it.split('=', limit = 2)
        pair.takeIf { values -> values.size == 2 && values[0] == "table" }
            ?.get(1)
            ?.let { URLDecoder.decode(it, StandardCharsets.UTF_8.toString()) }
    }?.firstOrNull()
    return parts[baseIndex + 1] to tableId
}

internal fun jsonCredentials(appId: String, appSecret: String) = buildJsonObject {
    put("app_id", appId)
    put("app_secret", appSecret)
}
