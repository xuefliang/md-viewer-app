import markdownit from "markdown-it";
import hljs from "highlight.js";
import {
  applyMarkdownTheme,
  getAvailableThemes,
  getThemeCategories,
  getCurrentThemeCSS,
  getCurrentThemeDefinition,
  normalizeThemeId,
} from "./theme-engine.js";
import {
  TYPOGRAPHY_FIELDS,
  clearThemeTypographySettings,
  coerceTypographyValue,
  getThemeTypographySettings,
  getTypographyValuesForScope,
  saveThemeTypographySettings,
} from "./theme-settings.js";
import { open, save } from "@tauri-apps/plugin-dialog";
import { exportDOCX } from "./docx-exporter.js";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWebviewWindow } = window.__TAURI__.webviewWindow;
const { getCurrentWindow } = window.__TAURI__.window;

const md = markdownit({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (_) {}
    }
    return "";
  },
});

const contentEl = () => document.getElementById("markdown-content");
const emptyEl = () => document.getElementById("empty-state");
const tabListEl = () => document.getElementById("tab-list");
const themeSelect = () => document.getElementById("theme-select");
const readerContentEl = () => document.getElementById("reader-content");
const currentThemeId = () => document.body.getAttribute("data-theme") || "default";

let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let workspace = null;
let contextTabId = null;
let contextWorkspacePath = null;
const collapsedWorkspaceDirs = new Set();
const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "UL",
]);

function renderMarkdown(raw) {
  const html = md.render(raw);
  contentEl().innerHTML = html;
  contentEl().style.display = "block";
  emptyEl().style.display = "none";
  renderDocumentOutline();
}

