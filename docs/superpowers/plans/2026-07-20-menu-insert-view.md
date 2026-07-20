# Menu, Insert, and View Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** Add TizuMark-style menu bar, format/insert toolbar, and view menu to md-viewer-app

**Architecture:** Add dropdown menus (File, View, Help) to the existing toolbar and a format toolbar below it for inserting Markdown elements. Wire these to existing editor-behavior functions and add new insert actions for headings, HR, strikethrough, table, code block, etc.

**Tech Stack:** JavaScript (vanilla), CSS, Tauri v2

## Global Constraints

- Follow existing code style (no comments, ES modules, same formatting)
- Use existing i18n pattern for all new strings (both zh-CN and en-US)
- Use existing `editor-behavior.js` functions where possible
- All new DOM elements added to `src/index.html`
- All new styles added to `src/styles.css`
- All logic wired in `src/main.js`
- No new dependencies

---

### Task 1: Add i18n strings for menu items and insert actions

**Files:**
- Modify: `src/i18n.js`

**Interfaces:**
- Consumes: Existing i18n pattern (`data-i18n` attributes)
- Produces: Translation keys for all new menu/insert/view elements

- [ ] **Step 1: Add Chinese translations**

Add to the `zh-CN` block in `src/i18n.js`:
```js
"menu.file": "文件",
"menu.view": "视图",
"menu.help": "帮助",
"menu.newFile": "新建",
"menu.openFile": "打开",
"menu.openFolder": "打开文件夹",
"menu.save": "保存",
"menu.saveAs": "另存为",
"menu.settings": "设置",
"menu.shortcuts": "快捷键",
"menu.sidebar": "侧边栏",
"menu.about": "关于",
"menu.checkUpdate": "检查更新",
"menu.export": "导出",
"menu.exportHTML": "导出 HTML",
"menu.exportDOCX": "导出 DOCX",
"menu.exportPrint": "打印 / PDF",
"insert.bold": "加粗",
"insert.italic": "斜体",
"insert.strikethrough": "删除线",
"insert.inlineCode": "行内代码",
"insert.link": "链接",
"insert.image": "图片",
"insert.hr": "水平线",
"insert.heading": "标题",
"insert.list": "列表",
"insert.unorderedList": "无序列表",
"insert.orderedList": "有序列表",
"insert.taskList": "任务列表",
"insert.codeBlock": "代码块",
"insert.table": "表格",
"insert.quote": "引用块",
"insert.mathBlock": "数学公式",
"insert.mermaid": "Mermaid 图表",
"insert.toc": "目录",
```

- [ ] **Step 2: Add English translations**

Add matching entries to the `en-US` block in `src/i18n.js`.

---

### Task 2: Add HTML structure for menu bar and format toolbar

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: Add menu dropdown to the toolbar area**

After `#toolbar-actions`, before the closing `</div>` of `#tab-bar`, add a menu bar section:

