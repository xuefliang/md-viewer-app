# Translation Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "翻译" (Translate) view mode to MD Viewer that translates markdown documents using an OpenAI-compatible LLM API, with configuration UI in Settings.

**Architecture:** A new `translator.js` module handles chunk-based translation via OpenAI-compatible API. A 4th view mode "翻译" renders translated content. Settings dialog gains a Translation section for API configuration. All config stored in localStorage.

**Tech Stack:** Vanilla JS, fetch API with streaming, OpenAI chat completions API format, localStorage.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/translator.js` | **Create** | Translation engine: config management, chunk splitting, API calls, streaming |
| `src/dom.js` | Modify | Add `translateViewEl`, `translateProgressEl`, `translateErrorEl` exports |
| `src/i18n.js` | Modify | Add zh-CN and en-US translation strings |
| `src/index.html` | Modify | Add translate view mode button, translate view container, settings section |
| `src/styles.css` | Modify | Add `.mode-translate` styles, progress indicator, translate view styles |
| `src/main.js` | Modify | Wire up translate mode, integrate translator, settings UI logic |

---

### Task 1: Create translator.js — Config & API layer

**Files:**
- Create: `src/translator.js`

- [ ] **Step 1: Create `src/translator.js` with config management**

```javascript
const TRANSLATION_CONFIG_KEY = "md-viewer-translation-config";

const DEFAULT_CONFIG = {
  apiKey: "",
  apiEndpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o-mini",
  sourceLang: "auto",
  targetLang: "zh-CN",
};

