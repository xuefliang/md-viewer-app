const TRANSLATION_CONFIG_KEY = "md-viewer-translation-config";

const DEFAULT_CONFIG = {
  apiKey: "",
  apiEndpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o-mini",
  sourceLang: "auto",
  targetLang: "zh-CN",
};

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

export function getTranslationConfig() {
  try {
    const raw = localStorage.getItem(TRANSLATION_CONFIG_KEY);
    if (raw) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG };
}

export function saveTranslationConfig(config) {
  try {
    localStorage.setItem(TRANSLATION_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

export function isTranslationConfigured() {
  const cfg = getTranslationConfig();
  return Boolean(cfg.apiKey && cfg.apiEndpoint);
}

export function getLanguageName(langId, locale) {
  const lang = LANGUAGES.find((l) => l.id === langId);
  if (!lang) return langId;
  if (locale && locale.startsWith("en")) return lang.label_en;
  return lang.label;
}

function getLanguageDesc(langId) {
  return getLanguageName(langId, "zh");
}

function buildSystemPrompt(sourceLang, targetLang) {
  const sourceDesc = sourceLang === "auto" ? "the detected language" : getLanguageDesc(sourceLang);
  const targetDesc = getLanguageDesc(targetLang);
  return `You are a professional translator. Translate the following markdown text from ${sourceDesc} to ${targetDesc}. Rules:
1. Preserve ALL markdown formatting exactly (headings, bold, italic, code blocks, links, lists, tables).
2. Do NOT translate code inside code blocks.
3. Do NOT translate URLs or file paths.
4. Do NOT add any explanations or commentary — only return the translated text.
5. Keep the same paragraph structure.`;
}

function splitMarkdownIntoChunks(markdown, maxLen = 3000) {
  if (markdown.length <= maxLen) return [markdown];

  const chunks = [];
  let remaining = markdown;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    let splitIdx = -1;

    // Try to split on ## heading
    const headingMatch = remaining.lastIndexOf("\n## ", maxLen);
    if (headingMatch > maxLen * 0.3) {
      splitIdx = headingMatch;
    }

    // Try double newline
    if (splitIdx === -1) {
      const dblNewline = remaining.lastIndexOf("\n\n", maxLen);
      if (dblNewline > maxLen * 0.3) {
        splitIdx = dblNewline;
      }
    }

    // Fallback: single newline
    if (splitIdx === -1) {
      const singleNewline = remaining.lastIndexOf("\n", maxLen);
      if (singleNewline > maxLen * 0.3) {
        splitIdx = singleNewline;
      }
    }

    // Last resort: hard split
    if (splitIdx === -1) {
      splitIdx = maxLen;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n+/, "");
  }

  return chunks;
}

async function streamTranslateChunk(chunk, config, signal) {
  const { apiKey, apiEndpoint, model, sourceLang, targetLang } = config;
  const systemPrompt = buildSystemPrompt(sourceLang, targetLang);

  const resp = await fetch(apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: chunk },
      ],
      stream: true,
      temperature: 0.3,
    }),
    signal,
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`API error ${resp.status}: ${err}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) text += delta;
      } catch {
        // skip malformed lines
      }
    }
  }

  return text;
}

export async function testTranslationConnection(config) {
  const { apiKey, apiEndpoint, model } = config;

  const resp = await fetch(apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Say 'OK' in one word." }],
      max_tokens: 10,
      stream: false,
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return content.trim().length > 0;
}

export async function translateMarkdown(markdown, config, onProgress, signal) {
  if (!markdown || !markdown.trim()) return markdown;

  const chunks = splitMarkdownIntoChunks(markdown);
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const translated = await streamTranslateChunk(chunks[i], config, signal);
    results.push(translated);
    if (onProgress) {
      onProgress({ chunk: i + 1, total: chunks.length, text: translated });
    }
  }

  return results.join("\n\n");
}