```html
<div id="menu-bar">
  <div class="dropdown" id="file-menu-dropdown">
    <button id="file-menu-btn" type="button" class="menu-btn" data-i18n="menu.file">文件 ▾</button>
    <div id="file-menu" class="dropdown-menu hidden" role="menu">
      <button type="button" data-menu-action="new" data-i18n="menu.newFile">新建</button>
      <button type="button" data-menu-action="open" data-i18n="menu.openFile">打开</button>
      <button type="button" data-menu-action="open-folder" data-i18n="menu.openFolder">打开文件夹</button>
      <div class="menu-separator"></div>
      <button type="button" data-menu-action="save" data-i18n="menu.save">保存</button>
      <button type="button" data-menu-action="save-as" data-i18n="menu.saveAs">另存为</button>
      <div class="menu-separator"></div>
      <button type="button" data-menu-action="export-html" data-i18n="menu.exportHTML">导出 HTML</button>
      <button type="button" data-menu-action="export-docx" data-i18n="menu.exportDOCX">导出 DOCX</button>
      <button type="button" data-menu-action="export-print" data-i18n="menu.exportPrint">打印 / PDF</button>
      <div class="menu-separator"></div>
      <button type="button" data-menu-action="settings" data-i18n="menu.settings">设置</button>
    </div>
  </div>
  <div class="dropdown" id="view-menu-dropdown">
    <button id="view-menu-btn" type="button" class="menu-btn" data-i18n="menu.view">视图 ▾</button>
    <div id="view-menu" class="dropdown-menu hidden" role="menu">
      <button type="button" data-menu-action="toggle-sidebar" data-i18n="menu.sidebar">侧边栏</button>
    </div>
  </div>
  <div class="dropdown" id="help-menu-dropdown">
    <button id="help-menu-btn" type="button" class="menu-btn" data-i18n="menu.help">帮助 ▾</button>
    <div id="help-menu" class="dropdown-menu hidden" role="menu">
      <button type="button" data-menu-action="check-update" data-i18n="menu.checkUpdate">检查更新</button>
      <button type="button" data-menu-action="about" data-i18n="menu.about">关于</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add format toolbar**

After `#tab-bar`, inside `#reader-pane` (before `#reader-content`), add:
```html
<div id="fmt-toolbar" class="hidden">
  <button class="fmt-btn" data-fmt-action="bold" title="加粗" data-i18n-title="insert.bold"><b>B</b></button>
  <button class="fmt-btn" data-fmt-action="italic" title="斜体" data-i18n-title="insert.italic"><i>I</i></button>
  <button class="fmt-btn" data-fmt-action="strikethrough" title="删除线" data-i18n-title="insert.strikethrough"><s>S</s></button>
  <button class="fmt-btn" data-fmt-action="inline-code" title="行内代码" data-i18n-title="insert.inlineCode"><code>&lt;/&gt;</code></button>
  <button class="fmt-btn" data-fmt-action="link" title="链接" data-i18n-title="insert.link">🔗</button>
  <button class="fmt-btn" data-fmt-action="image" title="图片" data-i18n-title="insert.image">🖼</button>
  <button class="fmt-btn" data-fmt-action="hr" title="水平线" data-i18n-title="insert.hr">—</button>
  <span class="fmt-sep"></span>
  <div class="fmt-dropdown">
    <button class="fmt-btn" data-i18n="insert.heading">标题 ▾</button>
    <div class="fmt-dropdown-menu hidden">
      <button data-fmt-action="h1">H1</button>
      <button data-fmt-action="h2">H2</button>
      <button data-fmt-action="h3">H3</button>
      <button data-fmt-action="h4">H4</button>
      <button data-fmt-action="h5">H5</button>
      <button data-fmt-action="h6">H6</button>
    </div>
  </div>
  <div class="fmt-dropdown">
    <button class="fmt-btn" data-i18n="insert.list">列表 ▾</button>
    <div class="fmt-dropdown-menu hidden">
      <button data-fmt-action="ul" data-i18n="insert.unorderedList">无序列表</button>
      <button data-fmt-action="ol" data-i18n="insert.orderedList">有序列表</button>
      <button data-fmt-action="task" data-i18n="insert.taskList">任务列表</button>
    </div>
  </div>
  <div class="fmt-dropdown">
    <button class="fmt-btn" data-i18n="insert.codeBlock">插入 ▾</button>
    <div class="fmt-dropdown-menu hidden">
      <button data-fmt-action="code-block" data-i18n="insert.codeBlock">代码块</button>
      <button data-fmt-action="table" data-i18n="insert.table">表格</button>
      <button data-fmt-action="quote" data-i18n="insert.quote">引用块</button>
      <button data-fmt-action="math-block" data-i18n="insert.mathBlock">数学公式</button>
      <button data-fmt-action="mermaid" data-i18n="insert.mermaid">Mermaid</button>
      <button data-fmt-action="toc" data-i18n="insert.toc">目录</button>
    </div>
  </div>
</div>
```

---

### Task 3: Add CSS styles for menu bar and format toolbar

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add menu bar, dropdown, and format toolbar styles**

