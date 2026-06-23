import katex from "katex";

const MATH_INLINE_RE = /\$([^\$\n]+?)\$/g;
const MATH_BLOCK_RE = /\$\$([\s\S]*?)\$\$/g;

function isInsideTag(html, pos) {
  const before = html.slice(0, pos);
  return before.lastIndexOf("<") > before.lastIndexOf(">");
}

function renderInline(formula) {
  try {
    return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false });
  } catch {
    return `<span class="math-error" title="KaTeX render error">${escapeHTML(formula)}</span>`;
  }
}

function renderBlock(formula) {
  try {
    return katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false });
  } catch {
    return `<div class="math-error" title="KaTeX render error">${escapeHTML(formula)}</div>`;
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

export function applyMathToHTML(html) {
  let result = html.replace(MATH_BLOCK_RE, (full) => {
    const idx = html.indexOf(full);
    if (idx === -1 || isInsideTag(html, idx)) return full;
    const formula = full.slice(2, -2);
    return renderBlock(formula);
  });
  result = result.replace(MATH_INLINE_RE, (full) => {
    const idx = result.indexOf(full);
    if (idx === -1 || isInsideTag(result, idx)) return full;
    const formula = full.slice(1, -1);
    return renderInline(formula);
  });
  return result;
}
