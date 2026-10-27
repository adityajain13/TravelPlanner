/*
 * Photos for places, from free sources with clear licensing:
 *   Unsplash (via our Worker, travel-quality) → Wikipedia (the place's own article) →
 *   Wikimedia Commons / Openverse (filtered to large landscape photos)
 * Only the image URL + credit is stored on the item. Images are hotlinked (all three permit it)
 * and cached by the service worker so they show offline.
 */

export interface PlaceImage {
  url: string; // large, for headers / viewers
  thumb: string; // ~320px, for cards and pins
  source: "unsplash" | "wikipedia" | "commons" | "openverse" | "google" | "web" | "link";
  credit?: string; // "Photo: Jane Doe, CC BY-SA 4.0"
  link?: string; // page the image came from
  title?: string;
  author?: string; // photographer's page (Unsplash attribution)
  authorName?: string;
  track?: string; // Unsplash download_location, pinged when picked; not stored
  /** Chosen by hand in the photo picker (automatic clean-ups leave it alone). */
  manual?: boolean;
}

import { shareQuery } from "./shareToken";

/** Unsplash results through the Worker, or [] when it isn't configured / offline / over quota. */
async function unsplash(query: string, signal?: AbortSignal): Promise<PlaceImage[]> {
  const q = new URLSearchParams({ q: query, ...shareQuery() });
  const res = await fetch(`/travelplanner/api/photos?${q}`, { signal, credentials: "same-origin" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    unsplashIssue =
      res.status === 501
        ? "Unsplash isn't set up: add the UNSPLASH_ACCESS_KEY secret to the travelplanner Worker."
        : res.status === 401
          ? "Unsplash needs you to be signed in (or opened from a share link)."
          : res.status === 429
            ? "Unsplash's hourly limit is used up; showing other sources."
            : `Unsplash unavailable (${body.error ?? res.status}).`;
    return [];
  }
  unsplashIssue = null;
  return ((await res.json()) as { photos?: PlaceImage[] }).photos ?? [];
}
/** Why the last search had no Unsplash results, for the picker to show. */
export let unsplashIssue: string | null = null;

/** Unsplash asks apps to report when a photo is actually used. */
export function trackPick(img: PlaceImage) {
  if (img.source !== "unsplash" || !img.track) return;
  fetch(`/travelplanner/api/photos/track?${new URLSearchParams(shareQuery())}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ download: img.track }),
  }).catch(() => undefined);
}

/** What gets saved on an item / cover (drop the tracking URL). */
export const forStorage = ({ track: _t, ...img }: PlaceImage): PlaceImage => img;

// Charts, maps, diagrams, logos, signage... nobody's travel photo
const NOT_A_PHOTO = /\b(map|maps|locator|location|flag|coat of arms|emblem|seal|logo|diagram|chart|graph|pyramid|population|census|plot|satellite|nasa|iss0|modis|earth|globe|svg|plan|scheme|stamp|coin|banknote|poster|document|book|page|scan|signpost|sign|supermarket|store|shop|screenshot|icon)\b/i;
const goodShape = (w?: number, h?: number) => !!w && !!h && w >= 1400 && w / h >= 1.2 && w / h <= 2.6;

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

const GENERIC = new Set(["the", "of", "and", "temple", "shrine", "museum", "park", "station", "castle", "garden", "gardens", "tower", "bridge", "market", "street", "store", "shop", "restaurant", "cafe", "hotel", "branch", "main", "jinja", "dera", "ji", "falls", "waterfall", "sign", "lake", "mount", "mt", "beach", "square", "hall", "building"]);
const words = (s: string) => norm(s).split(" ").filter((t) => t.length > 1 && !GENERIC.has(t));

/**
 * The article is about *this* place, not something it's named after or sits in: most of the
 * place's distinctive words are in the title and vice versa. "Uncle Rikuro's Cheesecake Daimaru
 * Shinsaibashi" ≠ "Shinsaibashi"; "Kiyomizu-dera Temple" = "Kiyomizu-dera" (generic words like temple/falls are ignored).
 */
export function sameSubject(name: string, title: string) {
  const a = words(name);
  const b = words(title); // a disambiguator counts: "Iceland (supermarket)" ≠ "Iceland"
  if (!a.length || !b.length) return norm(name) === norm(title);
  const inB = a.filter((t) => b.includes(t)).length / a.length;
  const inA = b.filter((t) => a.includes(t)).length / b.length;
  return inB >= 0.67 && inA >= 0.67;
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
    iiprop: "url|extmetadata|size",
    iiurlwidth: THUMB_W,
  });
  const res = await fetch(`${COMMONS}?${q}`, { signal });
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  type Info = { thumburl?: string; descriptionurl?: string; width?: number; height?: number; extmetadata?: Record<string, { value?: string }> };
  const j = (await res.json()) as { query?: { pages?: { title: string; index?: number; imageinfo?: Info[] }[] } };
  return (j.query?.pages ?? [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl || !goodShape(ii.width, ii.height) || NOT_A_PHOTO.test(p.title)) return [];
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
  type R = { url: string; thumbnail?: string; title?: string; creator?: string; license?: string; license_version?: string; foreign_landing_url?: string; width?: number; height?: number };
  const j = (await res.json()) as { results?: R[] };
  return (j.results ?? []).filter((r) => goodShape(r.width, r.height) && !NOT_A_PHOTO.test(r.title ?? "")).map((r) => ({
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
  const [un, wiki, com, ov] = await Promise.all([
    unsplash(query, opts.signal).catch(() => []),
    wikipedia(opts.name ?? query, opts.coords, opts.signal).catch(() => []),
    commons(query, opts.signal).catch(() => []),
    openverse(query, opts.signal).catch(() => []),
  ]);
  // Only the place's own article (nearby + matching, or exact title); loose matches were the junk
  const own = wiki.filter((w) => (w.near ? w.score >= 0.75 && sameSubject(opts.name ?? query, w.img.title ?? "") : norm(w.img.title ?? "") === norm(opts.name ?? query))).map((w) => w.img);
  const seen = new Set<string>();
  return [...own.slice(0, 2), ...un, ...com, ...ov].filter((i) => (seen.has(i.thumb) ? false : (seen.add(i.thumb), true)));
}

/** A confident automatic pick, or null:
 *  - a Wikipedia article near the pin whose title matches the name, or
 *  - a title-search hit whose title is essentially the name ("Iceland (supermarket)" ≠ "Iceland"). */
export async function bestImage(name: string, coords?: [number, number], signal?: AbortSignal): Promise<PlaceImage | null> {
  const wiki = await wikipedia(name, coords, signal).catch(() => []);
  const hit = wiki.find((w) => (w.near ? w.score >= 0.75 && sameSubject(name, w.img.title ?? "") : norm(w.img.title ?? "") === norm(name)));
  return hit?.img ?? null;
}

/** Cover photo suggestion: a landscape photo of the destination from Commons (article lead images
 *  for places are often flags, maps, or, as with "Iceland", a namesake supermarket). */
export async function coverFor(destination: string, signal?: AbortSignal): Promise<PlaceImage | null> {
  const un = await unsplash(destination, signal).catch(() => []);
  if (un[0]) return (trackPick(un[0]), forStorage(un[0]));
  for (const q of [`${destination} landscape`, `${destination} panorama`, destination]) {
    const com = await commons(q, signal).catch(() => []);
    const pick = com.find((c) => !/logo|map|flag|store|shop|supermarket|sign|diagram|chart/i.test(c.title ?? ""));
    if (pick) return pick;
  }
  return null;
}


/** A few sentences about the place from its own Wikipedia article (live, cached for the session). */
const summaries = new Map<string, Promise<{ text: string; url?: string; title: string } | null>>();
export function placeSummary(name: string, coords?: [number, number]) {
  const key = `${name}|${coords?.join(",") ?? ""}`;
  if (!summaries.has(key)) {
    summaries.set(
      key,
      (async () => {
        const wiki = await wikipedia(name, coords).catch(() => []);
        const hit = wiki.find((w) => (w.near ? w.score >= 0.75 && sameSubject(name, w.img.title ?? "") : norm(w.img.title ?? "") === norm(name)));
        const title = hit?.img.title;
        if (!title) return null;
        const q = new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", prop: "extracts|info", exintro: "1", explaintext: "1", exsentences: "4", inprop: "url", titles: title, redirects: "1" });
        const res = await fetch(`${WIKI}?${q}`);
        if (!res.ok) return null;
        const page = ((await res.json()) as { query?: { pages?: { extract?: string; fullurl?: string; title: string }[] } }).query?.pages?.[0];
        const text = page?.extract?.replace(/\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/, "").trim(); // drop the "(Icelandic: …; pronounced …)" aside
        return text ? { text, url: page!.fullurl, title: page!.title } : null;
      })().catch(() => {
        summaries.delete(key);
        return null;
      }),
    );
  }
  return summaries.get(key)!;
}

/**
 * A photo for a place that was just added: its own Wikipedia article's image when there's a
 * confident match, else the top Unsplash result for "<name> <destination>". Null when nothing fits.
 */
export async function firstPhoto(name: string, coords?: [number, number], context?: string): Promise<PlaceImage | null> {
  const wiki = await bestImage(name, coords).catch(() => null);
  if (wiki) return wiki;
  const un = await unsplash([name, context].filter(Boolean).join(" ")).catch(() => []);
  if (!un[0]) return null;
  trackPick(un[0]);
  return forStorage(un[0]);
}

/**
 * Google Maps photos of a place (or of whatever a search names, e.g. "Osaka"): the place's own
 * Google ID when known, else the best text match near the pin. [] without a Google key.
 */
export async function googlePhotos(q: { placeId?: string; name: string; address?: string; coords?: [number, number] }): Promise<PlaceImage[]> {
  const { GOOGLE_KEY, findPlaceId, getDetails, photoUrl } = await import("./google");
  if (!GOOGLE_KEY || !navigator.onLine) return [];
  const id = q.placeId ?? (await findPlaceId({ name: q.name, address: q.address, lat: q.coords?.[1], lng: q.coords?.[0] }));
  if (!id) return [];
  const d = await getDetails(id);
  return d.photos.slice(0, 10).map((ph) => ({
    url: photoUrl(ph.name, 1600),
    thumb: photoUrl(ph.name, 600),
    source: "google" as const,
    credit: ph.attributions.map((a) => a.displayName).join(", ") || "Google",
    link: ph.attributions[0]?.uri,
    title: d.name,
  }));
}

/** Web image search through the Worker (Brave; Google Images-style relevance). [] when not set up. */
export async function webImages(query: string, signal?: AbortSignal): Promise<PlaceImage[]> {
  const res = await fetch(`/travelplanner/api/photos/web?${new URLSearchParams({ q: query, ...shareQuery() })}`, { credentials: "same-origin", signal });
  if (!res.ok) return [];
  return ((await res.json()) as { photos?: PlaceImage[] }).photos ?? [];
}
