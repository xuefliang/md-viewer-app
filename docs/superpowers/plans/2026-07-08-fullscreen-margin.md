# 双击启动最大化与内容区宽度百分比配置 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现双击 Markdown 文件启动时窗口最大化，并在设置面板中提供预览/翻译内容区宽度百分比配置。

**Architecture:** 在 Rust 启动流程中检测是否有待打开文件，若有则最大化窗口；前端通过 CSS 自定义属性 `--content-width-ratio` 统一控制预览和翻译视图的内容区宽度，并新增 `content-width.js` 模块管理 localStorage 持久化；设置面板添加 range + number 输入实现实时预览。

**Tech Stack:** Tauri v2 (Rust), vanilla JavaScript (ES modules), Vite, CSS custom properties, localStorage.

## Global Constraints

- 窗口最大化行为：窗口最大化（Maximized），而非 OS 原生全屏（Fullscreen）。
- 触发条件：通过双击 Markdown 文件（或文件关联/命令行传入文件路径）启动应用时触发最大化。
- 内容区宽度百分比范围：50%–100%，表示内容区占可用区域宽度的百分比。
- 统一配置：一个设置同时控制预览页和翻译页。
- 持久化：使用 `localStorage` 保存用户选择。
- 默认行为：默认 100%（内容区铺满可用区域）。
- 分屏模式保持现有行为：忽略百分比，预览区铺满。
- 导出/打印：导出 HTML 和打印使用固定样式，不受用户百分比设置影响。

---

## File Mapping

| 文件 | 责任 |
| --- | --- |
| `src-tauri/src/lib.rs` | 在应用启动 setup 中检测待打开文件并最大化窗口 |
| `src/styles.css` | 定义 `--content-width-ratio` 变量并应用到 `#markdown-content` 和翻译视图元素 |
| `src/index.html` | 在设置面板新增内容区宽度控制 UI |
| `src/content-width.js`（新建） | 读取、保存、应用内容区宽度比例 |
| `src/main.js` | 初始化内容区宽度设置并绑定事件 |
| `src/i18n.js` | 添加中英文国际化文案 |

---

### Task 1: Rust 启动时最大化窗口

**Files:**
- Modify: `src-tauri/src/lib.rs:743-751`

**Interfaces:**
- Consumes: `opened_paths_from_args`, `store_initial_opened_paths`, `resize_window_for_display`
- Produces: 启动时若传入 Markdown 文件路径，则主窗口调用 `maximize()`

- [ ] **Step 1: 修改 `src-tauri/src/lib.rs` 的 `.setup` 钩子**

将当前 setup 代码：

```rust
.setup(|app| {
    if let Some(window) = app.get_webview_window("main") {
        resize_window_for_display(&window);
    }

    let paths = opened_paths_from_args(std::env::args());
    store_initial_opened_paths(app.handle(), paths);
    Ok(())
})
```

替换为：

```rust
.setup(|app| {
    let paths = opened_paths_from_args(std::env::args());
    let has_paths = !paths.is_empty();

    if let Some(window) = app.get_webview_window("main") {
        if has_paths {
            let _ = window.maximize();
        } else {
            resize_window_for_display(&window);
        }
    }

    store_initial_opened_paths(app.handle(), paths);
    Ok(())
})
```

- [ ] **Step 2: 验证 Rust 编译**

Run: `pnpm tauri build --debug` 或 `cd src-tauri && cargo check`
Expected: 编译通过，无错误。

- [ ] **Step 3: 手动验证最大化**

Run: `pnpm tauri dev` 启动开发模式，然后在另一个终端运行：

```bash
# macOS
open "src-tauri/target/debug/MD Viewer.app" --args /path/to/example.md

# Windows
./src-tauri/target/debug/MD Viewer.exe /path/to/example.md
```

Expected: 窗口启动后自动最大化（占满屏幕工作区）。

- [ ] **Step 4: 验证无文件启动不最大化**

直接启动应用（不传入文件）。
Expected: 窗口按原有逻辑居中并设置大小，不最大化。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: maximize window on startup when opening a markdown file"
```

---

### Task 2: 新增内容区宽度配置模块

**Files:**
- Create: `src/content-width.js`

**Interfaces:**
- Produces:
  - `getContentWidthRatio(): number`
  - `saveContentWidthRatio(ratio: number): number`
  - `applyContentWidthRatio(ratio: number): number`

- [ ] **Step 1: 创建 `src/content-width.js`**

```js
const STORAGE_KEY = "md-viewer-content-width-ratio";
const MIN_RATIO = 50;
const MAX_RATIO = 100;
const DEFAULT_RATIO = 100;

