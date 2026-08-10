package com.masterorange.liuguang.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.ClipData
import android.content.ClipboardManager
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.masterorange.liuguang.data.DouyinDirectClient
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoSaveScreen(state: DirectAppUiState, onBack: () -> Unit, onSave: (String) -> Unit) {
    var source by rememberSaveable { mutableStateOf("") }
    var showNotice by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) onSave(source)
    }
    fun saveWithPermission() {
        if (Build.VERSION.SDK_INT >= 29 || context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
            onSave(source)
        } else {
            permissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("保存无水印视频") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回") } },
                actions = { TextButton(onClick = { clipboardText(context)?.let { source = it } }) { Text("粘贴") } },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("抖音分享内容", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(source, { source = it }, Modifier.fillMaxWidth().height(180.dp), placeholder = { Text("粘贴抖音分享按钮复制的完整内容……") })
            Text("将尝试获取作品可用的高质量播放流，并保存到系统相册。", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(onClick = { showNotice = true }, enabled = !state.toolBusy && DouyinDirectClient.isValid(source), modifier = Modifier.fillMaxWidth()) {
                if (state.toolBusy) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Spacer(Modifier.width(8.dp)) }
                Text(if (state.toolBusy) "正在保存" else "保存无水印视频到相册")
            }
            state.toolStage?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
    if (showNotice) {
        AlertDialog(
            onDismissRequest = { showNotice = false },
            title = { Text("使用说明") },
            text = { Text("本功能仅用于保存你本人创作、已获作者授权，或依法允许用于个人学习交流的视频。请尊重原创和平台规则，禁止未经授权转载、传播或商用。") },
            confirmButton = { TextButton(onClick = { showNotice = false; saveWithPermission() }) { Text("我已知晓并继续") } },
            dismissButton = { TextButton(onClick = { showNotice = false }) { Text("取消") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TranscriptExtractionScreen(state: DirectAppUiState, onBack: () -> Unit, onExtract: (String) -> Unit) {
    var source by rememberSaveable { mutableStateOf("") }
    val context = LocalContext.current
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("提取逐字稿") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回") } },
                actions = { TextButton(onClick = { clipboardText(context)?.let { source = it } }) { Text("粘贴") } },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("抖音分享内容", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(source, { source = it }, Modifier.fillMaxWidth().height(180.dp), placeholder = { Text("粘贴抖音分享按钮复制的完整内容……") })
            Text("只进行逐字稿提取，不执行爆款判断、钩子分析和内容提炼。", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(onClick = { onExtract(source) }, enabled = !state.toolBusy && DouyinDirectClient.isValid(source), modifier = Modifier.fillMaxWidth()) {
                if (state.toolBusy) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Spacer(Modifier.width(8.dp)) }
                Text("提取逐字稿")
            }
            if (state.toolBusy) {
                LinearProgressIndicator(progress = { state.toolProgress / 100f }, modifier = Modifier.fillMaxWidth())
                Text(state.toolStage.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("请暂时保持流光在前台运行", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            state.transcriptOutcome?.let { outcome ->
                HorizontalDivider()
                Text(outcome.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                outcome.author?.let { Text("作者：$it", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Text(
                    if (outcome.reusedExisting) "已从逐字稿库读取，没有重复消耗转写额度" else "已保存到飞书副表“逐字稿库”",
                    color = Color(0xFF287A4B),
                    fontWeight = FontWeight.SemiBold,
                )
                Text(outcome.transcript)
                OutlinedButton(onClick = { setClipboardText(context, outcome.transcript) }) { Text("复制逐字稿") }
            }
        }
    }
}

private data class TeleprompterDraft(val id: String, val title: String, val content: String, val updatedAt: Long)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeleprompterEditorScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val drafts = remember { mutableStateListOf<TeleprompterDraft>().apply { addAll(loadDrafts(context)) } }
    var title by rememberSaveable { mutableStateOf("") }
    var content by rememberSaveable { mutableStateOf("") }
    var playerText by remember { mutableStateOf<String?>(null) }
    fun save() {
        if (content.isBlank()) return
        val resolved = title.trim().ifBlank { preview(content) }
        val draft = TeleprompterDraft(UUID.randomUUID().toString(), resolved, content, System.currentTimeMillis())
        drafts.removeAll { it.title == resolved && it.content == content }
        drafts.add(0, draft)
        persistDrafts(context, drafts)
        title = resolved
    }
    playerText?.let { TeleprompterPlayerScreen(it) { playerText = null }; return }
    Scaffold(
        topBar = { TopAppBar(title = { Text("提词器") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回") } }) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("文稿", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), placeholder = { Text("标题（可选）") }, singleLine = true)
            OutlinedTextField(content, { content = it }, Modifier.fillMaxWidth().height(300.dp), placeholder = { Text("粘贴或输入提词内容……") })
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${content.length} 字", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { clipboardText(context)?.let { content = it } }) { Text("粘贴") }
                TextButton(onClick = { save() }, enabled = content.isNotBlank()) { Text("存草稿") }
            }
            Button(onClick = { save(); playerText = content }, enabled = content.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("开始提词") }
            Text("草稿箱", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (drafts.isEmpty()) Text("还没有保存的草稿", color = MaterialTheme.colorScheme.onSurfaceVariant)
            drafts.take(5).forEach { draft ->
                TextButton(onClick = { title = draft.title; content = draft.content }, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.Start) {
                        Text(draft.title, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${draft.content.length} 字", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = { drafts.remove(draft); persistDrafts(context, drafts) }) { Text("删除", color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }
}

@Composable
private fun TeleprompterPlayerScreen(text: String, onClose: () -> Unit) {
    BackHandler(onBack = onClose)
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    var isPlaying by remember { mutableStateOf(false) }
    var speed by remember { mutableDoubleStateOf(34.0) }
    var fontSize by remember { mutableDoubleStateOf(46.0) }
    var countdown by remember { mutableIntStateOf(3) }
    var mirrored by remember { mutableStateOf(false) }
    var loop by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    LaunchedEffect(countdown) {
        if (countdown > 0) { delay(1000); countdown -= 1 } else isPlaying = true
    }
    LaunchedEffect(isPlaying, speed, loop) {
        while (isPlaying) {
            delay(50)
            val next = (scroll.value + speed / 20).toInt()
            if (next >= scroll.maxValue) {
                if (loop) scroll.scrollTo(0) else isPlaying = false
            } else scroll.scrollTo(next)
        }
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Text(
            text,
            modifier = Modifier.fillMaxSize().verticalScroll(scroll).padding(horizontal = 38.dp, vertical = 120.dp).graphicsLayer(scaleX = if (mirrored) -1f else 1f),
            color = Color.White,
            fontSize = fontSize.sp,
            lineHeight = (fontSize * 1.45).sp,
            fontWeight = FontWeight.Medium,
        )
        if (countdown > 0) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)), contentAlignment = Alignment.Center) {
            Text("$countdown", color = Color.White, fontSize = 92.sp, fontWeight = FontWeight.Bold)
        }
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onClose) { Text("关闭", color = Color.White) }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { fontSize = (fontSize - 4).coerceAtLeast(24.0) }) { Text("A−", color = Color.White) }
                TextButton(onClick = { fontSize = (fontSize + 4).coerceAtMost(90.0) }) { Text("A+", color = Color.White) }
                TextButton(onClick = { showSettings = true }) { Text("设置", color = Color.White) }
            }
            Spacer(Modifier.weight(1f))
            Row(Modifier.align(Alignment.CenterHorizontally).background(Color.Black.copy(alpha = 0.65f), RoundedCornerShape(40.dp)).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { isPlaying = false; countdown = 3; scope.launch { scroll.scrollTo(0) } }) { Text("从头", color = Color.White) }
                TextButton(onClick = { isPlaying = !isPlaying }) { Text(if (isPlaying) "暂停" else "播放", color = Color.White, fontSize = 22.sp) }
                TextButton(onClick = { showSettings = true }) { Text("调节", color = Color.White) }
            }
        }
    }
    if (showSettings) AlertDialog(
        onDismissRequest = { showSettings = false },
        title = { Text("提词设置") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("滚动速度")
                Slider(speed.toFloat(), { speed = it.toDouble() }, valueRange = 8f..100f)
                Text("字体大小")
                Slider(fontSize.toFloat(), { fontSize = it.toDouble() }, valueRange = 24f..90f)
                Row(verticalAlignment = Alignment.CenterVertically) { Text("循环播放", Modifier.weight(1f)); Switch(loop, { loop = it }) }
                Row(verticalAlignment = Alignment.CenterVertically) { Text("镜像模式", Modifier.weight(1f)); Switch(mirrored, { mirrored = it }) }
            }
        },
        confirmButton = { TextButton(onClick = { showSettings = false }) { Text("完成") } },
    )
}

private fun preview(text: String): String = text.trim().ifBlank { "未命名文稿" }.take(28)

internal fun clipboardText(context: Context): String? =
    context.getSystemService(ClipboardManager::class.java)?.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString()

private fun setClipboardText(context: Context, value: String) {
    context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("流光逐字稿", value))
}

private fun loadDrafts(context: Context): List<TeleprompterDraft> = runCatching {
    val raw = context.getSharedPreferences("liuguang.teleprompter", Context.MODE_PRIVATE).getString("drafts", "[]")!!
    Json.parseToJsonElement(raw).jsonArray.map { item ->
        val value = item.jsonObject
        TeleprompterDraft(
            value["id"]!!.jsonPrimitive.content,
            value["title"]!!.jsonPrimitive.content,
            value["content"]!!.jsonPrimitive.content,
            value["updatedAt"]!!.jsonPrimitive.longOrNull ?: 0,
        )
    }
}.getOrDefault(emptyList())

@SuppressLint("UseKtx") // 需要检查同步 commit 的返回值，避免界面提示已保存但落盘失败。
private fun persistDrafts(context: Context, drafts: List<TeleprompterDraft>) {
    val payload = buildJsonArray {
        drafts.forEach { draft ->
            add(buildJsonObject {
                put("id", draft.id); put("title", draft.title); put("content", draft.content); put("updatedAt", draft.updatedAt)
            })
        }
    }.toString()
    check(context.getSharedPreferences("liuguang.teleprompter", Context.MODE_PRIVATE).edit().putString("drafts", payload).commit())
}
