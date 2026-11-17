// PROTOTYPE (proto/trip-focus): what Google Places would give for the seeded test places, so the idea card can be
// judged with the same information locally (no Google or Unsplash keys here). Matched by name; real data wins.
import type { Item } from "./trips";

type Demo = { rating?: number; ratingCount?: number; cost?: string; summary?: string; photo?: boolean; /** "10–18" per weekday, Sunday = 0; missing = closed */ hours?: (string | null)[] };
const daily = (h: string, closed: number[] = []) => [0, 1, 2, 3, 4, 5, 6].map((d) => (closed.includes(d) ? null : h));

const DEMO: Record<string, Demo> = {
  "ghibli museum": { rating: 4.4, ratingCount: 12000, cost: "¥1,000 pp", summary: "Museum of Studio Ghibli's animation, with a short film you can only see here", photo: true, hours: daily("10–18", [2]) },
  "hakone yuryo": { rating: 4.3, ratingCount: 3100, cost: "¥1,500 pp", summary: "Day-use hot spring with outdoor baths over the river, plus private family baths", photo: true, hours: daily("10–20") },
  "teamlab planets": { rating: 4.6, ratingCount: 21000, cost: "¥3,800 pp", summary: "Walk-through digital art, barefoot, partly in knee-deep water", photo: true, hours: daily("9–22") },
  "tokyo skytree": { rating: 4.5, ratingCount: 68000, cost: "¥2,100 pp", summary: "Japan's tallest tower, with two observation decks over the city", photo: true, hours: daily("10–21") },
  "nara park": { rating: 4.7, ratingCount: 45000, summary: "Open parkland with a thousand free-roaming deer and Todai-ji at its edge", photo: true },
  "tsukiji outer market": { rating: 4.3, ratingCount: 39000, summary: "Street-food stalls and knife shops around the old fish market", photo: true, hours: daily("6–14", [0, 3]) },
  "shibuya sky": { rating: 4.6, ratingCount: 17000, cost: "¥2,500 pp", summary: "Open-air rooftop deck above the Shibuya crossing", photo: true, hours: daily("10–22:30") },
  "nijo castle": { rating: 4.4, ratingCount: 30000, cost: "¥1,300 pp", summary: "Shogun's castle with 'nightingale floors' that squeak to warn of intruders", photo: true, hours: daily("8:45–16", [2]) },
};
const demo = (it: Item): Demo => (import.meta.env.DEV ? (DEMO[it.name.trim().toLowerCase()] ?? {}) : {});

/** "Monday: 10:00 AM – 6:00 PM" → "10–18"; "Closed" → null */
function fromGoogle(line: string | undefined): string | null | undefined {
  if (!line) return undefined;
  if (/closed/i.test(line)) return null;
  const m = [...line.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi)];
  if (m.length < 2) return undefined;
  const t = (x: RegExpMatchArray) => {
    let h = +x[1] % 12;
    if (x[3].toUpperCase() === "PM") h += 12;
    return x[2] && x[2] !== "00" ? `${h}:${x[2]}` : `${h}`;
  };
  return `${t(m[0])}–${t(m[1])}`;
}
const GOOGLE_DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Rating, cost, a one-line summary, a photo and the hours on a weekday: real data first, demo data for test places */
export function placeDetails(it: Item) {
  const d = demo(it);
  const g = it.google;
  return {
    rating: g?.rating ?? d.rating,
    ratingCount: g?.ratingCount ?? d.ratingCount,
    cost: it.cost ? `${it.costCurrency ?? ""} ${it.cost.toLocaleString()}`.trim() : d.cost,
    summary: (g as { editorialSummary?: string } | undefined)?.editorialSummary ?? d.summary,
    photo: it.image?.thumb,
    demoPhoto: !it.image?.thumb && !!d.photo,
    /** "10–18", null when closed, undefined when unknown */
    hoursOn: (weekday: number): string | null | undefined => {
      const line = g?.hours?.find((h) => h.startsWith(GOOGLE_DAY[weekday]));
      const real = fromGoogle(line);
      if (real !== undefined) return real;
      return d.hours ? d.hours[weekday] : undefined;
    },
  };
}
