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
