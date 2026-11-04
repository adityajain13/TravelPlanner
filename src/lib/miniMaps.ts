import type { Map as MLMap } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { buildStyle } from "./mapStyle";
import { PROTOMAPS_KEY } from "./mapKeys";
import type { Theme } from "./theme";

/** A day's map as a JPEG, plus each stop's position inside it (fractions of width and height). */
export interface MiniMap {
  url: string;
  pts: [number, number][];
}

// Same box as the day card's panel (400 x 192 is about 2:1, the card's shape)
const W = 400;
const H = 192;
const IDLE_TIMEOUT_MS = 8000;

export function miniMapKey(points: [number, number][], theme: Theme): string {
  return `${theme}|${points.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(";")}`;
}

// One hidden map shared by every day: 16 live maps would exceed the browser's WebGL context limit
let host: HTMLDivElement | null = null;
let map: Promise<MLMap> | null = null;
let mapTheme: Theme | null = null;

async function getMap(theme: Theme): Promise<MLMap> {
  if (!map) {
    map = (async () => {
      const ml = await import("maplibre-gl");
      ml.setWorkerUrl(workerUrl);
      host = document.createElement("div");
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;pointer-events:none`;
      document.body.appendChild(host);
      mapTheme = theme;
      return new ml.Map({
        container: host,
        style: buildStyle(theme, "map"),
        center: [0, 0],
        zoom: 2,
        interactive: false,
        attributionControl: false,
        canvasContextAttributes: { preserveDrawingBuffer: true }, // toDataURL needs the drawing buffer kept after compositing
        fadeDuration: 0,
        pixelRatio: 2,
      });
    })();
  }
  return map;
}

/** Resolves on the next "idle" (rendered, tiles loaded), or false after a timeout. Register it after the camera change. */
function whenIdle(m: MLMap): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      m.off("idle", onIdle);
      resolve(ok);
    };
    const onIdle = () => finish(true);
    const timer = setTimeout(() => finish(false), IDLE_TIMEOUT_MS);
    m.on("idle", onIdle);
  });
}

// Snapshots run one at a time on the shared map
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  queue = run.catch(() => undefined);
  return run;
}

async function render(points: [number, number][], theme: Theme): Promise<MiniMap | null> {
  const m = await getMap(theme);
  // Camera and style changes are synchronous; the idle wait starts right after them so it sees their render
  if (mapTheme !== theme) {
    mapTheme = theme;
    m.setStyle(buildStyle(theme, "map"));
  }
  if (points.length === 1) {
    m.jumpTo({ center: points[0], zoom: 14 });
  } else {
    let w = 180;
    let s = 90;
    let e = -180;
    let n = -90;
    for (const [x, y] of points) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
    m.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 30, maxZoom: 15, duration: 0 },
    );
  }
  if (!(await whenIdle(m))) return null;
  const url = m.getCanvas().toDataURL("image/jpeg", 0.8);
  const pts = points.map((p) => {
    const q = m.project(p);
    return [q.x / W, q.y / H] as [number, number];
  });
  return { url, pts };
}

const cache = new Map<string, Promise<MiniMap | null>>();

/**
 * A snapshot of the day's stops on the map, or null (no key, no stops, offline with no cached tiles,
 * any error). Callers fall back to the plain sketch on null. Snapshots are cached for the session; failures aren't.
 */
export function snapshotDay(points: [number, number][], theme: Theme): Promise<MiniMap | null> {
  if (!PROTOMAPS_KEY || !points.length) return Promise.resolve(null);
  const key = miniMapKey(points, theme);
  let hit = cache.get(key);
  if (!hit) {
    hit = enqueue(() => render(points, theme)).catch(() => null);
    cache.set(key, hit);
    // A failed snapshot (offline, tiles timed out) is tried again next time the overview opens
    void hit.then((r) => r === null && cache.delete(key));
  }
  return hit;
}