Append to `src/styles.css`:
```css
/* Menu bar */
#menu-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 4px;
}

.menu-btn {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  color: #414641;
  background: transparent;
  border: 0;
  border-radius: 5px;
  font-size: 12px;
  line-height: 1;
  cursor: default;
}
.menu-btn:hover, .menu-btn.open { background: #e8e8e2; }

.dropdown { position: relative; }
.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  min-width: 180px;
  padding: 5px;
  background: #fff;
  border: 1px solid #dedfd8;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(52, 50, 44, 0.15);
}
.dropdown-menu.hidden { display: none; }
.dropdown-menu button {
  display: block;
  width: 100%;
  min-height: 28px;
  padding: 0 10px;
  color: #303431;
  background: transparent;
  border: 0;
  border-radius: 5px;
  font-size: 12px;
  text-align: left;
  cursor: default;
}
.dropdown-menu button:hover { background: #f1f2ee; }
.menu-separator { height: 1px; margin: 5px 3px; background: #e5e5df; }

/* Format toolbar */
#fmt-toolbar {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 32px;
  padding: 0 12px;
  background: var(--app-panel);
  border-bottom: 1px solid var(--app-line);
  flex-shrink: 0;
  overflow-x: auto;
}
#fmt-toolbar.hidden { display: none; }

.fmt-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 6px;
  color: #5f6661;
  background: transparent;
  border: 0;
  border-radius: 5px;
  font-size: 12px;
  cursor: default;
  white-space: nowrap;
}
.fmt-btn:hover { color: #173f38; background: rgba(255,255,255,0.7); }
.fmt-sep { width: 1px; height: 16px; background: var(--app-line-strong); margin: 0 2px; flex-shrink: 0; }

.fmt-dropdown { position: relative; }
.fmt-dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  min-width: 140px;
  padding: 4px;
  background: #fff;
  border: 1px solid #dedfd8;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(52, 50, 44, 0.15);
}
.fmt-dropdown-menu.hidden { display: none; }
.fmt-dropdown-menu button {
  display: block;
  width: 100%;
  min-height: 26px;
  padding: 0 8px;
  color: #303431;
  background: transparent;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  text-align: left;
  cursor: default;
}
.fmt-dropdown-menu button:hover { background: #f1f2ee; }
```

---

### Task 4: Extend editor-behavior.js with toolbar action dispatcher

**Files:**
- Modify: `src/editor-behavior.js`

**Interfaces:**
- Consumes: Existing `createEditorActions` factory
- Produces: `handleEditorAction(name, context)` function

- [ ] **Step 1: Add `handleEditorAction` function that dispatches by name**

Add at the end of `src/editor-behavior.js`, before the export:

