// Shared pixel-comparison helpers used by the visual-regression scripts that
// analyze rendered PNG buffers (self-shadow gates, background gate, local
// self-shadow pair renderer). Kept precision-agnostic where callers already
// rounded to different decimal counts -- pass `decimals` to `round` rather
// than changing the default, so existing numeric output is unaffected.

export function luminance(r, g, b) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))] ?? 0;
}

export function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
