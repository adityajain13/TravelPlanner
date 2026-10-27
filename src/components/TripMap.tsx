import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LngLatLike, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 runs tile decoding in a separate module worker. Let Vite emit it as an asset and
// point MapLibre at it; otherwise it looks for an unbundled file next to the chunk and fails.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Layers, Map as MapIcon, Satellite } from "lucide-react";
import { buildStyle, MAPTILER_KEY, PROTOMAPS_KEY, type MapMode } from "../lib/mapStyle";
import type { Theme } from "../lib/theme";
import { drawPin, PIN, type Glyph } from "../lib/pinArt";

export interface Pin {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
  name?: string;
  image?: string; // thumbnail URL for the popup
  unsplash?: { name: string; author?: string }; // photographer credit for Unsplash photos
  /** Draw an icon on the pin's head instead of the label text. */
  glyph?: Glyph;
}

export interface Route {
  color: string;
  coords: [number, number][];
  /** solid = road/transit route, dotted = walking, dashed = straight line (unrouted), arc = a booked flight */
  style?: "solid" | "dotted" | "dashed" | "arc";
}

interface Props {
  pins: Pin[];
  routes: Route[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: Theme;
  /** Change this to re-frame the map around the current pins (trip opened, day filter changed). */
  fitKey: string;
  fallbackCenter?: [number, number];
  /** Space taken by the place panel over the map; the selected pin is framed in what's left. */
  inset?: { top: number; bottom: number } | null;
  /** Frame just these pins (a day chip was clicked); a new nonce re-frames even for the same day. */
  frame?: { ids: string[]; nonce: number } | null;
  /** Colour of the selected stop's day: road shared by several days shows in this colour. */
  focusColor?: string;
  /** Open the selected pin's card without moving the map. */
  holdView?: boolean;
}

maplibregl.setWorkerUrl(workerUrl);

/**
 * Bounds that frame most of the trip: the ~75% of pins closest to the trip's median point,
 * plus any others not much farther out. A home airport 4,000 km away doesn't shrink Iceland
 * to a speck, but a trip that really is spread out still gets shown whole.
 */
function coreBounds(pins: { lat: number; lng: number }[]): maplibregl.LngLatBounds | null {
  if (!pins.length) return null;
  const med = (xs: number[]) => {
    const a = [...xs].sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  };
  const c = [med(pins.map((p) => p.lng)), med(pins.map((p) => p.lat))];
  const d = (p: { lat: number; lng: number }) => Math.hypot((p.lng - c[0]) * Math.cos((c[1] * Math.PI) / 180), p.lat - c[1]);
  const sorted = [...pins].sort((a, b) => d(a) - d(b));
  const k = Math.max(1, Math.ceil(sorted.length * 0.75));
  const cutoff = d(sorted[k - 1]) * 1.5 + 0.02;
  const b = new maplibregl.LngLatBounds();
  sorted.filter((p, i) => i < k || d(p) <= cutoff).forEach((p) => b.extend([p.lng, p.lat]));
  return b;
}
const FIT = { padding: 64, maxZoom: 14 };

const readMode = (): MapMode => {
  try {
    return localStorage.getItem("tp-map-mode") === "satellite" && MAPTILER_KEY ? "satellite" : "map";
  } catch {
    return "map";
  }
};

export function TripMap({ pins, routes, selectedId, onSelect, theme, fitKey, fallbackCenter, inset, frame, focusColor, holdView }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mode, setMode] = useState<MapMode>(readMode);
  const latest = useRef({ pins, routes, selectedId, onSelect, focusColor });
  latest.current = { pins, routes, selectedId, onSelect, focusColor };
  const firstStyle = useRef(true);