```js
export function handleEditorAction(actionName, context) {
  const actions = createEditorActions(context);
  const editor = context.getEditorElement();
  if (!editor || editor.selectionStart === undefined) return;

  const value = editor.value;
  const selStart = editor.selectionStart;
  const selEnd = editor.selectionEnd;

  switch (actionName) {
    case "bold":
      actions.applyInlineMarkdown("**", "**", "bold");
      break;
    case "italic":
      actions.applyInlineMarkdown("_", "_", "italic");
      break;
    case "strikethrough": {
      const text = value.slice(selStart, selEnd) || "text";
      const replacement = `~~${text}~~`;
      context.applyEditorEdit(
        value.slice(0, selStart) + replacement + value.slice(selEnd),
        selStart + 2,
        selStart + 2 + text.length,
      );
      break;
    }
    case "inline-code":
      actions.applyInlineMarkdown("`", "`", "code");
      break;
    case "link":
      actions.applyMarkdownLink();
      break;
    case "image": {
      const url = "url";
      const alt = "alt";
      const replacement = `![${alt}](${url})`;
      const urlStart = selStart + alt.length + 3;
      context.applyEditorEdit(
        value.slice(0, selStart) + replacement + value.slice(selEnd),
        urlStart,
        urlStart + url.length,
      );
      break;
    }
    case "hr":
      context.applyEditorEdit(
        value.slice(0, selStart) + "\n---\n" + value.slice(selEnd),
        selStart + 1,
      );
      break;
    case "h1": case "h2": case "h3":
    case "h4": case "h5": case "h6": {
      const level = Number(actionName[1]);
      const prefix = "#".repeat(level) + " ";
      const lineStart = value.lastIndexOf("\n", Math.max(0, selStart - 1)) + 1;
      const lineEnd = value.indexOf("\n", selEnd);
      const safeLineEnd = lineEnd === -1 ? value.length : lineEnd;
      const line = value.slice(lineStart, safeLineEnd);
      const strippedLine = line.replace(/^#{1,6}\s*/, "");
      context.applyEditorEdit(
        value.slice(0, lineStart) + prefix + strippedLine + value.slice(safeLineEnd),
        lineStart + prefix.length,
        lineStart + prefix.length + strippedLine.length,
      );
      break;
    }
    case "ul":
      actions.toggleMarkdownList("unordered");
      break;
    case "ol":
      actions.toggleMarkdownList("ordered");
      break;
    case "task":
      actions.toggleMarkdownList("task");
      break;
    case "code-block": {
      const indent = value.lastIndexOf("\n", Math.max(0, selStart - 1)) + 1 === selStart ? "" : "\n";
      context.applyEditorEdit(
        value.slice(0, selStart) + `${indent}\`\`\`\n\n\`\`\`` + value.slice(selEnd),
        selStart + indent.length + 4,
      );
      break;
    }
    case "table": {
      const tableMd =
        "\n| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |\n";
      context.applyEditorEdit(
        value.slice(0, selStart) + tableMd + value.slice(selEnd),
        selStart + 1,
      );
      break;
    }
    case "quote": {
      const lineStart2 = value.lastIndexOf("\n", Math.max(0, selStart - 1)) + 1;
      context.applyEditorEdit(
        value.slice(0, lineStart2) + "> " + value.slice(lineStart2),
        selStart + 2,
        selEnd === selStart ? selStart + 2 : selEnd + 2,
      );
      break;
    }
    case "math-block": {
      const indent2 = value.lastIndexOf("\n", Math.max(0, selStart - 1)) + 1 === selStart ? "" : "\n";
      context.applyEditorEdit(
        value.slice(0, selStart) + `${indent2}$$\n\n$$` + value.slice(selEnd),
        selStart + indent2.length + 3,
      );
      break;
    }
    case "mermaid": {
      const indent3 = value.lastIndexOf("\n", Math.max(0, selStart - 1)) + 1 === selStart ? "" : "\n";
      context.applyEditorEdit(
        value.slice(0, selStart) + `${indent3}\`\`\`mermaid\ngraph TD\n    A-->B\n\`\`\`` + value.slice(selEnd),
        selStart + indent3.length,
      );
      break;
    }
    case "toc":
      context.applyEditorEdit(
        value.slice(0, selStart) + "\n[TOC]\n" + value.slice(selEnd),
        selStart + 1,
      );
      break;
  }
}
```

- [ ] **Step 2: Update export in `editor-behavior.js`**

Replace the existing export at the bottom:
```js
export { handleEditorKeyDown, handleEditorAction };
```

---

### Task 5: Wire up menu and toolbar in main.js

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `handleEditorAction` from editor-behavior.js, existing dialog/export/workspace functions
- Produces: Init functions called from DOMContentLoaded

- [ ] **Step 1: Import `handleEditorAction`**

Update the import of editor-behavior.js:
```js
import { handleEditorAction, handleEditorKeyDown as handleMarkdownEditorKeyDown } from "./editor-behavior.js";
```

- [ ] **Step 2: Add `initMenuBar` function**

```js
function initMenuBar() {
  document.querySelectorAll("#menu-bar .dropdown").forEach((dropdown) => {
    const btn = dropdown.querySelector(".menu-btn");
    const menu = dropdown.querySelector(".dropdown-menu");
    if (!btn || !menu) return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = !menu.classList.contains("hidden");
      closeAllMenus();
      if (!isOpen) {
        menu.classList.remove("hidden");
        btn.classList.add("open");
      }
    });

    menu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-menu-action]");
      if (!item) return;
      handleMenuAction(item.dataset.menuAction);
      closeAllMenus();
    });
  });

  document.addEventListener("click", closeAllMenus);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus();
  });
}

function closeAllMenus() {
  document.querySelectorAll("#menu-bar .dropdown-menu").forEach((m) => m.classList.add("hidden"));
  document.querySelectorAll("#menu-bar .menu-btn").forEach((b) => b.classList.remove("open"));
}

