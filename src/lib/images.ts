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

// Wikimedia thumbnail URLs embed the width ("/640px-File.jpg"); swap it for other sizes
const resize = (u: string, w: number) => u.replace(/\/(\d+)px-([^/]+)$/, `/${w}px-$2`);
const strip = (html?: string) => html?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

interface WikiPage {
  title: string;
  fullurl?: string;
  thumbnail?: { source: string };
  index?: number;
}

async function wikiQuery(params: Record<string, string>, signal?: AbortSignal): Promise<WikiPage[]> {
  const q = new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", prop: "pageimages|info", piprop: "thumbnail", pithumbsize: "640", inprop: "url", ...params });
  const res = await fetch(`${WIKI}?${q}`, { signal });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const j = (await res.json()) as { query?: { pages?: WikiPage[] } };
  // Lead images of country/region articles are often flags, maps or coats of arms; skip those
  const symbolic = /flag|map|locator|location|coat[_ ]of[_ ]arms|emblem|seal|logo|\.svg\//i;
  return (j.query?.pages ?? []).filter((p) => p.thumbnail && !symbolic.test(p.thumbnail.source)).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

const fromWiki = (p: WikiPage): PlaceImage => ({
  url: resize(p.thumbnail!.source, 1280),
  thumb: resize(p.thumbnail!.source, 320),
  source: "wikipedia",
  credit: `Wikipedia: ${p.title}`,
  link: p.fullurl,
  title: p.title,
});

/** Wikipedia articles near the place, best name match first; then a plain title search. */
async function wikipedia(name: string, coords?: [number, number], signal?: AbortSignal): Promise<{ img: PlaceImage; score: number }[]> {
  const out: { img: PlaceImage; score: number }[] = [];
  if (coords) {
    const near = await wikiQuery({ generator: "geosearch", ggscoord: `${coords[1]}|${coords[0]}`, ggsradius: "2000", ggslimit: "20" }, signal).catch(() => []);
    for (const p of near) out.push({ img: fromWiki(p), score: similarity(name, p.title) + 0.1 });
  }
  const found = await wikiQuery({ generator: "search", gsrsearch: name, gsrlimit: "6" }, signal).catch(() => []);
  for (const p of found) if (!out.some((o) => o.img.title === p.title)) out.push({ img: fromWiki(p), score: similarity(name, p.title) });
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
    iiurlwidth: "640",
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
          thumb: resize(ii.thumburl, 320),
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

/** A confident automatic pick (Wikipedia article at/near the place with a matching name), or null. */
export async function bestImage(name: string, coords?: [number, number], signal?: AbortSignal): Promise<PlaceImage | null> {
  const wiki = await wikipedia(name, coords, signal).catch(() => []);
  const top = wiki[0];
  return top && top.score >= 0.75 ? top.img : null;
}

/** Cover photo suggestion for a destination: a Wikipedia lead image, else a Commons landscape. */
export async function coverFor(destination: string, signal?: AbortSignal): Promise<PlaceImage | null> {
  const wiki = await bestImage(destination, undefined, signal);
  if (wiki) return wiki;
  const com = await commons(`${destination} landscape`, signal).catch(() => []);
  return com[0] ?? null;
}
