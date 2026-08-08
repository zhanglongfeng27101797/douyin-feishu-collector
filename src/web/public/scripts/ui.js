import zhCN from "../locales/zh-CN.js";

const DEFAULT_LOCALE = "zh-CN";
const THEME_STORAGE_KEY = "douyin-collector-theme";
const catalogs = new Map([[DEFAULT_LOCALE, zhCN]]);
let activeLocale = DEFAULT_LOCALE;

export function t(key, parameters = {}) {
  const template = catalogs.get(activeLocale)?.[key] || catalogs.get(DEFAULT_LOCALE)?.[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(parameters[name] ?? ""));
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  document.title = t("app.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("app.description"));
}

export function registerLocale(locale, catalog) {
  catalogs.set(locale, Object.freeze({ ...catalog }));
}

export function getLocale() {
  return activeLocale;
}

export function setLocale(locale) {
  if (!catalogs.has(locale)) throw new Error(`Unsupported locale: ${locale}`);
  activeLocale = locale;
  document.documentElement.lang = locale;
  applyTranslations();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function formatDate(value, fallback = t("time.justNow")) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(getLocale(), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatNumber(value) {
  const number = Number(value || 0);
  if (number >= 10_000) {
    return new Intl.NumberFormat(getLocale(), {
      notation: "compact",
      maximumFractionDigits: number >= 100_000 ? 0 : 1,
    }).format(number);
  }
  return new Intl.NumberFormat(getLocale()).format(number);
}

function preferredTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (["light", "dark"].includes(stored)) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function createThemeController({ button, translate }) {
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    button.dataset.theme = theme;
    button.setAttribute(
      "aria-label",
      translate(theme === "dark" ? "theme.light" : "theme.dark"),
    );
  }

  apply(preferredTheme());
  button.addEventListener("click", () => {
    apply(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  return { apply };
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setSecretStatus(element, configured, translate) {
  element.dataset.configured = String(configured);
  element.textContent = translate(
    configured ? "settings.secretConfigured" : "settings.secretMissing",
  );
}

function populateSettings(form, data, elements, translate) {
  for (const [name, value] of Object.entries(data.values || {})) {
    if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value;
  }
  form.elements.feishuAppSecret.value = "";
  form.elements.openrouterApiKey.value = "";
  setSecretStatus(elements.feishuSecretStatus, data.secrets?.feishuAppSecret, translate);
  setSecretStatus(elements.openrouterSecretStatus, data.secrets?.openrouterApiKey, translate);
  elements.source.textContent = translate("settings.source", { source: data.source });
}

export function createSettingsController({ api, elements, translate, showToast }) {
  let loading = false;

  async function load() {
    const data = await api.getSettings();
    populateSettings(elements.form, data, elements, translate);
  }

  async function run(action) {
    if (loading || !elements.form.reportValidity()) return;
    loading = true;
    elements.message.textContent = "";
    const button = action === "setup" ? elements.setup : elements.save;
    const labelKey = action === "setup" ? "settings.settingUp" : "settings.saving";
    const doneKey = action === "setup" ? "toast.setupComplete" : "toast.settingsSaved";
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = translate(labelKey);
    try {
      const values = formValues(elements.form);
      const result = action === "setup"
        ? await api.setupFeishu(values)
        : await api.saveSettings(values);
      populateSettings(elements.form, result.settings || result, elements, translate);
      if (action === "setup" && result.baseUrl?.startsWith("https://")) {
        elements.baseLink.href = result.baseUrl;
        elements.baseLink.hidden = false;
      }
      showToast(translate(doneKey));
    } catch (error) {
      elements.message.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = originalText;
      loading = false;
    }
  }

  elements.open.addEventListener("click", async () => {
    elements.dialog.showModal();
    try {
      await load();
    } catch (error) {
      elements.message.textContent = error.message;
    }
  });
  elements.close.addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) elements.dialog.close();
  });
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    run("save");
  });
  elements.setup.addEventListener("click", () => run("setup"));

  return { load };
}