function setTitle(filePath) {
  if (!filePath) {
    document.title = "MD Viewer";
    return;
  }
  const name = filePath.split("/").pop();
  document.title = name + " — MD Viewer";
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFileName(path) {
  return path ? path.split("/").pop() : "";
}

function getDirName(path) {
  if (!path || !path.includes("/")) return "";
  return path.split("/").slice(0, -1).join("/");
}

function getBaseName(path) {
  if (!path) return "";
  return path.split("/").filter(Boolean).pop() || path;
}

function joinPath(base, relative) {
  if (!relative) return base;
  return `${base.replace(/\/+$/, "")}/${relative.replace(/^\/+/, "")}`;
}

function isMarkdownPath(path) {
  return /\.(md|markdown|mdx|mkd)$/i.test(path);
}

function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

function getReaderScrollY() {
  return readerContentEl()?.scrollTop ?? window.scrollY;
}

function setReaderScrollY(value) {
  const reader = readerContentEl();
  if (reader) {
    reader.scrollTop = value;
  } else {
    window.scrollTo(0, value);
  }
}

function renderDocumentOutline() {
  const outline = document.getElementById("document-outline");
  if (!outline) return;

  outline.innerHTML = "";
  if (!activeTabId) {
    const item = document.createElement("li");
    item.className = "outline-empty";
    item.textContent = "Open a markdown file";
    outline.appendChild(item);
    return;
  }

  const headings = Array.from(contentEl().querySelectorAll("h1, h2, h3"));
  if (!headings.length) {
    const item = document.createElement("li");
    item.className = "outline-empty";
    item.textContent = "No headings";
    outline.appendChild(item);
    return;
  }

  headings.forEach((heading, index) => {
    const id = `md-heading-${activeTabId}-${index}`;
    heading.id = id;

    const item = document.createElement("li");
    item.className = `outline-level-${heading.tagName.slice(1).toLowerCase()}`;
    if (index === 0) item.classList.add("active");

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.outlineTarget = id;
    button.textContent = heading.textContent.trim() || `Heading ${index + 1}`;
    item.appendChild(button);
    outline.appendChild(item);
  });
}

function createWorkspaceTree(files) {
  const root = {
    name: "",
    path: "",
    dirs: new Map(),
    files: [],
  };

  files.forEach((file) => {
    const parts = (file.relative_path || file.name).split("/").filter(Boolean);
    if (!parts.length) return;

    let node = root;
    parts.slice(0, -1).forEach((part) => {
      const dirPath = node.path ? `${node.path}/${part}` : part;
      if (!node.dirs.has(part)) {
        node.dirs.set(part, {
          name: part,
          path: dirPath,
          dirs: new Map(),
          files: [],
        });
      }
      node = node.dirs.get(part);
    });

    node.files.push(file);
  });

  return root;
}

function ensureWorkspaceDirExpanded(relativePath) {
  const parts = relativePath.split("/").filter(Boolean).slice(0, -1);
  let current = "";
  parts.forEach((part) => {
    current = current ? `${current}/${part}` : part;
    collapsedWorkspaceDirs.delete(current);
  });
}

function renderWorkspaceTreeNode(node, parentList, depth, activePath) {
  const dirs = Array.from(node.dirs.values()).sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
  const files = [...node.files].sort((a, b) =>
    (a.name || a.relative_path).toLowerCase().localeCompare((b.name || b.relative_path).toLowerCase()),
  );

  dirs.forEach((dir) => {
    const item = document.createElement("li");
    item.className = "tree-item folder-item";
    item.style.setProperty("--tree-depth", depth);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "folder-row";
    button.dataset.workspaceDir = dir.path;
    button.title = dir.path;

    const isCollapsed = collapsedWorkspaceDirs.has(dir.path);
    const twisty = document.createElement("span");
    twisty.className = "tree-twisty";
    twisty.textContent = isCollapsed ? "›" : "⌄";
    button.appendChild(twisty);

    const icon = document.createElement("span");
    icon.className = "folder-icon";
    button.appendChild(icon);

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = dir.name;
    button.appendChild(name);

    item.appendChild(button);
    parentList.appendChild(item);

    if (!isCollapsed) {
      renderWorkspaceTreeNode(dir, parentList, depth + 1, activePath);
    }
  });

  files.forEach((file) => {
    const item = document.createElement("li");
    item.className = "tree-item file-item";
    item.style.setProperty("--tree-depth", depth);
    if (file.path === activePath) item.classList.add("active");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-row";
    button.dataset.workspaceFile = file.path;
    button.title = file.relative_path || file.name;

    const spacer = document.createElement("span");
    spacer.className = "tree-twisty spacer";
    button.appendChild(spacer);

    const icon = document.createElement("span");
    icon.className = "file-icon";
    button.appendChild(icon);

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = file.name || file.relative_path;
    button.appendChild(name);

    item.appendChild(button);
    parentList.appendChild(item);
  });
}

function renderWorkspaceFiles() {
  const workspaceName = document.getElementById("workspace-name");
  const workspaceMeta = document.getElementById("workspace-meta");
  const fileList = document.getElementById("workspace-file-list");
  if (!workspaceName || !workspaceMeta || !fileList) return;

  fileList.innerHTML = "";
  if (!workspace) {
    workspaceName.textContent = "No workspace";
    workspaceMeta.textContent = "Drop a folder to browse Markdown files";
    const item = document.createElement("li");
    item.className = "file-list-empty";
    item.textContent = "Drop a folder or Markdown file";
    fileList.appendChild(item);
    return;
  }

  workspaceName.textContent = workspace.name || getBaseName(workspace.root) || "Workspace";
  workspaceMeta.textContent = `${workspace.files.length} Markdown file${workspace.files.length === 1 ? "" : "s"}`;

  if (!workspace.files.length) {
    const item = document.createElement("li");
    item.className = "file-list-empty";
    item.textContent = "No Markdown files found";
    fileList.appendChild(item);
    return;
  }

  renderWorkspaceTreeNode(createWorkspaceTree(workspace.files), fileList, 0, getActiveTab()?.path);
}

function setWorkspace(payload) {
  collapsedWorkspaceDirs.clear();
  workspace = {
    root: payload.root,
    name: payload.name,
    files: payload.files || [],
  };
  renderWorkspaceFiles();
}

function ensureFileInWorkspace(path) {
  if (!isMarkdownPath(path)) return;

  if (!workspace) {
    const dir = getDirName(path);
    workspace = {
      root: dir,
      name: dir ? getBaseName(dir) : "Open files",
      files: [],
    };
  }

  if (!workspace.files.some((file) => file.path === path)) {
    workspace.files.push({
      path,
      name: getFileName(path),
      relative_path: workspace.root && path.startsWith(`${workspace.root}/`)
        ? path.slice(workspace.root.length + 1)
        : getFileName(path),
    });
    workspace.files.sort((a, b) =>
      a.relative_path.toLowerCase().localeCompare(b.relative_path.toLowerCase()),
    );
  }

  renderWorkspaceFiles();
}

function updateSidePanel() {
  const activeTab = getActiveTab();
  document.body.classList.toggle("has-open-document", Boolean(activeTab));
  renderWorkspaceFiles();

  if (!activeTab) {
    renderDocumentOutline();
  }
}

function getTabByPath(path) {
  return tabs.find((t) => t.path === path);
}

function renderTabBar() {
  const list = tabListEl();
  list.innerHTML = tabs
    .map(
      (tab) =>
        `<div class="tab${tab.id === activeTabId ? " active" : ""}" data-tab-id="${tab.id}">` +
        `<span class="tab-title">${escapeHTML(getFileName(tab.path))}</span>` +
        `<button class="tab-close">×</button>` +
        `</div>`,
    )
    .join("");

  requestAnimationFrame(() => scrollTabIntoView(activeTabId));
}

function scrollTabIntoView(tabId) {
  if (!tabId) return;
  const tab = tabListEl().querySelector(`[data-tab-id="${tabId}"]`);
  tab?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
}

function switchToTab(tabId) {
  const current = tabs.find((t) => t.id === activeTabId);
  if (current) {
    current.scrollY = getReaderScrollY();
  }

  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;

  activeTabId = tabId;
  applyTabTheme(tab);
  renderMarkdown(tab.content);
  setTitle(tab.path);
  renderTabBar();
  updateExportButton();
  updateSidePanel();

  requestAnimationFrame(() => {
    setReaderScrollY(tab.scrollY || 0);
  });
}

function createTab(path, content) {
  ensureFileInWorkspace(path);

  const existing = getTabByPath(path);
  if (existing) {
    existing.content = content;
    switchToTab(existing.id);
    return;
  }

  const id = "tab-" + nextTabId++;
  tabs.push({ id, path, content, scrollY: 0, themeId: currentThemeId() });
  switchToTab(id);
}

function closeTab(tabId) {
  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;

  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    clearAllTabs();
    return;
  }

  if (activeTabId === tabId) {
    const nextIdx = Math.min(idx, tabs.length - 1);
    switchToTab(tabs[nextIdx].id);
  } else {
    renderTabBar();
    updateSidePanel();
  }
}

