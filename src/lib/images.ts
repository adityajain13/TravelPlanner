/*
 * Photos for places, from free sources with clear licensing:
 *   Wikipedia (by location + name, then by title) → Wikimedia Commons → Openverse (CC images web-wide)
 * Only the image URL + credit is stored on the item. Images are hotlinked (all three permit it)
 * and cached by the service worker so they show offline.
 */

export interface PlaceImage {
  url: string; // large, for headers / viewers
  thumb: string; // ~320px, for cards and pins
  source: "wikipedia" | "commons" | "openverse" | "link";
  credit?: string; // "Photo: Jane Doe, CC BY-SA 4.0"
  link?: string; // page the image came from
  title?: string;
}

const WIKI = "https://en.wikipedia.org/w/api.php";
const COMMONS = "https://commons.wikimedia.org/w/api.php";

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** 0..1: how well a found title matches the place name (token overlap, containment boosts). */
export function similarity(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const ta = new Set(x.split(" ").filter((t) => t.length > 2));
  const tb = new Set(y.split(" ").filter((t) => t.length > 2));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / Math.max(1, Math.min(ta.size, tb.size));
}

// Wikimedia thumbnail URLs embed the width ("/500px-File.jpg"). Wikimedia only serves a fixed set of
// "standard" widths reliably, so cards use the exact URL the API returned (500px) and the large
// version asks for 1280 with the API URL as a fallback (see Photo.tsx).
const THUMB_W = "500";
const resize = (u: string, w: number) => u.replace(/\/(\d+)px-([^/]+)$/, `/${w}px-$2`);
const strip = (html?: string) => html?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

interface WikiPage {
  title: string;
  fullurl?: string;
  thumbnail?: { source: string };
  index?: number;
}

async function wikiQuery(params: Record<string, string>, signal?: AbortSignal): Promise<WikiPage[]> {
  const q = new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", prop: "pageimages|info", piprop: "thumbnail", pithumbsize: THUMB_W, inprop: "url", ...params });
  const res = await fetch(`${WIKI}?${q}`, { signal });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const j = (await res.json()) as { query?: { pages?: WikiPage[] } };
  // Lead images of country/region articles are often flags, maps or coats of arms; skip those
  const symbolic = /flag|map|locator|location|coat[_ ]of[_ ]arms|emblem|seal|logo|\.svg\//i;
  return (j.query?.pages ?? []).filter((p) => p.thumbnail && !symbolic.test(p.thumbnail.source)).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

const fromWiki = (p: WikiPage): PlaceImage => ({
  url: resize(p.thumbnail!.source, 1280),
  thumb: p.thumbnail!.source,
  source: "wikipedia",
  credit: `Wikipedia: ${p.title}`,
  link: p.fullurl,
  title: p.title,
});

/** Wikipedia articles near the place, best name match first; then a plain title search. */
async function wikipedia(name: string, coords?: [number, number], signal?: AbortSignal): Promise<{ img: PlaceImage; score: number; near: boolean }[]> {
  const out: { img: PlaceImage; score: number; near: boolean }[] = [];
  if (coords) {
    const near = await wikiQuery({ generator: "geosearch", ggscoord: `${coords[1]}|${coords[0]}`, ggsradius: "2000", ggslimit: "20" }, signal).catch(() => []);
    for (const p of near) out.push({ img: fromWiki(p), score: similarity(name, p.title) + 0.1, near: true });
  }
  const found = await wikiQuery({ generator: "search", gsrsearch: name, gsrlimit: "6" }, signal).catch(() => []);
  for (const p of found) if (!out.some((o) => o.img.title === p.title)) out.push({ img: fromWiki(p), score: similarity(name, p.title), near: false });
  return out.sort((a, b) => b.score - a.score);
}

async function commons(query: string, signal?: AbortSignal): Promise<PlaceImage[]> {
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: THUMB_W,
  });
  const res = await fetch(`${COMMONS}?${q}`, { signal });
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  type Info = { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> };
  const j = (await res.json()) as { query?: { pages?: { title: string; index?: number; imageinfo?: Info[] }[] } };
  return (j.query?.pages ?? [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl) return [];
      const artist = strip(ii.extmetadata?.Artist?.value);
      const license = ii.extmetadata?.LicenseShortName?.value;
      return [
        {
          url: resize(ii.thumburl, 1280),
          thumb: ii.thumburl,
          source: "commons" as const,
          credit: [artist && `Photo: ${artist}`, license].filter(Boolean).join(", ") || "Wikimedia Commons",
          link: ii.descriptionurl,
          title: p.title.replace(/^File:/, "").replace(/\.\w+$/, ""),
        },
      ];
    });
}

async function openverse(query: string, signal?: AbortSignal): Promise<PlaceImage[]> {
  const q = new URLSearchParams({ q: query, page_size: "12", mature: "false" });
  const res = await fetch(`https://api.openverse.org/v1/images/?${q}`, { signal });
  if (!res.ok) throw new Error(`Openverse ${res.status}`);
  type R = { url: string; thumbnail?: string; title?: string; creator?: string; license?: string; license_version?: string; foreign_landing_url?: string };
  const j = (await res.json()) as { results?: R[] };
  return (j.results ?? []).map((r) => ({
    url: r.url,
    thumb: r.thumbnail ?? r.url,
    source: "openverse" as const,
    credit: [r.creator && `Photo: ${r.creator}`, r.license && `CC ${r.license.toUpperCase()}${r.license_version ? ` ${r.license_version}` : ""}`].filter(Boolean).join(", "),
    link: r.foreign_landing_url,
    title: r.title,
  }));
}

/** Everything the picker shows, best guesses first. Each source fails independently. */
export async function searchImages(query: string, opts: { name?: string; coords?: [number, number]; signal?: AbortSignal } = {}): Promise<PlaceImage[]> {
  const [wiki, com, ov] = await Promise.all([
    wikipedia(opts.name ?? query, opts.coords, opts.signal).catch(() => []),
    commons(query, opts.signal).catch(() => []),
    openverse(query, opts.signal).catch(() => []),
  ]);
  const seen = new Set<string>();
  return [...wiki.filter((w) => w.score >= 0.3).map((w) => w.img), ...com, ...ov, ...wiki.filter((w) => w.score < 0.3).map((w) => w.img)].filter(
    (i) => (seen.has(i.thumb) ? false : (seen.add(i.thumb), true)),
  );
}

/** A confident automatic pick, or null:
 *  - a Wikipedia article near the pin whose title matches the name, or
 *  - a title-search hit whose title is essentially the name ("Iceland (supermarket)" ≠ "Iceland"). */
export async function bestImage(name: string, coords?: [number, number], signal?: AbortSignal): Promise<PlaceImage | null> {
  const wiki = await wikipedia(name, coords, signal).catch(() => []);
  const hit = wiki.find((w) => (w.near ? w.score >= 0.75 : norm(w.img.title ?? "") === norm(name)));
  return hit?.img ?? null;
}

/** Cover photo suggestion: a landscape photo of the destination from Commons (article lead images
 *  for places are often flags, maps, or, as with "Iceland", a namesake supermarket). */
export async function coverFor(destination: string, signal?: AbortSignal): Promise<PlaceImage | null> {
  for (const q of [`${destination} landscape`, `${destination} panorama`, destination]) {
    const com = await commons(q, signal).catch(() => []);
    const pick = com.find((c) => !/logo|map|flag|store|shop|supermarket|sign|diagram|chart/i.test(c.title ?? ""));
    if (pick) return pick;
  }
  return null;
}
