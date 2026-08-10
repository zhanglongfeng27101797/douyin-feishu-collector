package com.masterorange.liuguang.domain

data class CollectionJob(
    val id: String,
    val status: Status,
    val stage: Stage,
    val title: String,
    val progress: Int,
) {
    val isActive: Boolean
        get() = status == Status.QUEUED || status == Status.RUNNING

    enum class Status(val title: String) {
        QUEUED("等待处理"),
        RUNNING("处理中"),
        SUCCEEDED("已完成"),
        FAILED("失败"),
    }

    enum class Stage(val title: String) {
        QUEUED("排队"),
        METADATA("解析作品"),
        MEDIA("准备媒体"),
        TRANSCRIPT("语音转写"),
        ARCHIVE("写入飞书"),
        COMPLETED("完成"),
    }
}
