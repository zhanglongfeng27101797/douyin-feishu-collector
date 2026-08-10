package com.masterorange.liuguang.ui

import android.graphics.BitmapFactory
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.masterorange.liuguang.data.DouyinDirectClient
import com.masterorange.liuguang.domain.CollectionJob
import com.masterorange.liuguang.domain.FeishuCollectionRecord
import com.masterorange.liuguang.domain.FeishuRecordField
import com.masterorange.liuguang.domain.SpeechProvider
import com.masterorange.liuguang.domain.UserServiceConfiguration
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

private enum class MainTab(val title: String) {
    COLLECT("采集"),
    LIBRARY("采集库"),
    SETTINGS("设置"),
}

private enum class ToolRoute { VIDEO, TRANSCRIPT, TELEPROMPTER }

private enum class SettingsSection { FEISHU, BASE, SPEECH }

@Composable
fun LiuGuangRoot(viewModel: DirectAppViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    if (!state.isConfigured) {
        OnboardingScreen(snackbarHostState, viewModel::saveConfiguration)
    } else {
        MainShell(state, snackbarHostState, viewModel)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OnboardingScreen(
    snackbarHostState: SnackbarHostState,
    onSave: (UserServiceConfiguration) -> Unit,
) {
    var step by rememberSaveable { mutableIntStateOf(0) }
    var appId by rememberSaveable { mutableStateOf("") }
    var appSecret by remember { mutableStateOf("") }
    var baseUrl by rememberSaveable { mutableStateOf("") }
    var speechApiKey by remember { mutableStateOf("") }
    val totalSteps = 4
    val valid = when (step) {
        0 -> true
        1 -> appId.isNotBlank() && appSecret.isNotBlank()
        2 -> UserServiceConfiguration.isFeishuBaseUrl(baseUrl)
        else -> speechApiKey.isNotBlank()
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.22f)),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("✦  流光", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.weight(1f))
                    Text("${step + 1} / $totalSteps", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                LinearProgressIndicator(
                    progress = { (step + 1f) / totalSteps },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Box(Modifier.weight(1f)) {
                when (step) {
                    0 -> WelcomeStep()
                    1 -> FeishuStep(appId, { appId = it }, appSecret, { appSecret = it })
                    2 -> BaseStep(baseUrl, { baseUrl = it })
                    else -> SpeechStep(speechApiKey, { speechApiKey = it })
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(20.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (step > 0) {
                        OutlinedButton(onClick = { step -= 1 }) {
                            Text("上一步")
                        }
                    }
                    Button(
                        onClick = {
                            if (step < totalSteps - 1) step += 1 else onSave(
                                UserServiceConfiguration(appId, appSecret, baseUrl, SpeechProvider.VOLCENGINE, speechApiKey),
                            )
                        },
                        modifier = Modifier.weight(1f),
                        enabled = valid,
                    ) {
                        Text(if (step == totalSteps - 1) "保存并进入工作台" else "下一步")
                    }
                }
            }
        }
    }
}

@Composable
private fun SetupPage(eyebrow: String, title: String, subtitle: String, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Box(
            Modifier
                .size(48.dp)
                .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text("✦", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary) }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(eyebrow, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        content()
    }
}

@Composable
private fun WelcomeStep() = SetupPage(
    eyebrow = "开始配置",
    title = "先准备好 3 项服务",
    subtitle = "流光不使用开发者的账号。飞书、表格和语音服务都由你自己创建，数据和费用也归你自己管理。",
) {
    SetupCard {
        RequirementRow("1", "飞书自建应用", "获取 App ID 和 App Secret")
        HorizontalDivider()
        RequirementRow("2", "飞书多维表格", "创建表格并把应用加为协作者")
        HorizontalDivider()
        RequirementRow("3", "火山引擎豆包语音", "开通极速版并创建 API Key")
    }
    PrivacyNote("App Secret 和 API Key 只保存在当前 Android 设备的 Keystore 中。")
}

@Composable
private fun FeishuStep(
    appId: String,
    onAppIdChange: (String) -> Unit,
    appSecret: String,
    onAppSecretChange: (String) -> Unit,
) = SetupPage(
    eyebrow = "第 1 步 · 飞书应用",
    title = "连接你自己的飞书",
    subtitle = "在飞书开放平台创建应用并开通多维表格权限。你的密钥只保存在当前设备。",
) {
    SetupCard {
        Text("App ID", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(
            value = appId,
            onValueChange = onAppIdChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("cli_xxxxxxxxx") },
            singleLine = true,
        )
        HorizontalDivider()
        Text("App Secret · 安全存储", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(
            value = appSecret,
            onValueChange = onAppSecretChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("粘贴 App Secret") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
        )
    }
    PrivacyNote("App Secret 会进入 Android Keystore，不会显示在界面、日志或上传到开发者服务器。")
}

@Composable
private fun BaseStep(value: String, onChange: (String) -> Unit) = SetupPage(
    eyebrow = "第 2 步 · 飞书表格",
    title = "选择内容写入位置",
    subtitle = "打开目标多维表格，复制浏览器地址并粘贴到下面。App 会从链接中读取 Base 信息。",
) {
    SetupCard {
        Text("多维表格链接", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("https://xxx.feishu.cn/base/...") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            singleLine = true,
        )
    }
    if (value.isNotEmpty()) StatusNote(
        UserServiceConfiguration.isFeishuBaseUrl(value),
        if (UserServiceConfiguration.isFeishuBaseUrl(value)) "已识别飞书多维表格链接" else "请粘贴以 https:// 开头的飞书 Base 链接",
    )
}

@Composable
private fun SpeechStep(value: String, onChange: (String) -> Unit) = SetupPage(
    eyebrow = "第 3 步 · 语音识别",
    title = "连接火山语音",
    subtitle = "基础版先接通我们现有后台使用的火山极速转写。其他服务商将在基础链路稳定后增加。",
) {
    SetupCard {
        RequirementRow("✓", "火山引擎豆包语音", "国内推荐，额度充足、中文识别稳定")
    }
    SetupCard {
        Text("API Key · 安全存储", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("粘贴火山引擎豆包语音的 API Key") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
        )
    }
    PrivacyNote("只保存配置，不额外发起测试请求，也不会消耗你的模型额度。")
}

@Composable
private fun SetupCard(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(20.dp))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        content = { content() },
    )
}

@Composable
private fun RequirementRow(number: String, title: String, detail: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(
            Modifier
                .size(34.dp)
                .background(MaterialTheme.colorScheme.primary, CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text(number, color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold) }
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
        }
    }
}