function clearAllTabs() {
  tabs = [];
  activeTabId = null;
  contentEl().innerHTML = "";
  contentEl().style.display = "none";
  emptyEl().style.display = "";
  setTitle(null);
  renderTabBar();
  updateExportButton();
  updateSidePanel();
}

function closeTabs(tabIds, fallbackIndex = 0, fallbackTabId = null) {
  const ids = new Set(tabIds);
  if (!ids.size) return;

  const current = getActiveTab();
  if (current) {
    current.scrollY = getReaderScrollY();
  }

  const activeWasClosed = ids.has(activeTabId);
  tabs = tabs.filter((tab) => !ids.has(tab.id));

  if (!tabs.length) {
    clearAllTabs();
    return;
  }

  if (!activeWasClosed && tabs.some((tab) => tab.id === activeTabId)) {
    renderTabBar();
    updateExportButton();
    updateSidePanel();
    return;
  }

  const fallbackExists = fallbackTabId && tabs.some((tab) => tab.id === fallbackTabId);
  const nextTab = fallbackExists
    ? tabs.find((tab) => tab.id === fallbackTabId)
    : tabs[Math.min(fallbackIndex, tabs.length - 1)];
  switchToTab(nextTab?.id || tabs[0].id);
}

function hideTabContextMenu() {
  const menu = document.getElementById("tab-context-menu");
  if (!menu) return;
  menu.classList.add("hidden");
  contextTabId = null;
}

function hideWorkspaceContextMenu() {
  const menu = document.getElementById("workspace-context-menu");
  if (!menu) return;
  menu.classList.add("hidden");
  contextWorkspacePath = null;
}

function positionContextMenu(menu, x, y) {
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.remove("hidden");

  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  });
}

function updateTabContextMenuState(tabId) {
  const menu = document.getElementById("tab-context-menu");
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (!menu || index === -1) return;

  menu.querySelector('[data-tab-action="close-left"]').disabled = index === 0;
  menu.querySelector('[data-tab-action="close-right"]').disabled = index === tabs.length - 1;
  menu.querySelector('[data-tab-action="close-all"]').disabled = tabs.length === 0;
}

function showTabContextMenu(tabId, x, y) {
  const menu = document.getElementById("tab-context-menu");
  if (!menu) return;

  contextTabId = tabId;
  updateTabContextMenuState(tabId);
  positionContextMenu(menu, x, y);
}

function runTabContextAction(action) {
  const index = tabs.findIndex((tab) => tab.id === contextTabId);
  if (index === -1) return;

  const tabId = contextTabId;
  if (action === "close-current") {
    closeTabs([tabId], index);
  } else if (action === "close-left") {
    closeTabs(tabs.slice(0, index).map((tab) => tab.id), index, tabId);
  } else if (action === "close-right") {
    closeTabs(tabs.slice(index + 1).map((tab) => tab.id), index, tabId);
  } else if (action === "close-all") {
    clearAllTabs();
  }
}

function showWorkspaceContextMenu(path, x, y) {
  const menu = document.getElementById("workspace-context-menu");
  if (!menu) return;
  contextWorkspacePath = path;
  positionContextMenu(menu, x, y);
}

async function runWorkspaceContextAction(action) {
  if (!contextWorkspacePath) return;
  if (action === "reveal") {
    try {
      await invoke("reveal_in_finder", { path: contextWorkspacePath });
    } catch (e) {
      console.error("Failed to reveal in Finder:", e);
    }
  }
}

