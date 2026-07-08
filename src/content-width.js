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
