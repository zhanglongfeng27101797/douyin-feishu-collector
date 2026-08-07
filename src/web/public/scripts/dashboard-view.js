import { escapeHtml, formatDate, formatNumber, safeHttpsUrl, t } from "./ui.js";

const STAGES = [
  "metadata",
  "media",
  "transcript",
  "proofread",
  "analysis",
  "archive",
  "completed",
];

function selectedItem(state) {
  return state.items.find((item) => item.id === state.selectedId) || state.items[0] || null;
}

function outputText(value, fallback) {
  return value
    ? escapeHtml(value)
    : `<span class="placeholder-copy">${escapeHtml(fallback)}</span>`;
}

function metric(label, value) {
  return `<div><span>${label}</span><strong>${formatNumber(value)}</strong></div>`;
}

function renderSummary(elements, state) {
  const summary = state.summary || {};
  const values = [
    [t("summary.total"), summary.total ?? 0],
    [t("summary.running"), summary.running ?? 0],
    [t("summary.waiting"), summary.waiting ?? 0],
    [t("summary.completed"), summary.completed ?? 0],
  ];
  elements.summary.innerHTML = values
    .map(
      ([label, value]) =>
        `<article><span>${label}</span><strong>${formatNumber(value)}</strong></article>`,
    )
    .join("");
}

function renderPipeline(elements, state) {
  const current = selectedItem(state);
  const succeeded = current?.task?.kind === "success";
  const currentIndex = Math.max(
    0,
    STAGES.findIndex((id) => id === current?.task?.stage?.id),
  );
  elements.pipeline.innerHTML = STAGES.map((id, index) => {
    const classes = ["pipeline-step"];
    if (current && (index < currentIndex || succeeded)) classes.push("is-complete");
    if (current && !succeeded && index === currentIndex) classes.push("is-current");
    if (succeeded && id === "completed") classes.push("is-terminal");
    const nodeLabel = succeeded && id === "completed"
      ? '<span aria-hidden="true">✓</span><span class="sr-only">07</span>'
      : String(index + 1).padStart(2, "0");
    return `<div class="${classes.join(" ")}"><span class="pipeline-node">${nodeLabel}</span><span>${t(`pipeline.${id}`)}</span></div>`;
  }).join("");
}

function renderTasks(elements, state, onSelect) {
  const current = selectedItem(state);
  if (state.items.length === 0) {
    elements.taskList.innerHTML =
      `<div class="empty-list">${t("queue.empty")}</div>`;
    return;
  }
  elements.taskList.innerHTML = state.items
    .map((item) => {
      const selected = item.id === current?.id;
      const progress = Math.max(0, Math.min(100, item.task.progress));
      return `<button class="task-item${selected ? " is-selected" : ""}" type="button" data-id="${escapeHtml(item.id)}" data-kind="${escapeHtml(item.task.kind)}" aria-pressed="${selected}">
        <div class="task-meta">
          <span class="status-badge" data-kind="${escapeHtml(item.task.kind)}">${t(`task.${item.task.kind}`)}</span>
          <span class="task-time">${formatDate(item.modifiedAt)}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.author || t(`pipeline.${item.task.stage.id}`))}</p>
        <div class="task-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
      </button>`;
    })
    .join("");

  elements.taskList.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => onSelect(button.dataset.id));
  });
}

function analysisTemplate(item, uiState) {
  const hookTags = item.outputs.hookTypes.length
    ? item.outputs.hookTypes.map((tag) => `<b>${escapeHtml(tag)}</b>`).join("")
    : `<span class="placeholder-copy">${t("result.pendingHookTypes")}</span>`;
  const knowledge = item.outputs.knowledge
    ? `<details class="analysis-card is-wide knowledge-card"${uiState.knowledgeExpanded ? " open" : ""}>
        <summary><span>${t("result.knowledgeSummary")}</span><small>${t("result.expandKnowledge")}</small></summary>
        <p>${escapeHtml(item.outputs.knowledge)}</p>
      </details>`
    : `<article class="analysis-card is-wide"><span>${t("result.knowledge")}</span><p>${outputText("", t("result.pendingKnowledge"))}</p></article>`;

  return `<div class="analysis-grid">
    <article class="analysis-card"><span>${t("result.theme")}</span><strong>${outputText(item.outputs.theme, t("result.pendingAnalysis"))}</strong></article>
    <article class="analysis-card"><span>${t("result.hookType")}</span><div class="tag-list">${hookTags}</div></article>
    <article class="analysis-card is-wide"><span>${t("result.hook")}</span><p>${outputText(item.outputs.hook, t("result.pendingHook"))}</p></article>
    ${knowledge}
  </div>`;
}

