# 翻译视图修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复翻译视图滚动条不可见、翻译完成后重复翻译、以及翻译结果不会自动保存为 `.md` 的三个问题。

**Architecture:** 通过 CSS 为翻译视图补全滚动条样式；在 `setViewMode()` 中增加「已有翻译结果则直接显示」的短路逻辑；在 `startTranslation()` 成功完成后异步写入 `<原文件名>.translated.md`。

**Tech Stack:** Tauri v2, vanilla JS, markdown-it, highlight.js, Vite

## Global Constraints

- 保持现有单窗口、单文件架构，不引入新依赖。
- 自动保存路径与原文件同目录，命名规则为 `<原文件名>.translated.md`。
- 无 `tab.path` 的草稿不自动保存，保留手动保存按钮。
- 所有文案复用或新增 `src/i18n.js` 中的 key。
- 不破坏现有翻译手动保存功能。

---

## 已审阅设计文档

- `docs/superpowers/specs/2026-07-07-translation-view-fixes-design.md`

---

### Task 1: 修复翻译视图滚动条

**Files:**
- Modify: `src/styles.css:1314-1387`
- Test: 手动在 example.md 上切到翻译视图，确认长文档右侧出现滚动条

**Interfaces:**
- 无新增 JS 接口，仅调整 CSS 选择器 `#translate-view` 与 Webkit 滚动条样式。

- [ ] **Step 1: 调整 `#translate-view` 为独立可滚动容器**

```css
#translate-view {
  padding: 32px 40px 120px;
  max-width: 860px;
  margin: 0 auto;
  min-height: 100%;
  height: 100%;
  overflow-y: auto;
}
```

- [ ] **Step 2: 为 `#translate-view` 补全 Webkit 滚动条滑块样式**

在 `#translate-view` 样式块后追加：

```css
#translate-view::-webkit-scrollbar {
  width: 10px;
}

#translate-view::-webkit-scrollbar-track {
  background: transparent;
}

#translate-view::-webkit-scrollbar-thumb {
  background: var(--app-line-strong);
  border-radius: 5px;
  border: 2px solid var(--app-page);
}

#translate-view::-webkit-scrollbar-thumb:hover {
  background: var(--app-muted);
}
```

- [ ] **Step 3: 验证滚动条可见**

启动开发模式：`pnpm tauri dev`
打开一个足够长的 Markdown 文件，切换到翻译视图，确认右侧出现可拖动的滚动条。

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "fix: make translate view scrollbar visible"
```

---

### Task 2: 避免翻译完成后重复翻译

**Files:**
- Modify: `src/main.js:1848-1855`
- Test: 手动切换视图，确认翻译完成后再次进入翻译视图不会重新触发 `startTranslation()`

**Interfaces:**
- 消费：`tab.translatedContent`（字符串，已存在的翻译结果）
- 产出：无新函数，仅改变 `setViewMode()` 分支行为

- [ ] **Step 1: 在 `setViewMode()` 中增加已有翻译结果的判断**

将：

```javascript
if (viewMode === "translate") {
  translateViewEl()?.classList.remove("hidden");
  editorShellEl()?.classList.add("hidden");
  contentEl()?.classList.add("hidden");
  if (previousMode !== "translate" && getActiveTab()) {
    startTranslation();
  }
}
```

改为：

```javascript
if (viewMode === "translate") {
  translateViewEl()?.classList.remove("hidden");
  editorShellEl()?.classList.add("hidden");
  contentEl()?.classList.add("hidden");
  const tab = getActiveTab();
  if (previousMode !== "translate" && tab) {
    if (tab.translatedContent) {
      // 已有翻译结果，直接渲染，避免重复翻译
      if (translateContentEl()) {
        renderMarkdownContent(tab.translatedContent, {
          filePath: tab.path,
          invoke,
          isTauriRuntime,
          workspaceRoot: workspace?.root || null,
        }).then(() => {
          translateContentEl().innerHTML = contentEl()?.innerHTML;
        });
      }
      translateProgressEl()?.classList.add("hidden");
      translateActionsEl()?.classList.remove("hidden");
    } else {
      startTranslation();
    }
  }
}
```

- [ ] **Step 2: 验证重复翻译已消除**

1. 打开一个 Markdown 文件并切换到翻译视图，等待翻译完成。
2. 切换到预览/编辑视图，再切回翻译视图。
3. 观察网络请求或进度文本：不应再出现「翻译中...」，而应直接显示已翻译内容。

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "fix: do not re-translate when translated content already exists"
```