export function getTranslationConfig() {
  try {
    const stored = localStorage.getItem(TRANSLATION_CONFIG_KEY);
    return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveTranslationConfig(config) {
  localStorage.setItem(TRANSLATION_CONFIG_KEY, JSON.stringify(config));
}

export function isTranslationConfigured() {
  const config = getTranslationConfig();
  return Boolean(config.apiKey && config.apiEndpoint);
}
```

- [ ] **Step 2: Add language options**

```javascript
export const LANGUAGES = [
  { id: "auto", label: "自动检测", label_en: "Auto-detect" },
  { id: "zh-CN", label: "中文", label_en: "Chinese" },
  { id: "en-US", label: "英文", label_en: "English" },
  { id: "ja", label: "日文", label_en: "Japanese" },
  { id: "ko", label: "韩文", label_en: "Korean" },
  { id: "fr", label: "法文", label_en: "French" },
  { id: "de", label: "德文", label_en: "German" },
  { id: "es", label: "西班牙文", label_en: "Spanish" },
  { id: "ru", label: "俄文", label_en: "Russian" },
  { id: "pt", label: "葡萄牙文", label_en: "Portuguese" },
  { id: "ar", label: "阿拉伯文", label_en: "Arabic" },
];

export function getLanguageName(langId, locale = "zh-CN") {
  const lang = LANGUAGES.find((l) => l.id === langId);
  if (!lang) return langId;
  return locale === "en-US" ? lang.label_en : lang.label;
}
```

- [ ] **Step 3: Add chunk splitting logic**

```javascript
function splitMarkdownIntoChunks(markdown, maxChunkSize = 3000) {
  if (!markdown || !markdown.trim()) return [];

  const lines = markdown.split("\n");
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;

  for (const line of lines) {
    const lineSize = line.length + 1;

    if (line.startsWith("## ") || line.startsWith("# ")) {
      if (currentChunk.length > 0 && currentSize > 0) {
        chunks.push(currentChunk.join("\n"));
        currentChunk = [];
        currentSize = 0;
      }
    }

    if (currentSize + lineSize > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n"));
      currentChunk = [];
      currentSize = 0;
    }

    currentChunk.push(line);
    currentSize += lineSize;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n"));
  }

  return chunks.filter((c) => c.trim().length > 0);
}
```

- [ ] **Step 4: Add translation prompt builder**

```javascript
function buildTranslationPrompt(text, sourceLang, targetLang) {
  const sourceDesc = sourceLang === "auto" ? "the source" : getLanguageName(sourceLang);
  const targetDesc = getLanguageName(targetLang);

  return [
    {
      role: "system",
      content: `You are a professional translator. Translate the following markdown text from ${sourceDesc} to ${targetDesc}. Rules:
1. Preserve ALL markdown formatting exactly (headings, bold, italic, code blocks, links, lists, tables).
2. Do NOT translate code inside code blocks.
3. Do NOT translate URLs or file paths.
4. Do NOT add any explanations or commentary — only return the translated text.
5. Keep the same paragraph structure.`,
    },
    {
      role: "user",
      content: text,
    },
  ];
}
```

- [ ] **Step 5: Add API call with streaming**

```javascript
async function callTranslationAPI(messages, config, onChunk) {
  const response = await fetch(config.apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`API error ${response.status}: ${errorText || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          result += content;
          onChunk?.(result);
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  return result;
}
```

- [ ] **Step 6: Add test connection function**

```javascript
export async function testTranslationConnection(config) {
  const testConfig = config || getTranslationConfig();
  if (!testConfig.apiKey) throw new Error("API key is required");

  const messages = [
    { role: "user", content: "Say 'OK' in one word." },
  ];

  const response = await fetch(testConfig.apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: testConfig.model,
      messages,
      max_tokens: 10,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`API error ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  return Boolean(data.choices?.[0]?.message?.content);
}
```

- [ ] **Step 7: Add main translate function**

```javascript
export async function translateMarkdown(markdown, config, onProgress) {
  const cfg = config || getTranslationConfig();
  if (!cfg.apiKey) throw new Error("API key is required");

  const chunks = splitMarkdownIntoChunks(markdown);
  const total = chunks.length;
  const results = [];

  for (let i = 0; i < total; i++) {
    onProgress?.({ chunk: i + 1, total, text: "" });

    const messages = buildTranslationPrompt(chunks[i], cfg.sourceLang, cfg.targetLang);
    const translated = await callTranslationAPI(messages, cfg, (text) => {
      onProgress?.({ chunk: i + 1, total, text });
    });

    results.push(translated);
  }

  return results.join("\n\n");
}
```

- [ ] **Step 8: Commit**

```bash
git add src/translator.js
git commit -m "feat: add translator.js with OpenAI-compatible API integration"
```

---

### Task 2: Add i18n strings

**Files:**
- Modify: `src/i18n.js`

- [ ] **Step 1: Add zh-CN translation strings**

In the `"zh-CN"` messages object, add after `"viewMode.split": "分屏"`:

```javascript
"viewMode.translate": "翻译",
```

Add at the end of the zh-CN block (before the closing `}`):

```javascript
"translate.aria": "翻译模式",
"translate.translating": "翻译中... 块 {chunk}/{total}",
"translate.complete": "翻译完成",
"translate.error": "翻译失败：{message}",
"translate.configureFirst": "请先在设置中配置翻译 API",
"translate.testSuccess": "连接成功",
"translate.testFailed": "连接失败：{message}",
"translate.testing": "测试中...",
"settings.translationTitle": "翻译",
"settings.translationDescription": "配置 LLM API 用于全文翻译。",
"settings.apiKey": "API 密钥",
"settings.apiEndpoint": "API 地址",
"settings.model": "模型名称",
"settings.sourceLang": "源语言",
"settings.targetLang": "目标语言",
"settings.testConnection": "测试连接",
```

- [ ] **Step 2: Add en-US translation strings**

In the `"en-US"` messages object, add after `"viewMode.split": "Split"`:

```javascript
"viewMode.translate": "Translate",
```

Add at the end of the en-US block:

```javascript
"translate.aria": "Translate mode",
"translate.translating": "Translating... chunk {chunk}/{total}",
"translate.complete": "Translation complete",
"translate.error": "Translation failed: {message}",
"translate.configureFirst": "Please configure the translation API in Settings first",
"translate.testSuccess": "Connection successful",
"translate.testFailed": "Connection failed: {message}",
"translate.testing": "Testing...",
"settings.translationTitle": "Translation",
"settings.translationDescription": "Configure LLM API for full-text translation.",
"settings.apiKey": "API Key",
"settings.apiEndpoint": "API Endpoint",
"settings.model": "Model Name",
"settings.sourceLang": "Source Language",
"settings.targetLang": "Target Language",
"settings.testConnection": "Test Connection",
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n.js
git commit -m "feat: add i18n strings for translation feature"
```

---

### Task 3: Add DOM element references

**Files:**
- Modify: `src/dom.js`

- [ ] **Step 1: Add translate view DOM references**

At the end of `src/dom.js`, add:

```javascript
export const translateViewEl = () => document.getElementById("translate-view");
export const translateProgressEl = () => document.getElementById("translate-progress");
export const translateProgressTextEl = () => document.getElementById("translate-progress-text");
export const translateErrorEl = () => document.getElementById("translate-error");
export const translateContentEl = () => document.getElementById("translate-content");
```

- [ ] **Step 2: Commit**

```bash
git add src/dom.js
git commit -m "feat: add translate view DOM references"
```

---

### Task 4: Add HTML structure

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: Add translate view mode button**

In `#view-mode-toggle`, after the split button:

```html
<button type="button" data-view-mode="translate" aria-pressed="false" disabled data-i18n="viewMode.translate">翻译</button>
```

- [ ] **Step 2: Add translate view container**

After the `#document-workspace` div (before `</div>` of `#reader-content`), add:

```html
<div id="translate-view" class="hidden">
  <div id="translate-progress" class="hidden">
    <div class="translate-progress-track">
      <div id="translate-progress-bar" class="translate-progress-bar"></div>
    </div>
    <div id="translate-progress-text"></div>
  </div>
  <div id="translate-error" class="hidden"></div>
  <div id="translate-content" class="markdown-body"></div>
</div>
```

- [ ] **Step 3: Add translation settings section in Settings dialog**

In the `#settings-dialog` section, after the updates section and before the closing `</div>` of `.settings-body`:

```html
<section class="settings-section settings-section-block">
  <div class="settings-section-copy">
    <h3 data-i18n="settings.translationTitle">翻译</h3>
    <p data-i18n="settings.translationDescription">配置 LLM API 用于全文翻译。</p>
  </div>
</section>
<section class="settings-section settings-section-vertical">
  <div class="settings-field">
    <label for="settings-api-key" data-i18n="settings.apiKey">API 密钥</label>
    <div class="settings-input-row">
      <input id="settings-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-..." />
      <button id="settings-api-key-toggle" type="button" class="settings-icon-btn" title="显示/隐藏" aria-label="显示/隐藏密码">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
    </div>
  </div>
  <div class="settings-field">
    <label for="settings-api-endpoint" data-i18n="settings.apiEndpoint">API 地址</label>
    <input id="settings-api-endpoint" type="text" autocomplete="off" spellcheck="false" placeholder="https://api.openai.com/v1/chat/completions" />
  </div>
  <div class="settings-field">
    <label for="settings-model-name" data-i18n="settings.model">模型名称</label>
    <input id="settings-model-name" type="text" autocomplete="off" spellcheck="false" placeholder="gpt-4o-mini" />
  </div>
  <div class="settings-field-row">
    <div class="settings-field">
      <label for="settings-source-lang" data-i18n="settings.sourceLang">源语言</label>
      <select id="settings-source-lang"></select>
    </div>
    <div class="settings-field">
      <label for="settings-target-lang" data-i18n="settings.targetLang">目标语言</label>
      <select id="settings-target-lang"></select>
    </div>
  </div>
  <div class="settings-field">
    <button id="settings-test-connection" type="button" class="settings-secondary-action" data-i18n="settings.testConnection">测试连接</button>
    <span id="settings-test-status" class="settings-status" aria-live="polite"></span>
  </div>
</section>
```

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "feat: add translation view and settings HTML structure"
```

---

### Task 5: Add CSS styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add translate view styles**

Add before the media queries section (around line 1880):

```css
/* Translate view */
#translate-view {
  padding: 32px 40px;
  max-width: 860px;
  margin: 0 auto;
  min-height: 100%;
}

#translate-view.hidden {
  display: none;
}