function transcriptTemplate(item, uiState) {
  const hasTranscript = Boolean(item.outputs.transcript);
  const disabled = hasTranscript ? "" : " disabled";
  return `<div class="transcript-toolbar">
      <label class="transcript-search">
        <span class="sr-only">${t("result.searchTranscript")}</span>
        <input type="search" data-transcript-search placeholder="${t("result.searchPlaceholder")}" value="${escapeHtml(uiState.transcriptQuery)}"${disabled} />
      </label>
      <span class="transcript-count" data-transcript-count>${t("result.transcriptLength", { count: item.outputs.transcript.length })}</span>
      <div class="transcript-actions">
        <button class="quiet-button" type="button" data-transcript-copy${disabled}>${t("result.copyTranscript")}</button>
        <button class="quiet-button" type="button" data-transcript-download${disabled}>${t("result.downloadTranscript")}</button>
      </div>
    </div>
    <article class="transcript-card${uiState.transcriptExpanded ? " is-expanded" : ""}">
      <div class="transcript-meta">${escapeHtml(item.outputs.transcriptSource || t("result.pendingSource"))}</div>
      <p data-transcript-text></p>
    </article>
    <button class="transcript-toggle" type="button" data-transcript-toggle${disabled}>${t(uiState.transcriptExpanded ? "result.collapseTranscript" : "result.expandTranscript")}</button>`;
}

function detailTemplate(item, uiState) {
  const cover = safeHttpsUrl(item.coverUrl);
  const standardUrl = safeHttpsUrl(item.standardUrl);
  const canRetry = ["waiting", "failed"].includes(item.task.kind);
  const progress = Math.max(0, Math.min(100, item.task.progress));
  const retryText = item.task.nextRetryAt
    ? t("detail.retryAt", { time: formatDate(item.task.nextRetryAt) })
    : "";

  return `
    <div class="detail-header">
      <div class="cover-frame">${cover ? `<img src="${escapeHtml(cover)}" alt="${t("detail.coverAlt")}" />` : ""}</div>
      <div class="detail-title">
        <div class="detail-meta"><span>${escapeHtml(item.author || t("detail.pendingAuthor"))}</span><span>${item.duration ? t("detail.duration", { value: item.duration }) : t("detail.pendingDuration")}</span><span>${t(item.outputs.hasVideo ? "detail.videoArchived" : "detail.videoNotArchived")}</span></div>
        <h2>${escapeHtml(item.title)}</h2>
        ${standardUrl ? `<a href="${escapeHtml(standardUrl)}" target="_blank" rel="noreferrer">${t("detail.openOriginal")}</a>` : ""}
      </div>
    </div>
    <div class="status-card" data-kind="${escapeHtml(item.task.kind)}">
      <div class="status-row">
        <div><span class="status-label">${t("detail.currentStage")}</span><strong>${t(`pipeline.${item.task.stage.id}`)} · ${t(`task.${item.task.kind}`)}</strong></div>
        <span class="progress-value">${item.task.progress}%</span>
      </div>
      <div class="progress-track"><span style="width:${progress}%"></span></div>
      ${item.task.error ? `<div class="error-box">${escapeHtml(item.task.error)}${escapeHtml(retryText)}</div>` : ""}
      ${canRetry ? `<button class="retry-button" type="button" id="retry-button">${t("detail.retry")}</button>` : ""}
    </div>
    <div class="metric-row">
      ${metric(t("metric.likes"), item.metrics.likes)}${metric(t("metric.favorites"), item.metrics.favorites)}
      ${metric(t("metric.comments"), item.metrics.comments)}${metric(t("metric.shares"), item.metrics.shares)}
    </div>
    <section class="result-workspace">
      <div class="result-tabs" role="tablist" aria-label="${t("result.structure")}">
        <button type="button" role="tab" data-result-tab="analysis" aria-controls="analysis-panel">${t("result.analysisTab")}</button>
        <button type="button" role="tab" data-result-tab="transcript" aria-controls="transcript-panel">${t("result.transcriptTab")}</button>
      </div>
      <section class="result-panel" id="analysis-panel" role="tabpanel" data-result-panel="analysis">
        ${analysisTemplate(item, uiState)}
      </section>
      <section class="result-panel" id="transcript-panel" role="tabpanel" data-result-panel="transcript">
        ${transcriptTemplate(item, uiState)}
      </section>
    </section>`;
}

function countMatches(text, query) {
  if (!query) return 0;
  const source = text.toLocaleLowerCase();
  const target = query.toLocaleLowerCase();
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(target, offset)) >= 0) {
    count += 1;
    offset += target.length;
  }
  return count;
}