  // Create the map once
  useEffect(() => {
    if (!container.current || !PROTOMAPS_KEY) return;
    const start = coreBounds(latest.current.pins);
    const map = new maplibregl.Map({
      container: container.current,
      style: buildStyle(theme, mode),
      ...(start
        ? { bounds: start, fitBoundsOptions: FIT }
        : { center: (fallbackCenter ?? [139.69, 35.68]) as LngLatLike, zoom: fallbackCenter ? 6 : 2 }),
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    // Pins may have arrived (or the panel sized itself) while the map was loading: frame them now
    map.once("load", () => {
      map.resize();
      const b = coreBounds(latest.current.pins);
      if (b && !latest.current.selectedId) map.fitBounds(b, { ...FIT, duration: 0 });
    });
    onMissingImage(map);
    map.on("style.load", () => {
      addOverlay(map);
      pushData(map, latest.current);
    });
    map.on("click", "trip-pins", (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) latest.current.onSelect(id);
    });
    map.on("mouseenter", "trip-pins", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "trip-pins", () => (map.getCanvas().style.cursor = ""));
    mapRef.current = map;
    // The container changes size when the itinerary is hidden/shown: keep the canvas filling it
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme / satellite switch
  useEffect(() => {
    if (firstStyle.current) {
      firstStyle.current = false;
      return;
    }
    mapRef.current?.setStyle(buildStyle(theme, mode), { diff: false });
    try {
      localStorage.setItem("tp-map-mode", mode);
    } catch {
      /* ignore */
    }
  }, [theme, mode]);

  // Data changes
  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) pushData(map, latest.current);
  }, [pins, routes, selectedId, focusColor]);

  // Re-frame
  useEffect(() => {
    const map = mapRef.current;
    if (!map || pins.length === 0) return;
    if (pins.length === 1) {
      map.easeTo({ center: [pins[0].lng, pins[0].lat], zoom: Math.max(map.getZoom(), 13) });
      return;
    }
    map.fitBounds(coreBounds(pins)!, { ...FIT, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, pins.length > 0]);

  // Frame one day's pins (most of them, same rule as the whole trip)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !frame) return;
    const sel = latest.current.pins.filter((p) => frame.ids.includes(p.id));
    if (!sel.length) return;
    const bottom = (inset?.bottom ?? 0) + 64;
    if (sel.length === 1) {
      map.easeTo({ center: [sel[0].lng, sel[0].lat], zoom: Math.max(map.getZoom(), 13), duration: 600, padding: { top: 64, left: 64, right: 64, bottom } });
      return;
    }
    map.fitBounds(coreBounds(sel)!, { padding: { top: 64, left: 64, right: 64, bottom }, maxZoom: FIT.maxZoom, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame?.nonce]);

  // Follow selection, with a small photo card above the pin (like Wanderlog's map popups)
  const popup = useRef<maplibregl.Popup | null>(null);
  const centered = useRef<{ id: string; insetKnown: boolean } | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    const p = pins.find((x) => x.id === selectedId);
    popup.current?.remove();
    popup.current = null;
    if (map && !p && !inset) map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    if (!p) centered.current = null;
    if (!map || !p) return;
    // Frame a pin once when it's selected (and once more if the panel's size wasn't known yet).
    // Shrinking or expanding the place panel afterwards leaves the map where it is.
    const insetKnown = !inset || inset.bottom > 0;
    if (holdView) centered.current = { id: p.id, insetKnown: true };
    else if (!(centered.current?.id === p.id && centered.current.insetKnown)) {
      const pad = { top: (inset?.top ?? 0) + 40, bottom: (inset?.bottom ?? 0) + 40, left: 40, right: 40 };
      map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 14), duration: 500, padding: pad });
      centered.current = { id: p.id, insetKnown };
    }
    // The place panel replaces the little photo popup
    if (p.name && !inset) {
      const el = document.createElement("div");
      el.className = "tp-popup";
      if (p.image) {
        const img = document.createElement("img");
        img.src = p.image;
        img.referrerPolicy = /googleapis\.com\//.test(p.image) ? "strict-origin-when-cross-origin" : "no-referrer";
        img.alt = "";
        img.onerror = () => img.remove();
        el.append(img);
      }
      const t = document.createElement("p");
      t.textContent = p.name; // textContent: names come from user/OSM data
      el.append(t);
      if (p.image && p.unsplash) {
        // Unsplash attribution: "Photo by <name> on Unsplash", both linked (textContent keeps it safe)
        const c = document.createElement("small");
        const link = (href: string | undefined, text: string) => {
          const a = document.createElement("a");
          a.href = href ?? "https://unsplash.com/";
          a.target = "_blank";
          a.rel = "noreferrer";
          a.textContent = text;
          return a;
        };
        c.append("Photo by ", link(p.unsplash.author, p.unsplash.name), " on ", link("https://unsplash.com/?utm_source=travelplanner&utm_medium=referral", "Unsplash"));
        c.style.cssText = "display:block;font-size:10px;opacity:.7;margin-top:2px";
        el.append(c);
      }
      popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -44], maxWidth: "220px", className: "tp-popup-wrap" })
        .setLngLat([p.lng, p.lat])
        .setDOMContent(el)
        .addTo(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, pins.find((x) => x.id === selectedId)?.image, inset ? Math.round(inset.top / 80) * 80 + Math.round(inset.bottom / 80) * 80 * 1000 : -1]);

  if (!PROTOMAPS_KEY) {
    return (
      <div className="grid h-full place-items-center bg-surface-2 p-8 text-center text-sm text-muted">
        <div className="max-w-xs space-y-2">
          <MapIcon className="mx-auto size-6" />
          <p>
            Add <code className="text-fg">VITE_PROTOMAPS_KEY</code> to <code className="text-fg">.env</code> to load the
            map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" />
      {MAPTILER_KEY && (
        <div className="absolute top-3 right-3 flex overflow-hidden rounded-full border border-line bg-surface/90 text-xs shadow-lg backdrop-blur">
          <ModeButton active={mode === "map"} onClick={() => setMode("map")} icon={<Layers className="size-3.5" />}>
            Map
          </ModeButton>
          <ModeButton
            active={mode === "satellite"}
            onClick={() => setMode("satellite")}
            icon={<Satellite className="size-3.5" />}
          >
            Satellite
          </ModeButton>
        </div>
      )}
    </div>
  );
}