---

### Task 3: 翻译完成后自动保存 `.md`

**Files:**
- Modify: `src/main.js:1907-1922`
- Modify: `src/i18n.js:164-166`（新增/复用文案 key）
- Test: 手动执行翻译，确认同目录生成 `<原文件名>.translated.md`

**Interfaces:**
- 消费：`tab.path`, `tab.translatedContent`, `tab.lineEnding`, `getFileName()`, `applyLineEnding()`, `invoke("write_markdown_file", ...)`
- 产出：无新增导出函数，仅 `startTranslation()` 完成分支内部调用自动保存

- [ ] **Step 1: 新增/确认自动保存相关 i18n 文案**

在 `src/i18n.js` 的中文与英文对象中确认存在以下 key（若不存在则添加）：

```javascript
"translate.autoSaved": "翻译已自动保存",
"translate.autoSaveFailed": "自动保存翻译失败：{message}",
```

对应英文：

```javascript
"translate.autoSaved": "Translation auto-saved",
"translate.autoSaveFailed": "Auto-save translation failed: {message}",
```

- [ ] **Step 2: 在 `startTranslation()` 成功分支中调用自动保存**

在现有代码：

```javascript
if (requestId !== translationRequestId) return;
tab.translatedContent = translated;
if (contentElTranslate) {
  await renderMarkdownContent(translated, {...});
  contentElTranslate.innerHTML = contentEl()?.innerHTML;
}
if (progressText) progressText.textContent = t("translate.complete");
if (progressBar) progressBar.style.width = "100%";
setTimeout(() => progressEl?.classList.add("hidden"), 1200);
const actionsEl = translateActionsEl();
if (actionsEl) actionsEl.classList.remove("hidden");
```

之后追加自动保存逻辑（不要阻塞渲染）：

```javascript
// 自动保存翻译结果（仅当原文有路径时）
if (tab.path) {
  const baseName = getFileName(tab.path).replace(/\.md$/i, "");
  const defaultName = baseName + ".translated.md";
  const dirName = getDirName(tab.path);
  const targetPath = dirName ? joinLocalPath(dirName, defaultName) : defaultName;
  // 若目标路径与原文相同则跳过
  if (!isSameLocalPath(targetPath, tab.path)) {
    const contents = applyLineEnding(tab.translatedContent, tab.lineEnding || "\n");
    invoke("write_markdown_file", { path: targetPath, contents })
      .then(() => {
        if (progressText) progressText.textContent = t("translate.autoSaved");
      })
      .catch((err) => {
        if (progressText) progressText.textContent = t("translate.autoSaveFailed", { message: err.message || String(err) });
      });
  }
}
```

> 注意：使用 `src/path-utils.js` 中的 `getDirName` / `joinLocalPath` / `isSameLocalPath` 进行跨平台路径拼接，避免 Windows 与 macOS 路径分隔符问题。`main.js` 已导入这些函数。

- [ ] **Step 3: 验证自动保存**

1. 打开一个有路径的 Markdown 文件（如 `example.md`）。
2. 切换到翻译视图，等待翻译完成。
3. 检查文件系统，确认同目录下出现 `example.translated.md`。
4. 删除该文件，将视图切走再切回翻译视图（由于 Task 2 的缓存，不应重新翻译）。
5. 关闭并重新打开应用，再次翻译，确认文件重新生成。

- [ ] **Step 4: Commit**

```bash
git add src/main.js src/i18n.js
git commit -m "feat: auto-save translated markdown after translation completes"
```

---

## 最终验证

- [ ] 运行 `pnpm tauri dev`，执行上述三个 Task 的测试步骤。
- [ ] 确认没有 JavaScript 控制台错误。
- [ ] 确认手动「保存翻译」按钮仍然可以弹出对话框并保存到自定义位置。
- [ ] 确认现有预览/编辑/分屏模式未受影响。
