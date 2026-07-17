# Split View Unified Scroll Design

**Date**: 2026-07-17

## Problem

In split view mode (editor left + preview right), each panel has its own scrollbar. Users must scroll both independently when comparing source and rendered output, which is inconvenient.

## Goal

Replace the two independent scrollbars with a single scrollbar that scrolls both panels together.

## Approach

**Selected**: Auto-expanding textarea + single parent scroll container

The editor textarea loses its native scrollbar and auto-expands to its content height. The preview panel also removes its scrollbar and expands naturally. Both panels sit inside `#reader-content`, which becomes the single scroll container.

## CSS Changes

### `#reader-content.reader-mode-split`
- `overflow`: `auto` (was `hidden`)
- This makes it the single scroll container for split mode

### `#document-workspace.mode-split`
- `height`: `auto` (was `100%`)
- `min-height`: `100%` (keeps it at least viewport height)
- Grid grows to content height, enabling parent scroll

### `#editor-shell` (in split mode)
- `height`: `auto` (was `100%`)
- `min-height`: `100%`

### `#markdown-content` (in split mode)
- `overflow`: `hidden` (was `auto`)
- `height`: `auto` (was `100%`)
- `min-height`: `100%`

### `#markdown-editor` (in split mode)
- `overflow`: `hidden` (was `auto`)
- Height set dynamically via JS auto-expand

### Mobile responsive rules
- Update `.mode-split` grid-template-rows to use `auto` instead of `0.44fr` / `0.56fr`

## JavaScript Changes

### Textarea auto-expand
New function `autoResizeTextarea()`:
- Sets `editor.style.height = "auto"; editor.style.height = editor.scrollHeight + "px"`
- Called on every `input` event and when entering split mode
- When leaving split mode, resets `editor.style.height = ""` and restores `overflow: auto`

### Scroll tracking
- `getReaderScrollY()`: in split mode, returns `readerContentEl().scrollTop` (was `contentEl().scrollTop`)
- `setReaderScrollY()`: in split mode, sets `readerContentEl().scrollTop`
- `getActiveTopScrollY()`: in split mode, returns `readerContentEl().scrollTop`

### Line number sync
- `syncLineNumberScroll()`: becomes no-op in split mode — line numbers are in the same scroll context

### Find highlight scroll
- `syncEditorFindHighlightScroll()`: becomes no-op in split mode

### View mode switching
- `setViewMode()`: when switching to split mode, auto-resize textarea; when leaving, reset

## CI Setup

Add `.github/workflows/ci.yml`:
- Trigger: push / pull_request on main
- Steps: checkout, setup Rust, setup pnpm, install deps, build Tauri app
- Caches: Rust cargo, pnpm store

## Files Changed

| File | Change |
|------|--------|
| `src/styles.css` | ~10 CSS rule modifications |
| `src/main.js` | ~40 lines added/modified |
| `.github/workflows/ci.yml` | New file |

## Risks

1. Textarea auto-height may cause brief layout glitch during typing — mitigated by `requestAnimationFrame`
2. Line number sync might drift in edge cases — verified by testing wrapped line rendering
