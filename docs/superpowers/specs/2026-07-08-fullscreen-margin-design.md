# 双击启动最大化与内容区宽度百分比配置

## 背景与目标

用户希望通过双击 Markdown 文件打开 MD Viewer 时，窗口自动最大化展示；同时预览页和翻译页的左右留白大小可以通过百分比进行配置。

本设计文档规范实现方案，确保行为可预测、配置持久化、与现有代码风格一致。

## 需求确认

- **全屏行为**：窗口最大化（Maximized），而非 OS 原生全屏（Fullscreen）。
- **触发条件**：通过双击 Markdown 文件（或文件关联/命令行传入文件路径）启动应用时，窗口自动最大化。
- **内容区宽度**：统一配置预览页 `#markdown-content` 和翻译页 `#translate-content` 的内容区宽度。
- **百分比语义**：内容区宽度占可用区域宽度的百分比，范围 **50%–100%**。
  - 100%：内容区铺满可用区域，左右无额外留白。
  - 70%：内容区占可用区域宽度的 70%，剩余 30% 平均分配到左右两侧。
- **设置位置**：集成到现有设置面板（`#settings-dialog`），使用滑块 + 数字输入框，支持实时预览。

## 方案概述

采用 **方案 A**：

1. Rust 后端在应用启动时检测是否有待打开的文件；若有，则调用窗口最大化。
2. 前端引入 CSS 自定义属性 `--content-width-ratio`，统一控制预览和翻译内容区宽度。
3. 新增 `content-width.js` 模块负责读取、保存和应用配置。
4. 在设置面板中新增一个设置项，提供滑块和百分比输入。
5. 添加必要的 i18n 文案。

## 详细设计

### 1. 启动时最大化窗口

**文件**：`src-tauri/src/lib.rs`

在 `.setup` 钩子中，当前逻辑为：

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

**修改后逻辑**：

1. 先通过 `opened_paths_from_args` 获取启动时传入的文件路径。
2. 若路径非空，则对主窗口调用 `window.maximize()`。
3. 若路径为空，则保持现有 `resize_window_for_display()` 行为（按显示器比例设置窗口大小并居中）。
4. 最后仍然调用 `store_initial_opened_paths` 将路径存入应用状态。

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

**边界情况**：

- `maximize()` 可能失败（如窗口尚未完全创建），使用 `let _ =` 忽略错误，避免启动崩溃。
- 在 macOS 上，Tauri 的 `maximize()` 行为等同于标准的“缩放”最大化，不影响后续关闭/还原。
- 通过应用图标双击启动且不传入文件时，不触发最大化，保持原有居中窗口。

### 2. 内容区宽度百分比

#### 2.1 CSS 变量

在 `src/styles.css` 中引入全局变量，默认值为 `100%`：

```css
:root {
  /* ... existing vars ... */
  --content-width-ratio: 100%;
}
```

> 注：`--content-width-ratio` 存储的是形如 `"70%"` 的字符串，直接作为 CSS 百分比宽度使用。

#### 2.2 预览内容区 `#markdown-content`

当前样式：

```css
#markdown-content {
  width: min(920px, 100%);
  min-height: 100%;
  margin: 0 auto;
  padding: 52px 64px 80px;
  /* ... */
}
```

**修改后**：

```css
#markdown-content {
  width: var(--content-width-ratio, 100%);
  min-height: 100%;
  margin: 0 auto;
  padding: 52px 64px 80px;
  /* ... */
}
```

**分屏模式保持原行为**：分屏模式（`#document-workspace.mode-split #markdown-content`）当前已经覆盖为 `width: 100%; max-width: none;`，保持覆盖不变，即分屏模式下忽略百分比设置。

**响应式断点**：`@media (max-width: 760px)` 中 `#markdown-content` 的 `padding` 变小，但宽度仍遵循百分比变量。窄屏下内容区过窄属于预期行为，用户可通过调大百分比解决。

#### 2.3 翻译内容区 `#translate-content`

当前样式：

```css
#translate-content {
  line-height: 1.7;
}
```

其父级 `#translate-view` 有 `padding: 32px 40px 120px`，且 `#translate-content` 通过兄弟选择器与 `#translate-progress`、 `#translate-error`、 `#translate-actions` 共用：

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

**修改后**：

将翻译视图中的主要区块统一改为百分比宽度：

```css
#translate-progress,
#translate-error,
#translate-content,
#translate-actions {
  width: var(--content-width-ratio, 100%);
  margin-left: auto;
  margin-right: auto;
}

#translate-content {
  line-height: 1.7;
}
```