function initContextMenus() {
  const tabMenu = document.getElementById("tab-context-menu");
  const workspaceMenu = document.getElementById("workspace-context-menu");
  if (!tabMenu || !workspaceMenu) return;

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    const tabEl = e.target.closest(".tab");
    if (tabEl && tabListEl().contains(tabEl)) {
      hideWorkspaceContextMenu();
      showTabContextMenu(tabEl.dataset.tabId, e.clientX, e.clientY);
      return;
    }

    const fileList = document.getElementById("workspace-file-list");
    const fileEl = e.target.closest("[data-workspace-file]");
    if (fileEl && fileList?.contains(fileEl)) {
      hideTabContextMenu();
      showWorkspaceContextMenu(fileEl.dataset.workspaceFile, e.clientX, e.clientY);
      return;
    }

    const dirEl = e.target.closest("[data-workspace-dir]");
    if (dirEl && fileList?.contains(dirEl) && workspace?.root) {
      hideTabContextMenu();
      showWorkspaceContextMenu(joinPath(workspace.root, dirEl.dataset.workspaceDir), e.clientX, e.clientY);
      return;
    }

    hideTabContextMenu();
    hideWorkspaceContextMenu();
  });

  tabMenu.addEventListener("click", (e) => {
    const item = e.target.closest("[data-tab-action]");
    if (!item || item.disabled) return;
    runTabContextAction(item.dataset.tabAction);
    hideTabContextMenu();
  });

  workspaceMenu.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-workspace-action]");
    if (!item || item.disabled) return;
    await runWorkspaceContextAction(item.dataset.workspaceAction);
    hideWorkspaceContextMenu();
  });

  document.addEventListener("click", (e) => {
    if (!tabMenu.contains(e.target)) hideTabContextMenu();
    if (!workspaceMenu.contains(e.target)) hideWorkspaceContextMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideTabContextMenu();
      hideWorkspaceContextMenu();
    }
  });

  window.addEventListener("blur", () => {
    hideTabContextMenu();
    hideWorkspaceContextMenu();
  });
}

function getActiveFileName() {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return "document";
  return tab.path.split("/").pop().replace(/\.[^.]+$/, "");
}

function getContentCSS() {
  const rules = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        const text = rule.cssText;
        if (
          text.includes("#markdown-content") ||
          text.includes(".hljs") ||
          text.includes(".katex")
        ) {
          rules.push(text);
        }
      }
    } catch (_) {}
  }
  return rules.join("\n");
}

function getTypographyOverrideCSS() {
  return document.getElementById("theme-typography-override")?.textContent || "";
}

function ptToPx(pt) {
  return `${(pt * 4) / 3}px`;
}