.translate-progress-track {
  height: 4px;
  overflow: hidden;
  background: #e8e8e2;
  border-radius: 999px;
  margin-bottom: 8px;
}

.translate-progress-bar {
  width: 0%;
  height: 100%;
  background: var(--app-accent);
  transition: width 200ms ease;
  border-radius: 999px;
}

#translate-progress-text {
  color: var(--app-muted);
  font-size: 12px;
  margin-bottom: 16px;
}

#translate-progress {
  margin-bottom: 16px;
}

#translate-error {
  color: #a13d34;
  font-size: 13px;
  padding: 10px 14px;
  background: #fdf2f1;
  border: 1px solid #e8c9c6;
  border-radius: 6px;
  margin-bottom: 16px;
}

#translate-error.hidden {
  display: none;
}

#translate-content {
  line-height: 1.7;
}
```

- [ ] **Step 2: Add settings translation section styles**

Add after the existing `.settings-section` styles:

```css
.settings-section-vertical {
  display: grid;
  gap: 14px;
  padding: 15px 16px;
  border-bottom: 1px solid #e8e8e2;
}

.settings-section-block {
  display: block;
  padding: 15px 16px 8px;
  border-bottom: 0;
}

.settings-field {
  display: grid;
  gap: 5px;
}

.settings-field label {
  color: var(--app-text);
  font-size: 12px;
  font-weight: 600;
}