function handleMenuAction(action) {
  switch (action) {
    case "new": createMarkdownFile(); break;
    case "open": openFileDialog(); break;
    case "open-folder": chooseWorkspace(); break;
    case "save": saveActiveTab(); break;
    case "save-as": saveActiveTabAs(); break;
    case "export-html": handleExportHTML(); break;
    case "export-docx": handleExportDOCX(); break;
    case "export-print": handlePrintPDF(); break;
    case "settings": openSettingsDialog(); break;
    case "toggle-sidebar": setSidebarCollapsed(!document.getElementById("app-shell")?.classList.contains("sidebar-collapsed")); break;
    case "check-update": handleManualUpdateCheck(); break;
    case "about": showAboutDialog(); break;
  }
}
```

- [ ] **Step 3: Add `openFileDialog` helper**

```js
async function openFileDialog() {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: t("filter.markdown"), extensions: ["md", "markdown", "mdx", "mkd"] }],
      title: t("dialog.chooseWorkspace"),
    });
    if (typeof selected === "string") {
      await handleDroppedPath(selected);
    }
  } catch (e) {
    console.error("Failed to open file:", e);
  }
}
```

- [ ] **Step 4: Add `saveActiveTabAs` helper**

```js
async function saveActiveTabAs() {
  const tab = getActiveTab();
  if (!tab) return;
  const path = await chooseMarkdownSavePath(tab);
  if (!path) return;
  tab.path = path;
  await saveTab(tab);
}
```

- [ ] **Step 5: Add `showAboutDialog` helper**

```js
function showAboutDialog() {
  window.alert("MD Viewer v" + (document.querySelector('meta[name="version"]')?.content || "0.4.1"));
}
```

- [ ] **Step 6: Add `initFormatToolbar` function**

```js
function initFormatToolbar() {
  const toolbar = document.getElementById("fmt-toolbar");
  if (!toolbar) return;

  toolbar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-fmt-action]");
    if (!btn) return;

    const action = btn.dataset.fmtAction;

    // Close dropdown menus
    toolbar.querySelectorAll(".fmt-dropdown-menu").forEach((m) => m.classList.add("hidden"));

    if (action === "image") {
      handleInsertImage();
      return;
    }

    handleEditorAction(action, {
      getEditorElement: editorEl,
      applyEditorEdit,
    });

    editorEl()?.focus();
  });

  // Dropdown toggle for heading, list, insert
  toolbar.querySelectorAll(".fmt-dropdown > .fmt-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      if (!menu || !menu.classList.contains("fmt-dropdown-menu")) return;
      const isOpen = !menu.classList.contains("hidden");
      toolbar.querySelectorAll(".fmt-dropdown-menu").forEach((m) => m.classList.add("hidden"));
      if (!isOpen) menu.classList.remove("hidden");
    });
  });

  document.addEventListener("click", () => {
    toolbar.querySelectorAll(".fmt-dropdown-menu").forEach((m) => m.classList.add("hidden"));
  });
}

function handleInsertImage() {
  const editor = editorEl();
  if (!editor) return;
  handleEditorAction("image", {
    getEditorElement: editorEl,
    applyEditorEdit,
  });
  editor.focus();
}

function updateFormatToolbar() {
  const toolbar = document.getElementById("fmt-toolbar");
  if (!toolbar) return;
  toolbar.classList.toggle("hidden", !getActiveTab() || viewMode === "preview");
}
```

- [ ] **Step 7: Call menu/toolbar inits from DOMContentLoaded**

In the `DOMContentLoaded` handler, add:
```js
initMenuBar();
initFormatToolbar();
```

- [ ] **Step 8: Call `updateFormatToolbar` wherever view mode or tab changes**

Add `updateFormatToolbar()` calls inside:
- `setViewMode()` - at the end
- `switchToTab()` - at the end
- `resetAllTabs()` - at the end
- `updateEditorControls()` - at the end

---

### Task 6: Verify and test

**Files:**
- N/A

- [ ] **Step 1: Check for syntax errors**

Run: `pnpm build`
Expected: Build succeeds without errors.

- [ ] **Step 2: Manual verification checklist**
- File menu opens and closes on click
- File menu items work (New, Open, Save, etc.)
- View menu sidebar toggle works
- Format toolbar shows in edit/split mode, hides in preview mode
- Bold, italic, strikethrough buttons insert correct markdown
- Heading dropdown inserts correct heading prefix
- List dropdown toggles lists
- Link, image, HR buttons work
- Code block, table, quote insert correct markdown
- Math block, mermaid, TOC insert correct markdown
