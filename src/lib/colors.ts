// Per-day pin colours, tuned to read on the dark and light basemaps and on satellite.

const hsl = (h: number, s: number, l: number) => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
};

/**
 * Default colours, in day order: 12 hand-picked hues ordered so neighbouring days contrast
 * strongly; past day 12 hues step by the golden angle with a lightness shift, so later days
 * still differ from each other and from the first lap.
 */
const BASE = [
  "#5fd68b", "#f2a65a", "#6aa8ff", "#f06b8b", "#e8d25a", "#b07cff",
  "#3fc9c0", "#ff7a45", "#a3d94f", "#e070c8", "#7fdcff", "#c9a27a",
];
export const defaultDayColor = (i: number) => BASE[i] ?? hsl((200 + i * 137.508) % 360, 70, i % 2 ? 74 : 56);

/** A day's colour: the one picked for it, else the default for its position. */
export const dayColor = (i: number, date: string, overrides?: Record<string, string>) => overrides?.[date] ?? defaultDayColor(i);

/** Swatches offered in the day colour picker. */
export const DAY_SWATCHES = [
  "#5fd68b", "#8fd14f", "#e8d25a", "#f2a65a", "#ff8a5c", "#f06b8b",
  "#e070c8", "#c58cff", "#8f8cff", "#6aa8ff", "#3fb5e0", "#46c7c7",
];

/** Kept for older imports: the first few defaults. */
export const SECTION_COLORS = Array.from({ length: 12 }, (_, i) => defaultDayColor(i));
export const LIST_COLOR = "#9aa59f";

const lum = (hex: string) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const DARK_INK = "#0e1110";

/**
 * Text colour for a label on `bg` (pin numbers, filled day dots): the usual near-black, unless it
 * falls short of WCAG's 4.5:1 and white reads better (deep greens, blues, purples).
 */
export function inkOn(bg: string) {
  const l = lum(bg);
  if (l == null) return DARK_INK;
  const dark = ratio(l, lum(DARK_INK)!);
  return dark >= 4.5 || dark >= ratio(l, 1) ? DARK_INK : "#ffffff";
}
