package com.masterorange.liuguang.domain

data class FeishuRecordField(
    val name: String,
    val text: String,
    val values: List<String> = emptyList(),
    val links: List<String> = emptyList(),
) {
    val isEmpty: Boolean get() = text.isBlank() && links.isEmpty()
}

data class FeishuCollectionRecord(
    val id: String,
    val fields: List<FeishuRecordField>,
    val createdAt: Long? = null,
    val modifiedAt: Long? = null,
) {
    fun field(name: String): FeishuRecordField? = fields.firstOrNull { it.name == name }

    fun text(vararg names: String): String? = names.firstNotNullOfOrNull { name ->
        field(name)?.text?.takeIf(String::isNotBlank)
    }

    fun link(vararg names: String): String? = names.firstNotNullOfOrNull { name ->
        field(name)?.links?.firstOrNull(String::isHttpsUrl) ?: field(name)?.text?.takeIf(String::isHttpsUrl)
    }

    val title: String get() = text("标题", "主题", "博主") ?: "未命名采集"
    val status: String get() = text("采集状态", "转写状态") ?: "—"
    val sourceSummary: String get() = text("抖音分享内容（粘贴这里）", "抖音分享内容", "原始链接").orEmpty()
    val coverUrl: String? get() = link("封面链接", "封面")
    val highlight: String? get() = text("爆款")
    val benchmark: String? get() = text("对标参考")
}

private fun String.isHttpsUrl(): Boolean = startsWith("https://", ignoreCase = true)