function formatTypographyValue(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getDefaultTypographyValues() {
  const { layoutScheme } = getCurrentThemeDefinition();
  const values = {
    body: coerceTypographyValue(layoutScheme.body.fontSize) || 12,
    code: coerceTypographyValue(layoutScheme.code.fontSize) || 10,
  };

  for (const level of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
    values[level] = coerceTypographyValue(layoutScheme.headings[level]?.fontSize) || 12;
  }

  return values;
}

function getTypographyInputValues(settings) {
  const defaults = getDefaultTypographyValues();
  const storedValues = settings?.values || {};
  const values = {};

  for (const field of TYPOGRAPHY_FIELDS) {
    values[field.key] = storedValues[field.key] ?? defaults[field.key];
  }

  return values;
}

function buildTypographyCSS(values) {
  const rules = [];
  const fontSizeRule = (selector, value) => `${selector} {\n  font-size: ${ptToPx(value)};\n}`;

  if (values.body) {
    rules.push(fontSizeRule("#markdown-content", values.body));
    rules.push(fontSizeRule("#markdown-content .katex", values.body));
  }

  for (const level of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
    if (values[level]) rules.push(fontSizeRule(`#markdown-content ${level}`, values[level]));
  }

  if (values.code) {
    rules.push(fontSizeRule("#markdown-content code", values.code));
    rules.push(fontSizeRule("#markdown-content pre code", values.code));
  }

  return rules.join("\n\n");
}

function applyTypographyOverrides(themeId = currentThemeId(), draftSettings = null) {
  const styleId = "theme-typography-override";
  let styleEl = document.getElementById(styleId);
  const values = draftSettings
    ? draftSettings.previewEnabled ? draftSettings.values : {}
    : getTypographyValuesForScope(themeId, "preview");

  if (!Object.keys(values).length) {
    styleEl?.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = buildTypographyCSS(values);
}

function fillTypographyDialog() {
  const theme = getCurrentThemeDefinition();
  const settings = getThemeTypographySettings(theme.id);
  const values = getTypographyInputValues(settings);

  document.getElementById("typography-theme-name").textContent =
    theme.theme.name || theme.theme.name_en || theme.id;
  document.getElementById("typography-preview-enabled").checked =
    settings?.previewEnabled ?? true;
  document.getElementById("typography-export-enabled").checked =
    settings?.exportEnabled ?? true;

  const fieldsEl = document.getElementById("typography-fields");
  fieldsEl.innerHTML = TYPOGRAPHY_FIELDS.map((field) => `
    <div class="typography-field">
      <label for="typography-${field.key}">${field.label}</label>
      <div class="typography-input-wrap">
        <input
          id="typography-${field.key}"
          type="number"
          min="6"
          max="72"
          step="0.5"
          data-typography-key="${field.key}"
          value="${formatTypographyValue(values[field.key])}"
        />
        <span class="typography-unit">pt</span>
      </div>
    </div>
  `).join("");
}

function readTypographyDialog() {
  const values = {};

  document.querySelectorAll("[data-typography-key]").forEach((input) => {
    const value = coerceTypographyValue(input.value);
    if (value !== null) values[input.dataset.typographyKey] = value;
  });

  return {
    previewEnabled: document.getElementById("typography-preview-enabled").checked,
    exportEnabled: document.getElementById("typography-export-enabled").checked,
    values,
  };
}

function openTypographyDialog() {
  fillTypographyDialog();
  document.getElementById("settings-backdrop").classList.remove("hidden");
  document.querySelector("[data-typography-key]")?.focus();
}

function closeTypographyDialog(revertPreview = true) {
  document.getElementById("settings-backdrop").classList.add("hidden");
  if (revertPreview) applyTypographyOverrides();
}

function saveTypographyDialog() {
  const themeId = currentThemeId();
  saveThemeTypographySettings(themeId, readTypographyDialog());
  closeTypographyDialog(false);
  applyTypographyOverrides(themeId);
}

function resetTypographyDialog() {
  const themeId = currentThemeId();
  clearThemeTypographySettings(themeId);
  closeTypographyDialog(false);
  applyTypographyOverrides(themeId);
}

function initTypographySettings() {
  const backdrop = document.getElementById("settings-backdrop");
  const dialog = document.getElementById("typography-dialog");
  const applyDraft = () => applyTypographyOverrides(currentThemeId(), readTypographyDialog());

  document.getElementById("typography-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openTypographyDialog();
  });
  document.getElementById("typography-close").addEventListener("click", () => closeTypographyDialog());
  document.getElementById("typography-cancel").addEventListener("click", () => closeTypographyDialog());
  document.getElementById("typography-save").addEventListener("click", saveTypographyDialog);
  document.getElementById("typography-reset").addEventListener("click", resetTypographyDialog);

  backdrop.addEventListener("click", (e) => {
    if (!dialog.contains(e.target)) closeTypographyDialog();
  });
  backdrop.addEventListener("input", (e) => {
    if (e.target.matches("[data-typography-key]")) applyDraft();
  });
  backdrop.addEventListener("change", (e) => {
    if (e.target.matches("#typography-preview-enabled, #typography-export-enabled")) {
      applyDraft();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.classList.contains("hidden")) {
      closeTypographyDialog();
    }
  });
}

function textToBytes(text) {
  return Array.from(new TextEncoder().encode(text));
}

function arrayBufferToBytes(buffer) {
  return Array.from(new Uint8Array(buffer));
}

async function writeExportFile(path, contents) {
  await invoke("write_export_file", { path, contents });
}

async function handleExportHTML() {
  const baseName = getActiveFileName();
  const filePath = await save({
    defaultPath: baseName + ".html",
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!filePath) return;

  const themeCSS = getCurrentThemeCSS();
  const contentCSS = getContentCSS();
  const typographyCSS = getTypographyOverrideCSS();
  const bodyHTML = contentEl().innerHTML;
  const dataTheme = document.body.getAttribute("data-theme") || "default";

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${baseName}</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
#markdown-content {
  max-width: 1060px;
  margin: 0 auto;
  padding: 40px;
}
${contentCSS}
${themeCSS}
${typographyCSS}
</style>
</head>
<body data-theme="${dataTheme}">
<article id="markdown-content" class="markdown-body">${bodyHTML}</article>
</body>
</html>`;

  await writeExportFile(filePath, textToBytes(html));
}

async function handleExportDOCX() {
  const baseName = getActiveFileName();
  const filePath = await save({
    defaultPath: baseName + ".docx",
    filters: [{ name: "Word Document", extensions: ["docx"] }],
  });
  if (!filePath) return;

  const blob = await exportDOCX(contentEl());
  const buffer = await blob.arrayBuffer();
  await writeExportFile(filePath, arrayBufferToBytes(buffer));
}

async function handlePrintPDF() {
  const markdown = contentEl();
  const pageBackground =
    getComputedStyle(markdown).backgroundColor ||
    getComputedStyle(document.body).backgroundColor ||
    "#ffffff";
  const printStyle = document.createElement("style");
  printStyle.id = "md-viewer-print-style";
  printStyle.textContent = `
@page {
  margin: 12mm;
  background-color: ${pageBackground};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

@media print {
  html,
  body {
    background-color: ${pageBackground} !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  #markdown-content img {
    max-width: 100%;
    max-height: 9.5in;
    height: auto;
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`;

  document.getElementById(printStyle.id)?.remove();
  document.head.appendChild(printStyle);

  const cleanup = () => {
    printStyle.remove();
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  await Promise.resolve(window.print());
  setTimeout(cleanup, 2000);
}

function initExportMenu() {
  const btn = document.getElementById("export-btn");
  const menu = document.getElementById("export-menu");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    menu.classList.toggle("hidden");
  });

  menu.addEventListener("click", async (e) => {
    const target = e.target.closest("[data-format]");
    if (!target) return;
    menu.classList.add("hidden");

    const format = target.dataset.format;
    try {
      if (format === "html") await handleExportHTML();
      else if (format === "docx") await handleExportDOCX();
      else if (format === "print") await handlePrintPDF();
    } catch (err) {
      console.error("Export failed:", err);
    }
  });

  document.addEventListener("click", () => {
    menu.classList.add("hidden");
  });
}

function updateExportButton() {
  document.getElementById("export-btn").disabled = !activeTabId;
}

function buildThemeSelectOptions(select, selectedTheme) {
  const themes = getAvailableThemes();
  const categories = getThemeCategories();
  const groupedThemes = themes.reduce((groups, theme) => {
    const key = theme.category || "other";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(theme);
    return groups;
  }, new Map());

  select.innerHTML = "";
  groupedThemes.forEach((groupThemes, categoryId) => {
    const group = document.createElement("optgroup");
    group.label = categories[categoryId]?.name || categoryId;

    groupThemes.forEach((theme) => {
      const option = document.createElement("option");
      option.value = theme.id;
      option.textContent = theme.name || theme.name_en || theme.id;
      option.selected = theme.id === selectedTheme;
      group.appendChild(option);
    });

    select.appendChild(group);
  });
}

function applyTheme(theme, { persist = true } = {}) {
  const appliedTheme = applyMarkdownTheme(theme);
  if (persist) {
    localStorage.setItem("md-viewer-theme", appliedTheme);
  }
  applyTypographyOverrides(appliedTheme);
  return appliedTheme;
}

function syncThemeSelect(themeId) {
  const select = themeSelect();
  if (select) select.value = themeId;
}

function applyTabTheme(tab) {
  const appliedTheme = applyTheme(tab.themeId || currentThemeId(), { persist: false });
  tab.themeId = appliedTheme;
  syncThemeSelect(appliedTheme);
  return appliedTheme;
}

function initTheme() {
  const select = themeSelect();
  const saved = normalizeThemeId(localStorage.getItem("md-viewer-theme") || "default");
  const appliedTheme = applyTheme(saved);
  buildThemeSelectOptions(select, appliedTheme);
  select.value = appliedTheme;
  updateSidePanel();
  select.addEventListener("change", (e) => {
    const nextTheme = applyTheme(e.target.value);
    const activeTab = getActiveTab();
    if (activeTab) {
      activeTab.themeId = nextTheme;
    }
    select.value = nextTheme;
    updateSidePanel();
    if (!document.getElementById("settings-backdrop").classList.contains("hidden")) {
      fillTypographyDialog();
    }
  });
}

function initOutlineNavigation() {
  const outline = document.getElementById("document-outline");
  if (!outline) return;

  outline.addEventListener("click", (e) => {
    const targetButton = e.target.closest("[data-outline-target]");
    if (!targetButton) return;

    outline.querySelectorAll(".active").forEach((item) => item.classList.remove("active"));
    targetButton.closest("li")?.classList.add("active");

    document.getElementById(targetButton.dataset.outlineTarget)?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  });
}

async function openWorkspaceFile(path) {
  try {
    const file = workspace?.files.find((item) => item.path === path);
    if (file) {
      ensureWorkspaceDirExpanded(file.relative_path || file.name);
    }
    const result = await invoke("open_file", { path });
    createTab(result.path, result.content);
  } catch (e) {
    console.error("Failed to open file:", e);
  }
}

async function loadWorkspace(path) {
  try {
    const result = await invoke("list_markdown_files", { path });
    setWorkspace(result);
  } catch (e) {
    console.error("Failed to load workspace:", e);
  }
}

async function handleDroppedPath(path) {
  if (isMarkdownPath(path)) {
    await openWorkspaceFile(path);
    return;
  }

  await loadWorkspace(path);
}

async function chooseWorkspace() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择 Markdown 目录",
    });
    if (typeof selected === "string") {
      await loadWorkspace(selected);
    }
  } catch (e) {
    console.error("Failed to choose workspace:", e);
  }
}

async function refreshWorkspace() {
  if (!workspace?.root) return;
  await loadWorkspace(workspace.root);
}

function initWorkspaceNavigation() {
  const fileList = document.getElementById("workspace-file-list");
  const openButton = document.getElementById("open-workspace-btn");
  const refreshButton = document.getElementById("refresh-workspace-btn");

  openButton?.addEventListener("click", chooseWorkspace);
  refreshButton?.addEventListener("click", refreshWorkspace);

  if (!fileList) return;

  fileList.addEventListener("click", async (e) => {
    const dirButton = e.target.closest("[data-workspace-dir]");
    if (dirButton) {
      const dir = dirButton.dataset.workspaceDir;
      if (collapsedWorkspaceDirs.has(dir)) {
        collapsedWorkspaceDirs.delete(dir);
      } else {
        collapsedWorkspaceDirs.add(dir);
      }
      renderWorkspaceFiles();
      return;
    }

    const targetButton = e.target.closest("[data-workspace-file]");
    if (!targetButton) return;
    await openWorkspaceFile(targetButton.dataset.workspaceFile);
  });
}

function initTabScrolling() {
  const list = tabListEl();
  list.addEventListener("wheel", (e) => {
    if (list.scrollWidth <= list.clientWidth) return;

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;

    e.preventDefault();
    list.scrollLeft += delta;
  }, { passive: false });
}

function isBlockNode(node) {
  return node?.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName);
}

function removeCopyWhitespaceNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest("pre, code")) {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.nodeValue.trim() !== "") {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      const isBetweenBlocks = (!node.previousSibling || isBlockNode(node.previousSibling)) &&
        (!node.nextSibling || isBlockNode(node.nextSibling));

      return (parent === root || isBlockNode(parent)) && isBetweenBlocks
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  nodes.forEach((textNode) => textNode.remove());
}

function removeEmptyCopyBlocks(root) {
  root.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote").forEach((el) => {
    if (el.closest("pre, code")) return;
    if (el.querySelector("img, table, hr, input, br")) return;

    const text = el.textContent.replace(/\u00a0/g, " ").trim();
    if (!text) {
      el.remove();
    }
  });
}

function resetCopiedBlockSpacing(root) {
  root.querySelectorAll("p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, pre").forEach((el) => {
    el.style.marginTop = "0";
    el.style.marginBottom = "0";
    el.style.paddingTop = "0";
    el.style.paddingBottom = "0";
  });
}

function normalizeCopiedPlainText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .filter((line) => line.trim() !== "")
    .join("\n")
    .trim();
}

function prepareCopyFragment(wrapper) {
  removeCopyWhitespaceNodes(wrapper);
  removeEmptyCopyBlocks(wrapper);
}

function compactCopyFragmentSpacing(wrapper) {
  resetCopiedBlockSpacing(wrapper);
  wrapper.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    el.style.marginTop = "6pt";
  });
}

function markFirstCopyBlock(wrapper) {
  const firstBlock = Array.from(wrapper.children).find((el) => {
    if (!isBlockNode(el)) return false;
    if (el.querySelector("img, table, hr, input")) return true;
    return el.textContent.replace(/\u00a0/g, " ").trim() !== "";
  });

  if (firstBlock) {
    firstBlock.classList.add("first-copy-block");
  }
}

function prepareAcademicCopyFragment(wrapper) {
  wrapper.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));

  wrapper.querySelectorAll("p").forEach((el) => {
    el.className = "MsoBodyText";
  });

  wrapper.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    el.className = `MsoHeading${el.tagName.slice(1)}`;
  });

  wrapper.querySelectorAll("ul, ol").forEach((el) => {
    el.className = "MsoList";
  });

  wrapper.querySelectorAll("li").forEach((el) => {
    el.className = "MsoListItem";
  });

  wrapper.querySelectorAll("li > p").forEach((el) => {
    el.className = "MsoListText";
  });

  wrapper.querySelectorAll("blockquote").forEach((el) => {
    el.className = "MsoQuote";
  });

  wrapper.querySelectorAll("pre").forEach((el) => {
    el.className = "MsoPre";
  });

  markFirstCopyBlock(wrapper);
}

function createWordHtml(bodyHtml) {
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<style>
html, body {
  margin: 0cm;
  padding: 0cm;
}
body {
  color: #000000;
  font-family: "Times New Roman", SimSun, serif;
  font-size: 12.0pt;
}
p.MsoBodyText {
  margin: 0cm;
  text-indent: 24.0pt;
  mso-char-indent-count: 2.0;
  line-height: 150%;
  font-family: "Times New Roman", SimSun, serif;
  font-size: 12.0pt;
}
h1, h2, h3, h4, h5, h6 {
  text-indent: 0cm;
  line-height: 150%;
  font-family: Arial, SimHei, sans-serif;
  font-weight: bold;
  page-break-after: avoid;
}
h1.MsoHeading1 {
  margin: 12.0pt 0cm 6.0pt 0cm;
  font-size: 22.0pt;
}
h2.MsoHeading2 {
  margin: 10.0pt 0cm 3.0pt 0cm;
  font-size: 16.0pt;
}
h3.MsoHeading3 {
  margin: 8.0pt 0cm 3.0pt 0cm;
  font-size: 14.0pt;
}
h4.MsoHeading4,
h5.MsoHeading5,
h6.MsoHeading6 {
  margin: 6.0pt 0cm 2.0pt 0cm;
  font-size: 12.0pt;
}
.first-copy-block {
  margin-top: 0cm !important;
}
ul.MsoList,
ol.MsoList {
  margin: 0cm 0cm 0cm 24.0pt;
  padding-left: 18.0pt;
}
li.MsoListItem {
  margin: 0cm;
  text-indent: 0cm;
  line-height: 150%;
  font-family: "Times New Roman", SimSun, serif;
  font-size: 12.0pt;
}
li.MsoListItem p.MsoListText {
  margin: 0cm;
  text-indent: 0cm;
  line-height: 150%;
}
blockquote.MsoQuote {
  margin: 0cm 0cm 0cm 24.0pt;
  padding: 0cm;
  line-height: 150%;
  font-family: "Times New Roman", SimSun, serif;
  font-size: 12.0pt;
}
blockquote.MsoQuote p {
  text-indent: 0cm;
}
table {
  border-collapse: collapse;
}
td, th {
  padding: 4.0pt 8.0pt;
  font-family: "Times New Roman", SimSun, serif;
  font-size: 12.0pt;
}
code, pre.MsoPre {
  font-family: Monaco, "Courier New", monospace;
  font-size: 10.0pt;
}
pre.MsoPre {
  margin: 0cm;
  padding: 0cm;
  line-height: 120%;
}
</style>
</head>
<body>
<!--StartFragment--><div class="WordSection1">${bodyHtml}</div><!--EndFragment-->
</body>
</html>`;
}

function initCopyHandler() {
  document.addEventListener("copy", (e) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const theme = document.body.getAttribute("data-theme");
    const range = sel.getRangeAt(0);
    const content = contentEl();
    if (!content.contains(range.commonAncestorContainer)) return;

    const fragment = range.cloneContents();
    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);
    prepareCopyFragment(wrapper);

    if (theme === "academic") {
      prepareAcademicCopyFragment(wrapper);
      e.clipboardData.setData("text/html", createWordHtml(wrapper.innerHTML));
    } else {
      compactCopyFragmentSpacing(wrapper);
      e.clipboardData.setData("text/html", wrapper.innerHTML);
    }

    e.clipboardData.setData("text/plain", normalizeCopiedPlainText(sel.toString()));
    e.preventDefault();
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initTypographySettings();
  initCopyHandler();
  initExportMenu();
  initOutlineNavigation();
  initWorkspaceNavigation();
  initContextMenus();
  initTabScrolling();

  const tabBar = document.getElementById("tab-bar");

  tabBar.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;

    const closeBtn = e.target.closest(".tab-close");
    if (closeBtn) {
      e.stopPropagation();
      closeTab(closeBtn.closest(".tab").dataset.tabId);
      return;
    }

    const tabEl = e.target.closest(".tab");
    if (tabEl) {
      switchToTab(tabEl.dataset.tabId);
      return;
    }

    if (e.target.closest("#theme-select, #typography-btn, #export-wrapper")) return;

    getCurrentWindow().startDragging();
  });

  tabBar.addEventListener("auxclick", (e) => {
    if (e.button !== 1) return;
    const tabEl = e.target.closest(".tab");
    if (tabEl) closeTab(tabEl.dataset.tabId);
  });

  listen("load-file", (event) => {
    const { path, content } = event.payload;
    createTab(path, content);
  });

  listen("file-changed", (event) => {
    const { path, content } = event.payload;
    const tab = getTabByPath(path);
    if (!tab) return;
    tab.content = content;
    if (tab.id === activeTabId) {
      renderMarkdown(content);
      updateSidePanel();
    }
  });

  const webview = getCurrentWebviewWindow();
  webview.onDragDropEvent(async (event) => {
    if (event.payload.type === "drop" && event.payload.paths.length > 0) {
      for (const path of event.payload.paths) {
        await handleDroppedPath(path);
      }
    }
  });

  try {
    const initial = await invoke("get_initial_file");
    if (initial) {
      createTab(initial.path, initial.content);
    }
  } catch (_) {}
});