function renderTranscriptText(elements, item, uiState) {
  const target = elements.detail.querySelector("[data-transcript-text]");
  if (!target) return;
  const transcript = item.outputs.transcript || t("result.pendingTranscript");
  const query = uiState.transcriptQuery.trim();
  target.replaceChildren();
  if (!query || !item.outputs.transcript) {
    target.textContent = transcript;
  } else {
    const normalized = transcript.toLocaleLowerCase();
    const needle = query.toLocaleLowerCase();
    let cursor = 0;
    let match = normalized.indexOf(needle);
    while (match >= 0) {
      target.append(document.createTextNode(transcript.slice(cursor, match)));
      const mark = document.createElement("mark");
      mark.textContent = transcript.slice(match, match + query.length);
      target.append(mark);
      cursor = match + query.length;
      match = normalized.indexOf(needle, cursor);
    }
    target.append(document.createTextNode(transcript.slice(cursor)));
  }
  const count = countMatches(item.outputs.transcript, query);
  const counter = elements.detail.querySelector("[data-transcript-count]");
  if (counter) {
    counter.textContent = query
      ? t("result.searchCount", { count })
      : t("result.transcriptLength", { count: item.outputs.transcript.length });
  }
}

function updateResultTabs(elements, uiState) {
  elements.detail.querySelectorAll("[data-result-tab]").forEach((button) => {
    const selected = button.dataset.resultTab === uiState.activeTab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  elements.detail.querySelectorAll("[data-result-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.resultPanel !== uiState.activeTab;
  });
}

function downloadTranscript(item) {
  const blob = new Blob([item.outputs.transcript], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  const fileName = (item.title || item.awemeId || "视频逐字稿")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 80);
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.txt`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function renderDetail(elements, state, onRetry, onNotify, uiState) {
  const item = selectedItem(state);
  if (!item) {
    uiState.recordId = null;
    elements.detail.innerHTML =
      `<div class="empty-detail"><span class="empty-orbit"></span><h2>${t("detail.emptyTitle")}</h2><p>${t("detail.emptyDescription")}</p></div>`;
    return;
  }
  if (uiState.recordId !== item.id) {
    uiState.recordId = item.id;
    uiState.activeTab = "analysis";
    uiState.transcriptQuery = "";
    uiState.transcriptExpanded = false;
    uiState.knowledgeExpanded = false;
  }
  elements.detail.innerHTML = detailTemplate(item, uiState);
  updateResultTabs(elements, uiState);
  renderTranscriptText(elements, item, uiState);

  elements.detail.querySelector("#retry-button")?.addEventListener("click", (event) => {
    onRetry(item.id, event.currentTarget);
  });
  elements.detail.querySelectorAll("[data-result-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.activeTab = button.dataset.resultTab;
      updateResultTabs(elements, uiState);
    });
  });
  elements.detail.querySelector("[data-transcript-search]")?.addEventListener("input", (event) => {
    uiState.transcriptQuery = event.currentTarget.value;
    renderTranscriptText(elements, item, uiState);
  });
  elements.detail.querySelector("[data-transcript-copy]")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(item.outputs.transcript);
      onNotify(t("toast.transcriptCopied"));
    } catch {
      onNotify(t("toast.copyFailed"));
    }
  });
  elements.detail.querySelector("[data-transcript-download]")?.addEventListener("click", () => {
    downloadTranscript(item);
  });
  elements.detail.querySelector("[data-transcript-toggle]")?.addEventListener("click", (event) => {
    uiState.transcriptExpanded = !uiState.transcriptExpanded;
    elements.detail.querySelector(".transcript-card")?.classList.toggle("is-expanded", uiState.transcriptExpanded);
    event.currentTarget.textContent = t(uiState.transcriptExpanded ? "result.collapseTranscript" : "result.expandTranscript");
  });
  elements.detail.querySelector(".knowledge-card")?.addEventListener("toggle", (event) => {
    uiState.knowledgeExpanded = event.currentTarget.open;
  });
}

export function createDashboardView({ elements, onSelect, onRetry, onNotify = () => {} }) {
  const uiState = {
    recordId: null,
    activeTab: "analysis",
    transcriptQuery: "",
    transcriptExpanded: false,
    knowledgeExpanded: false,
  };
  return {
    render(state) {
      renderSummary(elements, state);
      renderPipeline(elements, state);
      renderTasks(elements, state, onSelect);
      renderDetail(elements, state, onRetry, onNotify, uiState);
    },
    renderPipeline(state) {
      renderPipeline(elements, state);
    },
  };
}