function canUseStorage() {
  return typeof localStorage !== "undefined";
}

export function getContentWidthRatio() {
  if (!canUseStorage()) return DEFAULT_RATIO;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed >= MIN_RATIO && parsed <= MAX_RATIO) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_RATIO;
}

export function saveContentWidthRatio(ratio) {
  const value = Math.min(
    MAX_RATIO,
    Math.max(MIN_RATIO, Math.round(Number(ratio) || DEFAULT_RATIO))
  );
  if (canUseStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore storage errors
    }
  }
  return value;
}

export function applyContentWidthRatio(ratio) {
  const value = Math.min(
    MAX_RATIO,
    Math.max(MIN_RATIO, Math.round(Number(ratio) || DEFAULT_RATIO))
  );
  document.documentElement.style.setProperty(
    "--content-width-ratio",
    `${value}%`
  );
  return value;
}
```

- [ ] **Step 2: 验证模块导出**

Run: `pnpm build`
Expected: Vite 构建通过，无语法错误。

- [ ] **Step 3: Commit**

```bash
git add src/content-width.js
git commit -m "feat: add content-width settings module"
```

---

### Task 3: 应用内容区宽度 CSS 变量

**Files:**
- Modify: `src/styles.css:5-18`, `src/styles.css:1546-1551`, `src/styles.css:1344-1351`

**Interfaces:**
- Consumes: `--content-width-ratio`（由 `content-width.js` 设置）

- [ ] **Step 1: 在 `:root` 中定义变量**

在 `src/styles.css` 的 `:root` 区块中添加：

```css
:root {
  /* ... existing vars ... */
  --content-width-ratio: 100%;
}
```

- [ ] **Step 2: 修改 `#markdown-content` 宽度**

将当前：

```css
#markdown-content {
  width: min(920px, 100%);
  min-height: 100%;
  margin: 0 auto;
  padding: 52px 64px 80px;
  box-sizing: border-box;
  background: var(--bg);
  -webkit-user-select: text;
  user-select: text;
}
```

改为：

```css
#markdown-content {
  width: var(--content-width-ratio, 100%);
  min-height: 100%;
  margin: 0 auto;
  padding: 52px 64px 80px;
  box-sizing: border-box;
  background: var(--bg);
  -webkit-user-select: text;
  user-select: text;
}
```

- [ ] **Step 3: 修改翻译视图主要元素宽度**

将当前：

```css
#translate-progress,
#translate-error,
#translate-content,
#translate-actions {
  max-width: 860px;
  margin-left: auto;
  margin-right: auto;
}
```

改为：

```css
#translate-progress,
#translate-error,
#translate-content,
#translate-actions {
  width: var(--content-width-ratio, 100%);
  margin-left: auto;
  margin-right: auto;
}
```

> 注意：保留 `#translate-content` 的 `line-height: 1.7;` 等独立样式不变。

- [ ] **Step 4: 手动验证 CSS**

Run: `pnpm dev`
Expected: 打开一个 Markdown 文件，内容区默认铺满可用区域；在 DevTools 中检查 `#markdown-content`，其 `width` 计算值应接近父容器宽度。

- [ ] **Step 5: Commit**

```bash
git add src/styles.css
git commit -m "feat: apply content-width ratio to preview and translate views"
```

---

### Task 4: 设置面板添加内容区宽度 UI

**Files:**
- Modify: `src/index.html:263-269`

**Interfaces:**
- Produces: `#settings-content-width` (range) 和 `#settings-content-width-number` (number input)

- [ ] **Step 1: 在设置面板插入新 section**

在 `src/index.html` 中，找到“语言”设置 section 之后、“主题字号” section 之前，插入：

```html
<section class="settings-section">
  <div class="settings-section-copy">
    <label for="settings-content-width" data-i18n="settings.contentWidthTitle">内容区宽度</label>
    <p data-i18n="settings.contentWidthDescription">调整预览和翻译页面内容区占窗口宽度的百分比。数值越小，左右留白越大。</p>
  </div>
  <div class="settings-input-row settings-content-width-row">
    <input
      id="settings-content-width"
      type="range"
      min="50"
      max="100"
      step="1"
      value="100"
      aria-label="内容区宽度"
      data-i18n-aria-label="settings.contentWidthAria"
    />
    <input
      id="settings-content-width-number"
      type="number"
      min="50"
      max="100"
      step="1"
      value="100"
      aria-label="内容区宽度百分比"
      data-i18n-aria-label="settings.contentWidthNumberAria"
    />
    <span class="settings-content-width-unit">%</span>
  </div>
</section>
```

