package com.masterorange.liuguang.domain

data class CollectionJob(
    val id: String,
    val status: Status,
    val stage: Stage,
    val source: String,
    val title: String,
    val progress: Int,
    val feishuRecordId: String,
    val errorMessage: String,
    val canRetry: Boolean,
    val createdAt: String,
    val updatedAt: String,
) {
    val isActive: Boolean
        get() = status == Status.QUEUED || status == Status.RUNNING || status == Status.RETRY_WAIT

    enum class Status(val wireValue: String, val title: String) {
        QUEUED("queued", "等待处理"),
        RUNNING("running", "处理中"),
        RETRY_WAIT("retry_wait", "等待重试"),
        SUCCEEDED("succeeded", "已完成"),
        FAILED("failed", "失败"),
        UNKNOWN("unknown", "未知状态");

        companion object {
            fun fromWire(value: String): Status = entries.firstOrNull { it.wireValue == value } ?: UNKNOWN
        }
    }

    enum class Stage(val wireValue: String, val title: String) {
        QUEUED("queued", "排队"),
        METADATA("metadata", "解析作品"),
        MEDIA("media", "准备媒体"),
        TRANSCRIPT("transcript", "语音转写"),
        PROOFREAD("proofread", "校对逐字稿"),
        ANALYSIS("analysis", "分析内容"),
        ARCHIVE("archive", "写入飞书"),
        COMPLETED("completed", "完成"),
        UNKNOWN("unknown", "未知阶段");

        companion object {
            fun fromWire(value: String): Stage = entries.firstOrNull { it.wireValue == value } ?: UNKNOWN
        }
    }
}

data class WorkerVerification(
    val ok: Boolean,
    val feishuConfigured: Boolean,
    val speechConfigured: Boolean,
    val analysisConfigured: Boolean,
    val tableName: String,
) {
    val missingServices: List<String>
        get() = buildList {
            if (!feishuConfigured) add("飞书")
            if (!speechConfigured) add("语音转写")
            if (!analysisConfigured) add("内容分析")
        }
}
