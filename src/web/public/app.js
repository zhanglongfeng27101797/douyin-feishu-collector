import { createDashboardView } from "./scripts/dashboard-view.js";
import {
  applyTranslations,
  createSettingsController,
  createThemeController,
  t,
} from "./scripts/ui.js";

async function post(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || t("errors.requestFailed", { status: response.status }));
  }
  return payload.data;
}

const dashboardApi = Object.freeze({
  list: () => post("/api/records/list"),
  get: (recordId) => post("/api/records/get", { recordId }),
  create: (input) => post("/api/records/create", { input }),
  retry: (recordId) => post("/api/records/retry", { recordId }),
  getSettings: () => post("/api/settings/get"),
  saveSettings: (settings) => post("/api/settings/save", settings),
  setupFeishu: (settings) => post("/api/settings/setup", settings),
});

const state = {
  items: [],
  summary: null,
  selectedId: null,
  refreshing: false,
  tableName: "",
  renderSignature: "",
};

const elements = {
  form: document.querySelector("#capture-form"),
  input: document.querySelector("#share-input"),
  submit: document.querySelector("#submit-button"),
  formMessage: document.querySelector("#form-message"),
  refresh: document.querySelector("#refresh-button"),
  systemPill: document.querySelector("#system-pill"),
  systemText: document.querySelector("#system-text"),
  syncCaption: document.querySelector("#sync-caption-text"),
  summary: document.querySelector("#summary-grid"),
  pipeline: document.querySelector("#pipeline"),
  taskList: document.querySelector("#task-list"),
  tableName: document.querySelector("#table-name"),
  detail: document.querySelector("#detail-panel"),
  toast: document.querySelector("#toast"),
  themeToggle: document.querySelector("#theme-toggle"),
  settings: {
    dialog: document.querySelector("#settings-dialog"),
    form: document.querySelector("#settings-form"),
    open: document.querySelector("#settings-toggle"),
    close: document.querySelector("#settings-close"),
    save: document.querySelector("#settings-save"),
    setup: document.querySelector("#settings-setup"),
    message: document.querySelector("#settings-message"),
    source: document.querySelector("#settings-source"),
    baseLink: document.querySelector("#settings-base-link"),
    feishuSecretStatus: document.querySelector("#feishu-secret-status"),
    openrouterSecretStatus: document.querySelector("#openrouter-secret-status"),
  },
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(
    () => elements.toast.classList.remove("is-visible"),
    2600,
  );
}

async function retryRecord(recordId, button) {
  button.disabled = true;
  try {
    await dashboardApi.retry(recordId);
    showToast(t("toast.retryQueued"));
    await refresh();
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
}

function replaceRecord(record) {
  const index = state.items.findIndex((item) => item.id === record.id);
  if (index >= 0) state.items[index] = record;
}

function dashboardSignature() {
  return JSON.stringify({
    items: state.items,
    summary: state.summary,
    selectedId: state.selectedId,
    tableName: state.tableName,
  });
}

function renderDashboard() {
  const signature = dashboardSignature();
  if (signature === state.renderSignature) return false;
  state.renderSignature = signature;
  view.render(state);
  return true;
}

async function loadDetail(recordId, { quiet = false } = {}) {
  if (!recordId) return;
  try {
    replaceRecord(await dashboardApi.get(recordId));
    renderDashboard();
  } catch (error) {
    if (!quiet) showToast(error.message);
  }
}

const view = createDashboardView({
  elements,
  onNotify: showToast,
  onSelect(recordId) {
    state.selectedId = recordId;
    renderDashboard();
    loadDetail(recordId);
  },
  onRetry: retryRecord,
});

async function refresh({ silent = false } = {}) {
  if (state.refreshing) return;
  state.refreshing = true;
  if (!silent) {
    elements.refresh.disabled = true;
    elements.refresh.setAttribute("aria-busy", "true");
    elements.refresh.textContent = t("overview.refreshing");
  }
  try {
    const data = await dashboardApi.list();
    state.items = data.items;
    state.summary = data.summary;
    state.tableName = data.tableName;
    elements.tableName.textContent = data.tableName;
    if (!state.items.some((item) => item.id === state.selectedId)) {
      state.selectedId = state.items[0]?.id || null;
    }
    if (state.selectedId) {
      replaceRecord(await dashboardApi.get(state.selectedId));
    }
    elements.systemPill.dataset.state = "online";
    elements.systemText.textContent = t("system.online");
    elements.systemPill.setAttribute("aria-label", t("system.online"));
    elements.syncCaption.textContent = t("overview.lastSynced", {
      time: new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date()),
    });
    renderDashboard();
  } catch (error) {
    elements.systemPill.dataset.state = "offline";
    elements.systemText.textContent = t("system.offline");
    elements.systemPill.setAttribute("aria-label", t("system.offline"));
    elements.syncCaption.textContent = t("overview.syncFailed");
    if (!silent) showToast(error.message);
  } finally {
    state.refreshing = false;
    if (!silent) {
      elements.refresh.disabled = false;
      elements.refresh.removeAttribute("aria-busy");
      elements.refresh.textContent = t("overview.refresh");
    }
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.formMessage.textContent = "";
  elements.submit.disabled = true;
  elements.submit.querySelector("span").textContent = t("capture.submitting");
  try {
    const result = await dashboardApi.create(elements.input.value);
    elements.input.value = "";
    state.selectedId = result.recordId || null;
    showToast(t("toast.created"));
    await refresh();
  } catch (error) {
    elements.formMessage.textContent = error.message;
  } finally {
    elements.submit.disabled = false;
    elements.submit.querySelector("span").textContent = t("capture.submit");
  }
});

elements.refresh.addEventListener("click", () => refresh());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh({ silent: true });
});

applyTranslations();
createThemeController({ button: elements.themeToggle, translate: t });
createSettingsController({
  api: dashboardApi,
  elements: elements.settings,
  translate: t,
  showToast,
});
view.renderPipeline(state);
refresh();
window.setInterval(() => refresh({ silent: true }), 3000);