> `#translate-view` 的 `padding: 32px 40px 120px` 保持不变，百分比基于 `#translate-view` 的 content box（即可用区域）。进度条、错误提示、内容与操作按钮宽度保持一致。

#### 2.4 JavaScript 模块

新增 `src/content-width.js`：

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
  const value = Math.min(MAX_RATIO, Math.max(MIN_RATIO, Math.round(Number(ratio) || DEFAULT_RATIO)));
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
  const value = Math.min(MAX_RATIO, Math.max(MIN_RATIO, Math.round(Number(ratio) || DEFAULT_RATIO)));
  document.documentElement.style.setProperty("--content-width-ratio", String(value));
  return value;
}
```

### 3. 设置面板 UI

#### 3.1 HTML

在 `src/index.html` 的 `#settings-dialog > .settings-body` 中，紧随“语言”设置后新增一个 section：

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

#### 3.2 CSS

在 `src/styles.css` 中添加样式：

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

#### 3.3 JavaScript 事件绑定

在 `src/main.js` 中新增 `initContentWidthSettings()`：

1. 初始化时读取 `getContentWidthRatio()` 并应用到 CSS 变量。
2. 设置面板打开时同步当前值到 range 和 number input。
3. 监听 range/input 的 `input` 事件，实时调用 `applyContentWidthRatio` 并保存。
4. number input 失焦或回车时进行边界裁剪并同步到 range。

```js
import {
  applyContentWidthRatio,
  getContentWidthRatio,
  saveContentWidthRatio,
} from "./content-width.js";

function initContentWidthSettings() {
  const ratio = getContentWidthRatio();
  applyContentWidthRatio(ratio);

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

  // Sync when settings dialog opens
  const backdrop = document.getElementById("settings-backdrop");
  const observer = new MutationObserver(() => {
    if (!backdrop.classList.contains("hidden")) {
      const current = getContentWidthRatio();
      range.value = current;
      number.value = current;
    }
  });
  observer.observe(backdrop, { attributes: true, attributeFilter: ["class"] });
}
```

在 `DOMContentLoaded` 中调用：

```js
initContentWidthSettings();
```

### 4. 国际化

在 `src/i18n.js` 的中英文消息中添加：

```js
"zh-CN": {
  // ...
  "settings.contentWidthTitle": "内容区宽度",
  "settings.contentWidthDescription": "调整预览和翻译页面内容区占窗口宽度的百分比。数值越小，左右留白越大。",
  "settings.contentWidthAria": "内容区宽度",
  "settings.contentWidthNumberAria": "内容区宽度百分比",
},
"en-US": {
  // ...
  "settings.contentWidthTitle": "Content Width",
  "settings.contentWidthDescription": "Adjust the content width as a percentage of the window for preview and translation views. Smaller values create larger side margins.",
  "settings.contentWidthAria": "Content width",
  "settings.contentWidthNumberAria": "Content width percentage",
},
```

### 5. 导出与打印

- **打印**：`@media print` 中已经覆盖 `#markdown-content` 为 `width: auto; margin: 0; padding: 0;`，不受百分比设置影响。
- **导出 HTML**：导出的 HTML 使用固定的 `max-width: 1060px; margin: 0 auto; padding: 40px;`，不受百分比设置影响。
- **DOCX 导出**：直接读取 DOM 内容，DOM 当前已应用用户百分比。为避免导出结果随用户设置变化，应在导出前临时重置 `--content-width-ratio` 为 100%，导出后恢复。或者，由于 DOCX 导出不依赖 `#markdown-content` 的宽度布局，可直接在导出容器上使用固定样式。为简化实现，本次设计暂不改变 DOCX 导出行为；如需固定宽度，可在后续迭代中处理。

## 待办验证项

- [ ] 双击 Markdown 文件启动后窗口最大化。
- [ ] 双击应用图标启动无文件时不最大化。
- [ ] 设置面板中滑块和数字输入同步。
- [ ] 调整百分比时预览页内容区宽度实时变化。
- [ ] 调整百分比时翻译页内容区宽度实时变化。
- [ ] 百分比值在 50–100 之间，超出边界自动裁剪。
- [ ] 设置持久化到 localStorage，重启后生效。
- [ ] 分屏模式下预览区保持原行为（铺满）。
- [ ] 中英文界面文案正确显示。

## 变更文件清单

- `src-tauri/src/lib.rs`：启动最大化逻辑。
- `src/styles.css`：CSS 变量与内容区宽度样式。
- `src/index.html`：设置面板新增内容区宽度设置项。
- `src/main.js`：初始化与事件绑定。
- `src/content-width.js`（新增）：配置读写与应用模块。
- `src/i18n.js`：新增国际化文案。
