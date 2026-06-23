import katex from "katex";

function renderInlineMath(formula) {
  try {
    return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false });
  } catch {
    return `<span class="math-error">${escapeHTML(formula)}</span>`;
  }
}

function renderBlockMath(formula) {
  try {
    return `<div class="math-block">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>`;
  } catch {
    return `<div class="math-error">${escapeHTML(formula)}</div>`;
  }
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function mathPlugin(md) {
  // Block rule: $$...$$  (single-line or multi-line)
  md.block.ruler.before("fence", "math_block", (state, startLine, endLine, silent) => {
    const lineStart = state.bMarks[startLine] + state.tShift[startLine];
    const lineEnd = state.eMarks[startLine];

    if (lineStart + 2 > lineEnd) return false;
    if (state.src.slice(lineStart, lineStart + 2) !== "$$") return false;

    const firstLineRest = state.src.slice(lineStart + 2, lineEnd).trim();

    // Single-line: $$content$$
    if (firstLineRest.endsWith("$$")) {
      if (!silent) {
        const token = state.push("math_block", "math", 0);
        token.content = firstLineRest.slice(0, -2).trim();
        token.map = [startLine, startLine + 1];
        token.markup = "$$";
      }
      state.line = startLine + 1;
      return true;
    }

    // Multi-line: search for closing $$ on its own line
    let nextLine = startLine + 1;
    while (nextLine < endLine) {
      const pos = state.bMarks[nextLine] + state.tShift[nextLine];
      const end = state.eMarks[nextLine];
      if (state.src.slice(pos, end).trim() === "$$") {
        if (!silent) {
          // Collect content between opening and closing $$
          const contentStart = state.bMarks[startLine] + state.tShift[startLine] + 2;
          const contentEnd = state.bMarks[nextLine];
          const token = state.push("math_block", "math", 0);
          token.content = state.src.slice(contentStart, contentEnd).trim();
          token.map = [startLine, nextLine + 1];
          token.markup = "$$";
        }
        state.line = nextLine + 1;
        return true;
      }
      nextLine++;
    }

    return false;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });

  // Inline rule: $...$
  md.inline.ruler.before("escape", "math_inline", (state, silent) => {
    const pos = state.pos;
    const max = state.posMax;

    if (state.src.charAt(pos) !== "$") return false;
    // Skip $$  — handled by block rule
    if (state.src.charAt(pos + 1) === "$") return false;

    let end = -1;
    for (let i = pos + 1; i <= max; i++) {
      const ch = state.src.charAt(i);
      if (ch === "\n") break;
      if (ch === "$") {
        end = i;
        break;
      }
    }

    if (end === -1 || end === pos + 1) return false;

    const content = state.src.slice(pos + 1, end);
    if (!content.trim()) return false;

    if (!silent) {
      const token = state.push("math_inline", "", 0);
      token.markup = "$";
      token.content = content;
    }

    state.pos = end + 1;
    return true;
  });

  md.renderer.rules.math_inline = (tokens, idx) => renderInlineMath(tokens[idx].content);
  md.renderer.rules.math_block = (tokens, idx) => renderBlockMath(tokens[idx].content);
}
