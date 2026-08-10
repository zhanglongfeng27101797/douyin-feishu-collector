package com.masterorange.liuguang.domain

import java.net.URI

enum class SpeechProvider(val title: String, val subtitle: String) {
    VOLCENGINE("火山引擎豆包语音", "国内推荐，额度充足、中文识别稳定"),
}

data class UserServiceConfiguration(
    val feishuAppId: String,
    val feishuAppSecret: String,
    val feishuBaseUrl: String,
    val speechProvider: SpeechProvider = SpeechProvider.VOLCENGINE,
    val speechApiKey: String,
) {
    fun normalized(): UserServiceConfiguration {
        val normalized = copy(
            feishuAppId = feishuAppId.trim(),
            feishuAppSecret = feishuAppSecret.trim(),
            feishuBaseUrl = feishuBaseUrl.trim(),
            speechApiKey = speechApiKey.trim(),
        )
        require(normalized.feishuAppId.isNotEmpty()) { "请填写飞书 App ID" }
        require(normalized.feishuAppSecret.isNotEmpty()) { "请填写飞书 App Secret" }
        require(isFeishuBaseUrl(normalized.feishuBaseUrl)) { "请填写飞书多维表格的完整链接" }
        require(normalized.speechApiKey.isNotEmpty()) { "请填写火山语音 API Key" }
        return normalized
    }

    companion object {
        fun isFeishuBaseUrl(value: String): Boolean = runCatching {
            val uri = URI(value.trim())
            val host = uri.host?.lowercase().orEmpty()
            uri.scheme.equals("https", ignoreCase = true) &&
                (host.matchesDomain("feishu.cn") || host.matchesDomain("larksuite.com")) &&
                uri.path.split('/').contains("base")
        }.getOrDefault(false)

        private fun String.matchesDomain(domain: String): Boolean = this == domain || endsWith(".$domain")
    }
}