@Composable
private fun PrivacyNote(text: String) {
    Text("🔒  $text", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun StatusNote(passed: Boolean, text: String) {
    val color = if (passed) Color(0xFF287A4B) else Color(0xFF9A6700)
    Text(
        text = (if (passed) "✓  " else "!  ") + text,
        modifier = Modifier
            .fillMaxWidth()
            .background(color.copy(alpha = 0.1f), RoundedCornerShape(14.dp))
            .padding(14.dp),
        color = color,
        fontWeight = FontWeight.SemiBold,
        style = MaterialTheme.typography.bodySmall,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(state: DirectAppUiState, snackbarHostState: SnackbarHostState, viewModel: DirectAppViewModel) {
    var currentTab by rememberSaveable { mutableStateOf(MainTab.COLLECT) }
    var toolRoute by rememberSaveable { mutableStateOf<ToolRoute?>(null) }
    val lifecycleOwner = LocalLifecycleOwner.current
    val context = LocalContext.current

    LaunchedEffect(state.navigateToSubmitRequest) {
        if (state.navigateToSubmitRequest > 0) {
            currentTab = MainTab.COLLECT
            toolRoute = null
            viewModel.selectRecord(null)
        }
    }
    LaunchedEffect(currentTab) {
        if (currentTab == MainTab.LIBRARY) {
            viewModel.refreshRecords()
            while (true) {
                delay(20_000)
                viewModel.refreshRecords()
            }
        }
    }
    DisposableEffect(lifecycleOwner, currentTab) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && currentTab == MainTab.LIBRARY) {
                viewModel.refreshRecords()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    state.selectedRecord?.let { record ->
        BackHandler { viewModel.selectRecord(null) }
        CollectionRecordDetailScreen(record, snackbarHostState) { viewModel.selectRecord(null) }
        return
    }

    toolRoute?.let { route ->
        BackHandler { toolRoute = null }
        when (route) {
            ToolRoute.VIDEO -> VideoSaveScreen(state, state.sourceDraft, { toolRoute = null }, viewModel::saveVideo)
            ToolRoute.TRANSCRIPT -> TranscriptExtractionScreen(
                state,
                state.sourceDraft,
                { toolRoute = null; viewModel.clearTranscriptOutcome() },
                viewModel::extractTranscript,
            )
            ToolRoute.TELEPROMPTER -> TeleprompterEditorScreen { toolRoute = null }
        }
        return
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(currentTab.title) },
                actions = {
                    if (currentTab == MainTab.COLLECT) {
                        TextButton(onClick = { clipboardText(context)?.let(viewModel::acceptSharedText) }) { Text("粘贴") }
                    }
                    if (currentTab == MainTab.LIBRARY) {
                        IconButton(onClick = viewModel::refreshRecords, enabled = !state.isLoadingRecords) {
                            Icon(Icons.Default.Refresh, contentDescription = "刷新采集库")
                        }
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                MainTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = currentTab == tab,
                        onClick = { currentTab = tab },
                        icon = {
                            Icon(
                                imageVector = when (tab) {
                                    MainTab.COLLECT -> Icons.Default.AddCircle
                                    MainTab.LIBRARY -> Icons.AutoMirrored.Filled.List
                                    MainTab.SETTINGS -> Icons.Default.Settings
                                },
                                contentDescription = tab.title,
                            )
                        },
                        label = { Text(tab.title) },
                    )
                }
            }
        },
    ) { padding ->
        when (currentTab) {
            MainTab.COLLECT -> SubmitScreen(
                state,
                padding,
                viewModel::setSourceDraft,
                viewModel::submit,
                onOpenVideo = { toolRoute = ToolRoute.VIDEO },
                onOpenTranscript = { toolRoute = ToolRoute.TRANSCRIPT },
                onOpenTeleprompter = { toolRoute = ToolRoute.TELEPROMPTER },
            )
            MainTab.LIBRARY -> CollectionLibraryScreen(state, padding, viewModel::selectRecord)
            MainTab.SETTINGS -> SettingsScreen(state, padding, viewModel::saveConfiguration, viewModel::disconnect)
        }
    }
}

@Composable
private fun SubmitScreen(
    state: DirectAppUiState,
    padding: PaddingValues,
    onSourceChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onOpenVideo: () -> Unit,
    onOpenTranscript: () -> Unit,
    onOpenTeleprompter: () -> Unit,
) {
    val recognizedURL = DouyinDirectClient.extractUrl(state.sourceDraft)
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            SectionCard(title = "抖音分享内容") {
                OutlinedTextField(
                    value = state.sourceDraft,
                    onValueChange = onSourceChange,
                    modifier = Modifier.fillMaxWidth().height(180.dp),
                    placeholder = { Text("粘贴抖音分享按钮复制的完整内容……") },
                    supportingText = {
                        when {
                            recognizedURL != null -> Text("🔗  $recognizedURL", maxLines = 1, overflow = TextOverflow.Ellipsis)
                            state.sourceDraft.isNotEmpty() -> Text("没有识别到抖音链接", color = Color(0xFF9A6700))
                            else -> Text("${state.sourceDraft.length}/${DouyinDirectClient.MAX_INPUT_LENGTH}")
                        }
                    },
                )
            }
        }
        item {
            Button(
                onClick = onSubmit,
                enabled = recognizedURL != null && !state.isSubmitting,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.isSubmitting) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Text(if (state.isSubmitting) "正在提交" else "开始采集")
            }
        }
        item {
            SectionCard(title = "快捷工具") {
                QuickToolRow("保存无水印视频", "解析可用播放流，并保存到系统相册", onOpenVideo)
                HorizontalDivider()
                QuickToolRow("提取逐字稿", "只转文字，并保存到飞书逐字稿库", onOpenTranscript)
                HorizontalDivider()
                QuickToolRow("提词器", "编辑文稿、保存草稿并匀速滚动提词", onOpenTeleprompter)
            }
        }
        state.jobs.firstOrNull()?.let { job ->
            item {
                SectionCard(title = "已开始") {
                    Text("✓  采集任务已创建", color = Color(0xFF287A4B), fontWeight = FontWeight.SemiBold)
                    Text(
                        if (job.isActive) "请暂时保持 App 在前台。完成后，逐字稿会直接写入你的飞书多维表格。" else "最近任务：${job.status.title}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun QuickToolRow(title: String, subtitle: String, onClick: () -> Unit) {
    TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.Start) {
            Text(title, color = MaterialTheme.colorScheme.onSurface)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text("›", style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = { content() },
        )
    }
}

@Composable
private fun CollectionLibraryScreen(state: DirectAppUiState, padding: PaddingValues, onOpenRecord: (FeishuCollectionRecord) -> Unit) {
    val activeJob = state.jobs.firstOrNull { it.isActive }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("${state.records.size} 条记录", fontWeight = FontWeight.SemiBold)
                    Text(
                        if (state.isLoadingRecords) "正在读取飞书多维表格" else state.recordsUpdatedAt?.let { "更新于 ${formatTime(it)}" } ?: "正在读取飞书多维表格",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text("✓ 飞书同步", color = if (state.recordsError == null) Color(0xFF287A4B) else Color(0xFF9A6700), style = MaterialTheme.typography.labelMedium)
            }
        }
        activeJob?.let { job ->
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f), RoundedCornerShape(14.dp))
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("正在采集", fontWeight = FontWeight.SemiBold)
                        Text("${job.stage.title} · ${job.progress}%", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        if (state.records.isEmpty() && !state.isLoadingRecords) {
            item {
                Box(Modifier.fillParentMaxHeight(0.72f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("采集库暂时为空", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                        Text(state.recordsError ?: "采集完成的内容会自动出现在这里", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        } else {
            items(state.records, key = { it.id }) { record ->
                CollectionRecordCard(record = record, onClick = { onOpenRecord(record) })
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun CollectionRecordCard(record: FeishuCollectionRecord, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            RemoteCover(record.coverUrl, Modifier.size(width = 108.dp, height = 138.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(record.status, color = statusColor(record.status), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.weight(1f))
                    record.highlight?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = Color(0xFF9A6700)) }
                }
                Text(record.title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (record.sourceSummary.isNotBlank()) Text(record.sourceSummary, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                record.benchmark?.let { Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall) }
                record.field("话题标签")?.values?.take(3)?.takeIf(List<String>::isNotEmpty)?.let {
                    Text(it.joinToString("  ") { tag -> "#$tag" }, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun RemoteCover(url: String?, modifier: Modifier = Modifier) {
    val bitmap by produceState<android.graphics.Bitmap?>(initialValue = null, key1 = url) {
        value = if (url == null) null else withContext(Dispatchers.IO) {
            runCatching {
                val connection = URL(url).openConnection().apply { connectTimeout = 10_000; readTimeout = 15_000 }
                connection.getInputStream().use(BitmapFactory::decodeStream)
            }.getOrNull()
        }
    }
    Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
        bitmap?.let {
            Image(it.asImageBitmap(), contentDescription = "作品封面", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } ?: Text("图片", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun statusColor(status: String): Color = when {
    status.contains("成功") -> Color(0xFF287A4B)
    status.contains("失败") -> Color(0xFFBA1A1A)
    else -> Color(0xFF9A6700)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CollectionRecordDetailScreen(
    record: FeishuCollectionRecord,
    snackbarHostState: SnackbarHostState,
    onBack: () -> Unit,
) {
    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(record.status) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回") } },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                SectionCard(title = record.status) {
                    Text(record.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    record.text("博主")?.let { Text("作者：$it", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        record.highlight?.let { Text(it, color = Color(0xFF9A6700), style = MaterialTheme.typography.labelMedium) }
                        record.benchmark?.let { Text(it, style = MaterialTheme.typography.labelMedium) }
                    }
                }
            }
            items(record.fields.filterNot(FeishuRecordField::isEmpty), key = { it.name }) { field ->
                SectionCard(title = field.name) { Text(field.text) }
            }
        }
    }
}

@Composable
private fun SettingsScreen(
    state: DirectAppUiState,
    padding: PaddingValues,
    onSave: (UserServiceConfiguration) -> Unit,
    onDisconnect: () -> Unit,
) {
    val current = state.configuration ?: return
    var appId by rememberSaveable(current.feishuAppId) { mutableStateOf(current.feishuAppId) }
    var appSecret by remember(current.feishuAppSecret) { mutableStateOf(current.feishuAppSecret) }
    var baseUrl by rememberSaveable(current.feishuBaseUrl) { mutableStateOf(current.feishuBaseUrl) }
    var speechApiKey by remember(current.speechApiKey) { mutableStateOf(current.speechApiKey) }
    var editing by remember { mutableStateOf<SettingsSection?>(null) }
    var confirmDisconnect by remember { mutableStateOf(false) }
    val pendingConfiguration = UserServiceConfiguration(
        appId,
        appSecret,
        baseUrl,
        SpeechProvider.VOLCENGINE,
        speechApiKey,
    )
    val canSaveConfiguration = runCatching { pendingConfiguration.normalized() }.isSuccess

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            SectionCard(title = "服务配置") {
                SettingsRow("飞书应用凭证", if (editing == SettingsSection.FEISHU) "正在编辑" else "已配置")
                HorizontalDivider()
                SettingsRow("目标多维表格", if (editing == SettingsSection.BASE) "正在编辑" else "已配置")
                HorizontalDivider()
                SettingsRow("火山语音 API Key", if (editing == SettingsSection.SPEECH) "正在编辑" else "已配置")
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TextButton(onClick = { editing = SettingsSection.FEISHU }) { Text("飞书") }
                    TextButton(onClick = { editing = SettingsSection.BASE }) { Text("表格") }
                    TextButton(onClick = { editing = SettingsSection.SPEECH }) { Text("语音") }
                }
                Text("哪项配置有问题，就只修改并保存该项；其他凭证不会被清除。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (editing != null) {
            item {
                SectionCard(title = when (editing) {
                    SettingsSection.FEISHU -> "飞书应用凭证"
                    SettingsSection.BASE -> "目标多维表格"
                    SettingsSection.SPEECH -> "火山语音"
                    null -> return@item
                }) {
                    when (editing) {
                        SettingsSection.FEISHU -> {
                            OutlinedTextField(appId, { appId = it }, Modifier.fillMaxWidth(), label = { Text("App ID") }, singleLine = true)
                            OutlinedTextField(appSecret, { appSecret = it }, Modifier.fillMaxWidth(), label = { Text("App Secret") }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
                        }
                        SettingsSection.BASE -> OutlinedTextField(baseUrl, { baseUrl = it }, Modifier.fillMaxWidth(), label = { Text("飞书 Base 链接") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
                        SettingsSection.SPEECH -> OutlinedTextField(speechApiKey, { speechApiKey = it }, Modifier.fillMaxWidth(), label = { Text("火山语音 API Key") }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
                        null -> Unit
                    }
                    Button(onClick = {
                        onSave(pendingConfiguration)
                        editing = null
                    }, modifier = Modifier.fillMaxWidth(), enabled = canSaveConfiguration) {
                        Text("保存")
                    }
                }
            }
        }
        item {
            SectionCard(title = "账号与服务") {
                SettingsRow("凭证归属", "用户自有")
                Text("飞书和语音服务使用你自己的账号。敏感密钥仅保存在 Android Keystore。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            SectionCard(title = "系统分享") {
                Text("在抖音中选择“分享 → 更多 → 流光”")
                Text("分享内容会回填到采集页，确认后再创建任务。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            OutlinedButton(onClick = { confirmDisconnect = true }, modifier = Modifier.fillMaxWidth()) {
                Text("断开并清除本机凭证", color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (confirmDisconnect) {
        AlertDialog(
            onDismissRequest = { confirmDisconnect = false },
            title = { Text("确定清除本机服务配置？") },
            text = { Text("将删除 Android Keystore 中的飞书与语音服务凭证和当前任务列表，不会删除飞书中的数据。") },
            confirmButton = {
                TextButton(onClick = { confirmDisconnect = false; onDisconnect() }) {
                    Text("清除配置", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDisconnect = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun SettingsRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f))
        Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

private fun formatTime(value: Long): String = java.time.Instant.ofEpochMilli(value)
    .atZone(ZoneId.systemDefault())
    .format(DateTimeFormatter.ofPattern("HH:mm"))