.settings-field input,
.settings-field select {
  width: 100%;
  min-height: 30px;
  padding: 0 9px;
  color: var(--app-text);
  background: #fbfbf8;
  border: 1px solid #dcdcd4;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}

.settings-field input:focus,
.settings-field select:focus {
  border-color: var(--app-accent);
}

.settings-input-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.settings-input-row input {
  flex: 1;
}

.settings-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  color: var(--app-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}

.settings-icon-btn:hover {
  color: var(--app-accent);
  background: rgba(59, 111, 101, 0.08);
}

.settings-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

#settings-test-status {
  margin-left: 8px;
  font-size: 12px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add translation view and settings CSS styles"
```

---

### Task 6: Wire up main.js — view mode and translation logic

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add import for translator module**

At the top of `main.js`, after the existing imports, add:

```javascript
import {
  getTranslationConfig,
  saveTranslationConfig,
  isTranslationConfigured,
  translateMarkdown,
  testTranslationConnection,
  LANGUAGES,
  getLanguageName,
} from "./translator.js";
```

- [ ] **Step 2: Add translate view DOM imports**

In the import from `./dom.js`, add the new exports:

```javascript
import {
  // ... existing imports ...
  translateViewEl,
  translateProgressEl,
  translateProgressTextEl,
  translateErrorEl,
  translateContentEl,
} from "./dom.js";
```

- [ ] **Step 3: Modify setViewMode to support translate mode**

Change the line in `setViewMode`:

```javascript
const nextMode = ["preview", "edit", "split"].includes(mode) ? mode : "preview";
```

to:

```javascript
const nextMode = ["preview", "edit", "split", "translate"].includes(mode) ? mode : "preview";
```

And in the same function, after:

```javascript
workspaceEl.classList.remove("mode-preview", "mode-edit", "mode-split");
workspaceEl.classList.add(`mode-${viewMode}`);
```

Change to:

```javascript
workspaceEl.classList.remove("mode-preview", "mode-edit", "mode-split", "mode-translate");
workspaceEl.classList.add(`mode-${viewMode}`);
```

And after:

```javascript
readerEl.classList.remove("reader-mode-preview", "reader-mode-edit", "reader-mode-split");
readerEl.classList.add(`reader-mode-${viewMode}`);
```

Change to:

```javascript
readerEl.classList.remove("reader-mode-preview", "reader-mode-edit", "reader-mode-split", "reader-mode-translate");
readerEl.classList.add(`reader-mode-${viewMode}`);
```

- [ ] **Step 4: Add translate mode rendering logic**

Add a new function after `setViewMode`:

```javascript
async function startTranslation() {
  const tab = getActiveTab();
  const translateView = translateViewEl();
  const progressEl = translateProgressEl();
  const progressText = translateProgressTextEl();
  const errorEl = translateErrorEl();
  const contentElTranslate = translateContentEl();

  if (!tab || !translateView) return;

  if (!isTranslationConfigured()) {
    if (errorEl) {
      errorEl.textContent = t("translate.configureFirst");
      errorEl.classList.remove("hidden");
    }
    return;
  }

  errorEl?.classList.add("hidden");
  progressEl?.classList.remove("hidden");

  try {
    const translated = await translateMarkdown(tab.content, null, ({ chunk, total, text }) => {
      if (progressText) {
        progressText.textContent = t("translate.translating", { chunk, total });
      }
    });

    tab.translatedContent = translated;
    if (contentElTranslate) {
      await renderMarkdown(translated, tab.path);
      contentElTranslate.innerHTML = contentEl()?.innerHTML;
    }
    progressEl?.classList.add("hidden");
  } catch (err) {
    progressEl?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = t("translate.error", { message: err.message || String(err) });
      errorEl.classList.remove("hidden");
    }
  }
}
```

- [ ] **Step 5: Hook translate mode into setViewMode**

In `setViewMode`, after the line that handles `previousMode !== viewMode` scroll restore, add a check for translate mode:

```javascript
if (viewMode === "translate" && previousMode !== "translate") {
  startTranslation();
}
```

Also, when switching away from translate mode, hide the translate view:

```javascript
if (previousMode === "translate" && viewMode !== "translate") {
  translateViewEl()?.classList.add("hidden");
}
```

And when entering translate mode, show the translate view and hide editor/content:

```javascript
if (viewMode === "translate") {
  translateViewEl()?.classList.remove("hidden");
  editorShellEl()?.classList.add("hidden");
  contentEl()?.classList.add("hidden");
} else {
  translateViewEl()?.classList.add("hidden");
  editorShellEl()?.classList.remove("hidden");
  contentEl()?.classList.remove("hidden");
}
```

- [ ] **Step 6: Add settings UI initialization**

Add a new function for settings translation UI:

```javascript
function initTranslationSettings() {
  const config = getTranslationConfig();
  const isEnglish = getLocale() === "en-US";

  const apiKeyInput = document.getElementById("settings-api-key");
  const apiEndpointInput = document.getElementById("settings-api-endpoint");
  const modelNameInput = document.getElementById("settings-model-name");
  const sourceLangSelect = document.getElementById("settings-source-lang");
  const targetLangSelect = document.getElementById("settings-target-lang");
  const testBtn = document.getElementById("settings-test-connection");
  const testStatus = document.getElementById("settings-test-status");
  const apiKeyToggle = document.getElementById("settings-api-key-toggle");

  if (apiKeyInput) apiKeyInput.value = config.apiKey;
  if (apiEndpointInput) apiEndpointInput.value = config.apiEndpoint;
  if (modelNameInput) modelNameInput.value = config.model;

  if (sourceLangSelect) {
    sourceLangSelect.innerHTML = "";
    LANGUAGES.forEach((lang) => {
      const option = document.createElement("option");
      option.value = lang.id;
      option.textContent = isEnglish ? lang.label_en : lang.label;
      option.selected = lang.id === config.sourceLang;
      sourceLangSelect.appendChild(option);
    });
  }

  if (targetLangSelect) {
    targetLangSelect.innerHTML = "";
    LANGUAGES.filter((l) => l.id !== "auto").forEach((lang) => {
      const option = document.createElement("option");
      option.value = lang.id;
      option.textContent = isEnglish ? lang.label_en : lang.label;
      option.selected = lang.id === config.targetLang;
      targetLangSelect.appendChild(option);
    });
  }

  const saveConfig = () => {
    saveTranslationConfig({
      apiKey: apiKeyInput?.value || "",
      apiEndpoint: apiEndpointInput?.value || "",
      model: modelNameInput?.value || "",
      sourceLang: sourceLangSelect?.value || "auto",
      targetLang: targetLangSelect?.value || "zh-CN",
    });
  };

  apiKeyInput?.addEventListener("change", saveConfig);
  apiEndpointInput?.addEventListener("change", saveConfig);
  modelNameInput?.addEventListener("change", saveConfig);
  sourceLangSelect?.addEventListener("change", saveConfig);
  targetLangSelect?.addEventListener("change", saveConfig);

  apiKeyToggle?.addEventListener("click", () => {
    if (!apiKeyInput) return;
    apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
  });

  testBtn?.addEventListener("click", async () => {
    if (!testStatus) return;
    testStatus.textContent = t("translate.testing");
    testStatus.style.color = "";
    saveConfig();

    try {
      await testTranslationConnection();
      testStatus.textContent = t("translate.testSuccess");
      testStatus.style.color = "var(--app-accent)";
    } catch (err) {
      testStatus.textContent = t("translate.testFailed", { message: err.message || String(err) });
      testStatus.style.color = "#a13d34";
    }
  });
}
```

- [ ] **Step 7: Call initTranslationSettings on startup**

In the existing settings dialog open handler or DOMContentLoaded, call `initTranslationSettings()` when the settings dialog opens. Find the settings button click handler and add:

```javascript
initTranslationSettings();
```

- [ ] **Step 8: Add CSS rules for translate mode visibility**

In the CSS, add rules for mode-translate:

```css
.mode-translate #editor-shell {
  display: none;
}

.mode-translate #markdown-content {
  display: none;
}

.reader-mode-translate #reader-content {
  overflow: auto;
}
```

- [ ] **Step 9: Commit**

```bash
git add src/main.js src/styles.css
git commit -m "feat: wire up translate view mode and settings UI"
```

---

### Task 7: Test and verify

- [ ] **Step 1: Run dev mode and verify**

```bash
pnpm tauri dev
```

Verify:
- 4th "翻译" button appears in the view mode toggle
- Clicking it shows the translate view
- Settings dialog shows Translation section with all fields
- API key toggle shows/hides password
- Test connection button works
- Translation produces rendered markdown output

- [ ] **Step 2: Commit any final fixes**

```bash
git add -A
git commit -m "feat: complete translation feature"
```

---

## Summary

After completing all tasks:
1. `src/translator.js` — translation engine with config, chunk splitting, API calls, streaming
2. `src/i18n.js` — translation UI strings in zh-CN and en-US
3. `src/dom.js` — translate view DOM references
4. `src/index.html` — translate button, view container, settings section
5. `src/styles.css` — translate view and settings styles
6. `src/main.js` — translate mode logic, settings init, integration
