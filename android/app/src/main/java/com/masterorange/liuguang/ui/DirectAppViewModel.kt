package com.masterorange.liuguang.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.masterorange.liuguang.data.DirectCollectionRepository
import com.masterorange.liuguang.data.DouyinDirectClient
import com.masterorange.liuguang.data.TranscriptOutcome
import com.masterorange.liuguang.domain.CollectionJob
import com.masterorange.liuguang.domain.FeishuCollectionRecord
import com.masterorange.liuguang.domain.UserServiceConfiguration
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

data class DirectAppUiState(
    val isConfigured: Boolean = false,
    val configuration: UserServiceConfiguration? = null,
    val jobs: List<CollectionJob> = emptyList(),
    val records: List<FeishuCollectionRecord> = emptyList(),
    val selectedRecord: FeishuCollectionRecord? = null,
    val sourceDraft: String = "",
    val isSubmitting: Boolean = false,
    val isLoadingRecords: Boolean = false,
    val recordsUpdatedAt: Long? = null,
    val recordsError: String? = null,
    val message: String? = null,
    val navigateToSubmitRequest: Long = 0,
    val toolBusy: Boolean = false,
    val toolStage: String? = null,
    val toolProgress: Int = 0,
    val transcriptOutcome: TranscriptOutcome? = null,
)

class DirectAppViewModel(private val repository: DirectCollectionRepository) : ViewModel() {
    private val mutableState = kotlinx.coroutines.flow.MutableStateFlow(initialState())
    val uiState: kotlinx.coroutines.flow.StateFlow<DirectAppUiState> = mutableState

    private fun initialState(): DirectAppUiState = runCatching {
        val configuration = repository.configuration()
        DirectAppUiState(isConfigured = configuration != null, configuration = configuration)
    }.getOrElse { DirectAppUiState(message = it.userMessage()) }

    fun saveConfiguration(configuration: UserServiceConfiguration) {
        runCatching { repository.save(configuration) }
            .onSuccess { update { it.copy(isConfigured = true, configuration = configuration.normalized(), message = null) } }
            .onFailure { error -> update { it.copy(message = error.userMessage()) } }
    }

    fun disconnect() {
        runCatching { repository.disconnect() }
            .onSuccess { mutableState.value = DirectAppUiState(message = "本机服务配置已清除") }
            .onFailure { error -> update { it.copy(message = error.userMessage()) } }
    }

    fun setSourceDraft(value: String) {
        if (value.length <= MAX_SOURCE_LENGTH) update { it.copy(sourceDraft = value) }
    }

    fun acceptSharedText(value: String) {
        val shared = value.trim().take(MAX_SOURCE_LENGTH)
        if (shared.isEmpty()) return
        update {
            it.copy(
                sourceDraft = shared,
                navigateToSubmitRequest = it.navigateToSubmitRequest + 1,
                message = if (value.length > MAX_SOURCE_LENGTH) "分享内容过长，已保留前 $MAX_SOURCE_LENGTH 个字符" else "已接收分享内容",
            )
        }
    }

    fun submit() {
        val source = mutableState.value.sourceDraft
        if (mutableState.value.isSubmitting || !DouyinDirectClient.isValid(source)) return
        val id = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val queued = CollectionJob(id, CollectionJob.Status.QUEUED, CollectionJob.Stage.QUEUED, source, "", 0, "", "", false, now, now)
        update { it.copy(jobs = listOf(queued) + it.jobs, sourceDraft = "", isSubmitting = true, message = null) }
        viewModelScope.launch {
            try {
                val outcome = repository.collect(source) { stage, progress, title, recordId ->
                    replaceJob(id, stage, progress, title, recordId, null)
                }
                replaceJob(id, CollectionJob.Stage.COMPLETED, 100, outcome.title, outcome.recordId, null)
                update { it.copy(isSubmitting = false, message = "采集任务已完成") }
                refreshRecords()
            } catch (error: Throwable) {
                replaceJob(id, null, null, null, null, error.userMessage())
                update { it.copy(isSubmitting = false, message = error.userMessage()) }
            }
        }
    }

    fun refreshRecords() {
        if (!mutableState.value.isConfigured || mutableState.value.isLoadingRecords) return
        update { it.copy(isLoadingRecords = true, recordsError = null) }
        viewModelScope.launch {
            runCatching { repository.listRecords() }
                .onSuccess { records -> update { it.copy(records = records, isLoadingRecords = false, recordsUpdatedAt = System.currentTimeMillis()) } }
                .onFailure { error -> update { it.copy(isLoadingRecords = false, recordsError = error.userMessage()) } }
        }
    }

    fun selectRecord(record: FeishuCollectionRecord?) = update { it.copy(selectedRecord = record) }

    fun saveVideo(source: String) {
        if (mutableState.value.toolBusy || !DouyinDirectClient.isValid(source)) return
        update { it.copy(toolBusy = true, toolStage = "正在解析并保存视频", toolProgress = 15, message = null) }
        viewModelScope.launch {
            runCatching { repository.saveVideo(source) }
                .onSuccess { title -> update { it.copy(toolBusy = false, toolStage = null, toolProgress = 100, message = "“$title”已保存到系统相册") } }
                .onFailure { error -> update { it.copy(toolBusy = false, toolStage = null, message = error.userMessage()) } }
        }
    }

    fun extractTranscript(source: String) {
        if (mutableState.value.toolBusy || !DouyinDirectClient.isValid(source)) return
        update { it.copy(toolBusy = true, toolStage = "正在解析抖音作品", toolProgress = 0, transcriptOutcome = null, message = null) }
        viewModelScope.launch {
            runCatching {
                repository.extractTranscript(source) { stage, progress -> update { it.copy(toolStage = stage, toolProgress = progress) } }
            }.onSuccess { outcome ->
                update { it.copy(toolBusy = false, toolStage = null, toolProgress = 100, transcriptOutcome = outcome) }
                refreshRecords()
            }.onFailure { error -> update { it.copy(toolBusy = false, toolStage = null, message = error.userMessage()) } }
        }
    }

    fun clearTranscriptOutcome() = update { it.copy(transcriptOutcome = null, toolProgress = 0) }
    fun consumeMessage() = update { it.copy(message = null) }

    private fun replaceJob(id: String, stage: CollectionJob.Stage?, progress: Int?, title: String?, recordId: String?, error: String?) {
        update { current ->
            current.copy(jobs = current.jobs.map { old ->
                if (old.id != id) old else old.copy(
                    status = when {
                        error != null -> CollectionJob.Status.FAILED
                        stage == CollectionJob.Stage.COMPLETED -> CollectionJob.Status.SUCCEEDED
                        else -> CollectionJob.Status.RUNNING
                    },
                    stage = stage ?: old.stage,
                    progress = progress ?: old.progress,
                    title = title ?: old.title,
                    feishuRecordId = recordId ?: old.feishuRecordId,
                    errorMessage = error.orEmpty(),
                    canRetry = false,
                    updatedAt = Instant.now().toString(),
                )
            })
        }
    }

    private fun update(transform: (DirectAppUiState) -> DirectAppUiState) { mutableState.value = transform(mutableState.value) }
    private fun Throwable.userMessage(): String = message?.takeIf(String::isNotBlank) ?: "操作失败，请检查网络与服务配置"

    class Factory(private val repository: DirectCollectionRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(DirectAppViewModel::class.java))
            return DirectAppViewModel(repository) as T
        }
    }

    companion object { const val MAX_SOURCE_LENGTH = 5000 }
}
