package com.masterorange.liuguang.domain

data class DouyinMetadata(
    val sourceUrl: String,
    val canonicalUrl: String,
    val awemeId: String,
    val title: String,
    val body: String,
    val hashtags: List<String>,
    val author: String?,
    val douyinId: String?,
    val authorUrl: String?,
    val coverUrls: List<String>,
    val videoUrls: List<String>,
    val likes: Int?,
    val favorites: Int?,
    val comments: Int?,
    val shares: Int?,
    val publishedAtMillis: Long?,
    val durationSeconds: Double?,
    val resolution: String?,
)

data class TranscriptResult(val text: String, val source: String)
