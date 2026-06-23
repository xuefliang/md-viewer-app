# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A lightweight macOS desktop app for viewing Markdown files. Opens .md files on double-click, renders them with themes, supports multi-tab browsing, workspace mode, split editing, export to DOCX/HTML, math (KaTeX), Mermaid diagrams, and in-app updates.

## Tech Stack

- **Framework**: Tauri v2 (Rust backend + WebView frontend)
- **Frontend bundler**: Vite
- **Markdown parser**: markdown-it with highlight.js, KaTeX, Mermaid
- **Export**: docx library (DOCX), self-contained HTML
- **i18n**: Custom `src/i18n.js` (multiple locales)
- **Tauri plugins**: `plugin-dialog`, `plugin-updater`, `plugin-process`

## Build & Run

```bash
pnpm install
pnpm tauri dev          # Dev mode with hot reload
pnpm build && pnpm tauri build  # Production .app + .dmg

# Screenshots (requires playwright)
pnpm screenshots:install && pnpm screenshots

# Test with a file
open "src-tauri/target/release/bundle/macos/MD Viewer.app" --args /path/to/file.md
```

Requires: Xcode Command Line Tools, Rust (rustup), Node.js, pnpm.

## Architecture

**Rendering pipeline**: Rust reads .md file → emits Tauri event to WebView → `markdown-content.js` parses via markdown-it → highlight.js highlights code → KaTeX renders math → Mermaid renders diagrams → theme CSS styles output.

**Frontend modules** (`src/`):
- `main.js` — App entry: tabs, workspace, view modes (preview/edit/split), find-in-document, settings, export, update dialogs, all event wiring
- `markdown-content.js` — markdown-it config, Mermaid/KaTeX rendering, image path resolution
- `theme-engine.js` — Loads theme JSON from `theme-data/`, builds CSS from color/font/layout definitions
- `theme-settings.js` — Per-theme typography overrides (persisted to localStorage)
- `dom.js` — Cached DOM element accessors (single source of truth for element IDs)
- `i18n.js` — Locale loading and `t()` translation helper
- `editor-behavior.js` — Markdown editor keyboard shortcuts (tab, list continuation, etc.)
- `path-utils.js` — Path manipulation, markdown link resolution, `normalizeMarkdownContent`
- `copy-handler.js` — Smart copy (plain text vs rich text for Word compatibility)
- `docx-exporter.js` — HTML → DOCX conversion via the `docx` library
- `image-clipboard.js` — Copy images to clipboard via Tauri invoke
- `resizable-panels.js` — Sidebar/outline panel drag-resize

**Theme data** (`src/theme-data/`):
- `registry.json` — Ordered list of theme IDs and metadata
- `themes/*.json` — Per-theme definitions (color scheme, code theme, layout, fonts)
- `color-schemes/*.json`, `code-themes/*.json` — Reusable palette/highlight definitions
- `font-config.json` — Web font fallback stacks

**Rust backend** (`src-tauri/src/lib.rs`):
- Tauri commands: `read_markdown_file`, `save_markdown_file`, `write_markdown_file`, `write_export_file`, `open_workspace`, `reveal_path`, `read_image_base64`, `copy_image_to_clipboard`
- File watcher: background thread polls mtime every 1s, emits `file-changed` events
- Window sizing: scales to primary monitor work area (82% width, 86% height, clamped to 1100–1600 × 760–1040)
- CLI args and `open-with` file association via `Info.plist`

**Tab model** (in `main.js`):
Each tab object: `{ id, path, content, savedContent, lineEnding, dirty, saving, isDraft, draftName, externalContent, scrollY, editorScrollY, themeId }`. `dirty` is `content !== savedContent`. External file changes detected via watcher trigger a reload-or-conflict flow.

**View modes**: `preview` (read-only rendered), `edit` (raw textarea with line numbers), `split` (side-by-side). Persisted to `localStorage`.

**Workspace mode**: Drop a folder → Rust scans for `.md` files → `WorkspacePayload` emitted → sidebar file tree rendered. Loose files (opened outside workspace root) tracked separately.

## Key Design Decisions

- WebView over native rendering: SwiftUI markdown is too limited; WKWebView + JS gives full table, code, math, and copy-to-Word fidelity.
- All JS/CSS bundled via Vite — fully offline, no CDN.
- `titleBarStyle: "Overlay"` with `hiddenTitle: true` for macOS traffic-light look; toolbar area is draggable.
- Theme CSS is generated dynamically from JSON definitions at runtime (not static CSS files), allowing per-tab theme switching without page reload.
- Typography overrides (font sizes in pt) are stored per-theme-id in `localStorage` and injected as a `<style>` tag so they compose with theme CSS without conflicts.
- `?demo=screenshot` URL param activates a static demo mode used by `scripts/generate-screenshots.mjs` (Playwright) — no Tauri runtime needed.
