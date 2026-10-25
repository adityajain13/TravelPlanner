import { db, type RegionRow } from "./db";
import { PROTOMAPS_KEY } from "./mapStyle";
import type { TripState } from "./trips";

/*
 * "Save map offline": pre-downloads the vector tiles covering a trip into the same Cache Storage
 * bucket the service worker serves basemap tiles from (CacheFirst, see vite.config.ts), plus the
 * fonts and sprites labels need. MapLibre then renders the area with no connection.
 * Vector tiles are small, so a city at street level (z15) is typically a few thousand tiles / tens of MB.
 * Satellite imagery is intentionally not included.
 */

const TILE_CACHE = "basemap-tiles";
const ASSET_CACHE = "basemap-assets";
const MAX_TILES = 6000;
const MAX_ZOOM = 15;

export type BBox = [number, number, number, number]; // w, s, e, n

const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function tileRange(b: BBox, z: number) {
  const max = 2 ** z - 1;
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  return { x0: clamp(lon2x(b[0], z)), x1: clamp(lon2x(b[2], z)), y0: clamp(lat2y(b[3], z)), y1: clamp(lat2y(b[1], z)) };
}

function countTiles(b: BBox, maxZ: number) {
  let n = 0;
  for (let z = 0; z <= maxZ; z++) {
    const r = tileRange(b, z);
    n += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
  }
  return n;
}

/** Bounding box of everything in the trip with coordinates, padded; falls back to the trip centre. */
export function tripBBox(state: TripState): BBox | null {
  const pts = state.items.filter((i) => i.lat != null && i.lng != null).map((i) => [i.lng!, i.lat!] as const);
  if (state.meta.center) pts.push(state.meta.center);
  if (pts.length === 0) return null;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) (w = Math.min(w, x)), (e = Math.max(e, x)), (s = Math.min(s, y)), (n = Math.max(n, y));
  const padX = Math.max((e - w) * 0.15, 0.08);
  const padY = Math.max((n - s) * 0.15, 0.06);
  return [w - padX, s - padY, e + padX, n + padY];
}

/** Deepest zoom that keeps the download under MAX_TILES. */
export function planDownload(b: BBox) {
  let z = MAX_ZOOM;
  while (z > 8 && countTiles(b, z) > MAX_TILES) z--;
  return { maxZoom: z, tiles: countTiles(b, z) };
}

async function tileTemplate(): Promise<string> {
  const res = await fetch(`https://api.protomaps.com/tiles/v4.json?key=${PROTOMAPS_KEY}`);
  if (!res.ok) throw new Error(`Map server error ${res.status}`);
  const tj = (await res.json()) as { tiles: string[] };
  // Keep the TileJSON itself cached too: MapLibre requests it first when offline
  const c = await caches.open(TILE_CACHE);
  await c.put(`https://api.protomaps.com/tiles/v4.json?key=${PROTOMAPS_KEY}`, new Response(JSON.stringify(tj), { headers: { "Content-Type": "application/json" } }));
  return tj.tiles[0];
}

function labelAssets(): string[] {
  const base = "https://protomaps.github.io/basemaps-assets";
  const fonts = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
  const ranges = ["0-255", "256-511", "512-767", "768-1023", "7680-7935", "8192-8447"];
  const glyphs = fonts.flatMap((f) => ranges.map((r) => `${base}/fonts/${encodeURIComponent(f)}/${r}.pbf`));
  const sprites = ["dark", "light"].flatMap((v) =>
    ["", "@2x"].flatMap((s) => [`${base}/sprites/v4/${v}${s}.json`, `${base}/sprites/v4/${v}${s}.png`]),
  );
  return [...glyphs, ...sprites];
}

export interface Progress {
  done: number;
  total: number;
  bytes: number;
}

export async function saveRegion(tripId: string, b: BBox, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<RegionRow> {
  if (!PROTOMAPS_KEY) throw new Error("No map key configured");
  const { maxZoom } = planDownload(b);
  const template = await tileTemplate();

  const urls: string[] = [];
  for (let z = 0; z <= maxZoom; z++) {
    const r = tileRange(b, z);
    for (let x = r.x0; x <= r.x1; x++)
      for (let y = r.y0; y <= r.y1; y++) urls.push(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
  }

  const tileCache = await caches.open(TILE_CACHE);
  const assetCache = await caches.open(ASSET_CACHE);
  const jobs: [string, Cache][] = [...urls.map((u) => [u, tileCache] as [string, Cache]), ...labelAssets().map((u) => [u, assetCache] as [string, Cache])];

  const p: Progress = { done: 0, total: jobs.length, bytes: 0 };
  onProgress({ ...p });
  let next = 0;
  let failed = 0;

  async function worker() {
    while (next < jobs.length && !signal.aborted) {
      const [url, cache] = jobs[next++];
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { signal });
          if (res.ok) {
            const blob = await res.blob();
            p.bytes += blob.size;
            const headers = new Headers(res.headers);
            headers.delete("vary"); // a Vary header could make the service worker's cache lookup miss
            await cache.put(url, new Response(blob, { headers }));
          } else if (res.status !== 204 && res.status !== 404) failed++;
        }
      } catch {
        if (signal.aborted) return;
        failed++;
      }
      p.done++;
      if (p.done % 25 === 0 || p.done === p.total) onProgress({ ...p });
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (failed > jobs.length * 0.05) throw new Error(`${failed} tiles failed — check your connection and try again`);

  const row: RegionRow = { tripId, bbox: b, maxZoom, tiles: urls.length, bytes: p.bytes, savedAt: Date.now() };
  await db.regions.put(row);
  return row;
}

export const formatBytes = (n: number) =>
  n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;

/** True if the region still covers the trip (new places outside it mean it should be re-saved). */
export function regionCovers(r: RegionRow, b: BBox) {
  return r.bbox[0] <= b[0] && r.bbox[1] <= b[1] && r.bbox[2] >= b[2] && r.bbox[3] >= b[3];
}