- [ ] **Step 2: 验证 HTML 结构**

Run: `pnpm build`
Expected: 构建通过。

- [ ] **Step 3: Commit**

```bash
git add src/index.html
git commit -m "feat: add content-width controls to settings dialog"
```

---

### Task 5: 设置面板样式

**Files:**
- Modify: `src/styles.css:1522-1531` 附近

**Interfaces:**
- Consumes: `#settings-content-width`, `#settings-content-width-number`, `.settings-content-width-row`, `.settings-content-width-unit`

- [ ] **Step 1: 添加内容区宽度设置样式**

在 `src/styles.css` 的 `.settings-field-row` 样式之后添加：

```css
.settings-content-width-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

#settings-content-width {
  flex: 1;
  min-width: 120px;
}

#settings-content-width-number {
  width: 64px;
  text-align: center;
}

.settings-content-width-unit {
  color: var(--app-muted);
  font-size: 13px;
}
```

- [ ] **Step 2: 手动验证样式**

Run: `pnpm dev`，打开设置面板。
Expected: 滑块和数字输入框在同一行，数字输入框宽度约 64px，右侧显示 `%`。

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: add content-width settings controls styles"
```

---

### Task 6: 绑定内容区宽度事件与初始化

**Files:**
- Modify: `src/main.js:1-103`（import 区域）, `src/main.js:3830-3850`（DOMContentLoaded）, 新增函数

**Interfaces:**
- Consumes: `getContentWidthRatio`, `saveContentWidthRatio`, `applyContentWidthRatio` from `./content-width.js`
- Produces: `initContentWidthSettings()` 函数

- [ ] **Step 1: 在 `src/main.js` 顶部导入模块**

在 `import { applyDefaultSidebarWidth, initResizablePanels } from "./resizable-panels.js";` 之后添加：

```js
import {
  applyContentWidthRatio,
  getContentWidthRatio,
  saveContentWidthRatio,
} from "./content-width.js";
```

- [ ] **Step 2: 添加 `initContentWidthSettings` 函数**

在 `src/main.js` 中找一个合适位置（例如 `initTheme` 函数之后）添加：

```js
function initContentWidthSettings() {
  const initialRatio = getContentWidthRatio();
  applyContentWidthRatio(initialRatio);

  const range = document.getElementById("settings-content-width");
  const number = document.getElementById("settings-content-width-number");
  if (!range || !number) return;

  const sync = (value) => {
    const normalized = saveContentWidthRatio(value);
    range.value = normalized;
    number.value = normalized;
    applyContentWidthRatio(normalized);
  };

  range.addEventListener("input", () => sync(range.value));
  number.addEventListener("input", () => sync(number.value));
  number.addEventListener("change", () => sync(number.value));

  const backdrop = document.getElementById("settings-backdrop");
  if (backdrop) {
    const observer = new MutationObserver(() => {
      if (!backdrop.classList.contains("hidden")) {
        const current = getContentWidthRatio();
        range.value = current;
        number.value = current;
      }
    });
    observer.observe(backdrop, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
}
```

- [ ] **Step 3: 在 DOMContentLoaded 中调用初始化**

在 `window.addEventListener("DOMContentLoaded", async () => {` 内部，找到 `initTheme();` 之后添加：

```js
initContentWidthSettings();
```

- [ ] **Step 4: 手动验证功能**

Run: `pnpm dev`

1. 打开一个 Markdown 文件。
2. 打开设置面板。
3. 拖动“内容区宽度”滑块到 70%。
   Expected: 预览页内容区立即变窄，左右留白变大；数字输入框同步显示 70。
4. 切换到翻译视图并开始翻译。
   Expected: 翻译内容区宽度同样为 70%。
5. 在数字输入框输入 55 并回车。
   Expected: 内容区进一步变窄，滑块同步到 55。
6. 刷新页面。
   Expected: 设置面板中显示上次保存的值，内容区宽度恢复。

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat: wire up content-width settings controls"
```

---

### Task 7: 添加国际化文案

**Files:**
- Modify: `src/i18n.js`

**Interfaces:**
- Produces: `settings.contentWidthTitle`, `settings.contentWidthDescription`, `settings.contentWidthAria`, `settings.contentWidthNumberAria`

- [ ] **Step 1: 在中文消息中添加文案**

在 `src/i18n.js` 的 `"zh-CN"` 对象中，找到 `"settings.title": "设置",` 之后添加：

```js
"settings.contentWidthTitle": "内容区宽度",
"settings.contentWidthDescription": "调整预览和翻译页面内容区占窗口宽度的百分比。数值越小，左右留白越大。",
"settings.contentWidthAria": "内容区宽度",
"settings.contentWidthNumberAria": "内容区宽度百分比",
```

- [ ] **Step 2: 在英文消息中添加文案**

在 `"en-US"` 对象中，找到对应位置添加：

```js
"settings.contentWidthTitle": "Content Width",
"settings.contentWidthDescription": "Adjust the content width as a percentage of the window for preview and translation views. Smaller values create larger side margins.",
"settings.contentWidthAria": "Content width",
"settings.contentWidthNumberAria": "Content width percentage",
```

- [ ] **Step 3: 验证国际化**

Run: `pnpm dev`
1. 在中文界面打开设置面板，确认显示“内容区宽度”和相关说明。
2. 切换语言到 English，确认显示 "Content Width" 和相关说明。

- [ ] **Step 4: Commit**

```bash
git add src/i18n.js
git commit -m "feat: add i18n strings for content-width setting"
```

---

### Task 8: 回归验证与边界检查

**Files:**
- 不涉及文件修改

- [ ] **Step 1: 验证边界值处理**

Run: `pnpm dev`
1. 在设置面板数字输入框输入 40（低于最小值）。
   Expected: 自动裁剪为 50，内容区宽度对应 50%。
2. 输入 120（高于最大值）。
   Expected: 自动裁剪为 100。
3. 输入非数字字符。
   Expected: 恢复为默认值 100。

- [ ] **Step 2: 验证分屏模式不受影响**

1. 将内容区宽度设置为 60%。
2. 切换到“分屏”视图。
   Expected: 预览区在分屏模式下仍然铺满右侧区域，不受 60% 设置影响。

- [ ] **Step 3: 验证导出和打印**

1. 将内容区宽度设置为 60%。
2. 导出 HTML。
   Expected: 导出的 HTML 内容宽度固定为 `max-width: 1060px`，不受 60% 影响。
3. 打印预览。
   Expected: 打印预览中内容铺满纸张，无左右大留白。

- [ ] **Step 4: 验证无 Tauri 运行时环境**

Run: `pnpm dev` 在浏览器中直接打开 `http://localhost:5173`（非 Tauri）。
Expected: 内容区宽度设置仍然可以正常工作，localStorage 保存和读取正常。

- [ ] **Step 5: 最终构建验证**

Run: `pnpm build && pnpm tauri build --debug`
Expected: 前端和 Tauri 构建均通过。

- [ ] **Step 6: Commit（如需要修正）**

如果回归验证中发现问题，修复后提交：

```bash
git add <changed-files>
git commit -m "fix: address content-width edge cases"
```

---

## Self-Review

### Spec Coverage

| 设计文档需求 | 实施任务 |
| --- | --- |
| 双击 Markdown 启动时窗口最大化 | Task 1 |
| 内容区宽度百分比 50%–100% | Task 2, Task 3 |
| 统一控制预览和翻译视图 | Task 3 |
| 设置面板 UI | Task 4, Task 5, Task 6 |
| localStorage 持久化 | Task 2, Task 6 |
| 默认 100% | Task 2 |
| 分屏模式保持原行为 | Task 3, Task 8 |
| 导出/打印不受影响 | Task 8 |
| i18n 支持 | Task 7 |

### Placeholder Scan

- 无 TBD/TODO。
- 所有代码步骤均包含完整代码。
- 所有命令均包含预期输出。
- 手动验证步骤具体可执行。

### Type Consistency

- `getContentWidthRatio(): number`
- `saveContentWidthRatio(ratio: number): number`
- `applyContentWidthRatio(ratio: number): number`
- CSS 变量 `--content-width-ratio` 接收 `"50%"` 到 `"100%"` 的字符串。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-08-fullscreen-margin.md`.**

Recommended execution approach: **Subagent-Driven Development** — dispatch a fresh subagent per task, with review between tasks for fast iteration.