function ModeButton(props: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
        props.active ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
      }`}
    >
      {props.icon}
      {props.children}
    </button>
  );
}

function addOverlay(map: maplibregl.Map) {
  if (map.getSource("trip-pins")) return;
  map.addSource("trip-routes", { type: "geojson", data: empty() });
  map.addSource("trip-pins", { type: "geojson", data: empty() });
  const routeLayer = (style: string, paint: Record<string, unknown>) =>
    map.addLayer({
      id: `trip-routes-${style}`,
      type: "line",
      source: "trip-routes",
      filter: ["==", ["get", "style"], style],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-opacity": 0.85, ...paint },
    } as maplibregl.LineLayerSpecification);
  routeLayer("solid", { "line-width": 3.5 });
  routeLayer("dotted", { "line-width": 3, "line-dasharray": [0.1, 2] });
  routeLayer("dashed", { "line-width": 2, "line-opacity": 0.6, "line-dasharray": [1.5, 1.5] });
  routeLayer("arc", { "line-width": 2, "line-opacity": 0.75, "line-dasharray": [2, 2] });
  // Stretches several days share: striped in all their colours (pattern images made in pushData)
  map.addLayer({
    id: "trip-routes-shared",
    type: "line",
    source: "trip-routes",
    filter: ["==", ["get", "style"], "shared"],
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: { "line-pattern": ["get", "pattern"], "line-width": 4, "line-opacity": 0.95 },
  } as maplibregl.LineLayerSpecification);
  // Each pin is one image with its number (or plane) drawn in, made on first use. With the number
  // as separate text, MapLibre draws all text above all icons, so numbers of pins underneath
  // showed through the pin on top.
  map.addLayer({
    id: "trip-pins",
    type: "symbol",
    source: "trip-pins",
    layout: {
      "icon-image": ["concat", "tp-pin|", ["get", "color"], "|", ["get", "label"], "|", ["get", "glyph"]],
      "icon-anchor": "bottom",
      "icon-offset": [0, PIN.h - PIN.tipY], // the tip, not the shadow under it, sits on the spot
      "icon-size": ["case", ["get", "selected"], 1.2, 0.95],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": ["case", ["get", "selected"], 2, 1],
    },
  });
}

/** Builds "tp-pin|<color>|<label>|<glyph>" images on demand. */
function onMissingImage(map: maplibregl.Map) {
  map.on("styleimagemissing", (e: { id: string }) => {
    if (!e.id.startsWith("tp-pin|") || map.hasImage(e.id)) return;
    const [, color, label, glyph] = e.id.split("|");
    map.addImage(e.id, pinImage(color, label, glyph), { pixelRatio: 3 });
  });
}

// Drawn at 3x so the enlarged selected pin stays sharp on retina screens
const pinImage = (color: string, label: string, glyph: string) => drawPin(color, label, glyph, 3);

/** Stripes of each colour in turn, for line-pattern (repeats along the line). */
function stripeImage(colors: string[]) {
  const seg = 14; // px per colour at 2x
  const c = document.createElement("canvas");
  c.width = seg * colors.length;
  c.height = 8;
  const g = c.getContext("2d")!;
  colors.forEach((col, i) => ((g.fillStyle = col), g.fillRect(i * seg, 0, seg, 8)));
  return g.getImageData(0, 0, c.width, c.height);
}

const segKey = (a: [number, number], b: [number, number]) => {
  const k = (p: [number, number]) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const x = k(a);
  const y = k(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
};

/**
 * Splits routes where days overlap. Segments (rounded to ~10 m, either direction) used by routes
 * of different colours become "shared" runs, striped in those colours, or drawn in the selected
 * day's colour when it's one of them. Each shared run is drawn once.
 */
function splitShared(routes: Route[], focusColor?: string) {
  const users = new Map<string, Set<string>>();
  const roads = routes.filter((r) => r.coords.length > 1 && (r.style === "solid" || r.style === "dotted"));
  for (const r of roads)
    for (let i = 1; i < r.coords.length; i++) {
      const k = segKey(r.coords[i - 1], r.coords[i]);
      (users.get(k) ?? users.set(k, new Set()).get(k)!).add(r.color);
    }
  const out: { coords: [number, number][]; color: string; style: string; pattern?: string }[] = [];
  const drawnShared = new Set<string>();
  for (const r of routes) {
    if (r.coords.length < 2) continue;
    if (!roads.includes(r)) {
      out.push({ coords: r.coords, color: r.color, style: r.style ?? "dashed" });
      continue;
    }
    let run: [number, number][] = [r.coords[0]];
    let runSet = "";
    const flush = () => {
      if (run.length < 2) return;
      const colors = runSet.split("|");
      if (colors.length < 2) out.push({ coords: run, color: r.color, style: r.style! });
      else if (focusColor && colors.includes(focusColor)) out.push({ coords: run, color: focusColor, style: "solid" });
      else out.push({ coords: run, color: r.color, style: "shared", pattern: `tp-stripe|${runSet}` });
    };
    for (let i = 1; i < r.coords.length; i++) {
      const k = segKey(r.coords[i - 1], r.coords[i]);
      const set = [...(users.get(k) ?? [r.color])].sort().join("|");
      const shared = set.includes("|");
      // A shared stretch another route already drew: leave a gap in this one
      const skip = shared && drawnShared.has(k);
      const key = skip ? "skip" : set;
      if (key !== runSet) {
        if (runSet !== "skip") flush();
        run = [r.coords[i - 1]];
        runSet = key;
      }
      run.push(r.coords[i]);
      if (shared) drawnShared.add(k);
    }
    if (runSet !== "skip") flush();
  }
  return out;
}

function pushData(map: maplibregl.Map, d: Pick<Props, "pins" | "routes" | "selectedId" | "focusColor">) {
  const pinSrc = map.getSource("trip-pins") as GeoJSONSource | undefined;
  const routeSrc = map.getSource("trip-routes") as GeoJSONSource | undefined;
  if (!pinSrc || !routeSrc) return;
  // Make each pin's image before the data needs it (styleimagemissing alone left them blank)
  for (const p of d.pins) {
    const id = `tp-pin|${p.color}|${p.glyph ? "" : p.label}|${p.glyph ?? ""}`;
    if (!map.hasImage(id)) map.addImage(id, pinImage(p.color, p.glyph ? "" : p.label, p.glyph ?? ""), { pixelRatio: 3 });
  }
  pinSrc.setData({
    type: "FeatureCollection",
    features: d.pins.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { id: p.id, color: p.color, label: p.glyph ? "" : p.label, glyph: p.glyph ?? "", selected: p.id === d.selectedId },
    })),
  });
  const parts = splitShared(d.routes, d.focusColor);
  for (const p of parts)
    if (p.pattern && !map.hasImage(p.pattern)) map.addImage(p.pattern, stripeImage(p.pattern.split("|").slice(1)), { pixelRatio: 2 });
  routeSrc.setData({
    type: "FeatureCollection",
    features: parts.map((p) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: p.coords },
      properties: { color: p.color, style: p.style, pattern: p.pattern ?? "" },
    })),
  });
}

const empty = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });
