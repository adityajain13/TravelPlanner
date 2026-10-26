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

export interface Pin {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
  name?: string;
  image?: string; // thumbnail URL for the popup
  unsplash?: { name: string; author?: string }; // photographer credit for Unsplash photos
}

export interface Route {
  color: string;
  coords: [number, number][];
  /** solid = road/transit route, dotted = walking, dashed = straight line (unrouted / flight) */
  style?: "solid" | "dotted" | "dashed";
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

export function TripMap({ pins, routes, selectedId, onSelect, theme, fitKey, fallbackCenter, inset, frame }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mode, setMode] = useState<MapMode>(readMode);
  const latest = useRef({ pins, routes, selectedId, onSelect });
  latest.current = { pins, routes, selectedId, onSelect };
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
  }, [pins, routes, selectedId]);

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
  useEffect(() => {
    const map = mapRef.current;
    const p = pins.find((x) => x.id === selectedId);
    popup.current?.remove();
    popup.current = null;
    if (map && !p && !inset) map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    if (!map || !p) return;
    const pad = { top: (inset?.top ?? 0) + 40, bottom: (inset?.bottom ?? 0) + 40, left: 40, right: 40 };
    map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 14), duration: 500, padding: pad });
    // The place panel replaces the little photo popup
    if (p.name && !inset) {
      const el = document.createElement("div");
      el.className = "tp-popup";
      if (p.image) {
        const img = document.createElement("img");
        img.src = p.image;
        img.referrerPolicy = "no-referrer";
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
      popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -38], maxWidth: "220px", className: "tp-popup-wrap" })
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
  if (!map.hasImage("tp-pin")) map.addImage("tp-pin", pinImage(), { sdf: true, pixelRatio: 2 });
  // Wanderlog-style teardrop pins: SDF icon tinted per day, number on the head, selected one larger
  map.addLayer({
    id: "trip-pins",
    type: "symbol",
    source: "trip-pins",
    layout: {
      "icon-image": "tp-pin",
      "icon-anchor": "bottom",
      "icon-size": ["case", ["get", "selected"], 1.2, 0.95],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": ["case", ["get", "selected"], 2, 1],
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Medium"],
      "text-size": ["case", ["get", "selected"], 13, 11],
      "text-anchor": "center",
      "text-offset": ["case", ["get", "selected"], ["literal", [0, -1.62]], ["literal", [0, -1.66]]],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "icon-color": ["get", "color"],
      "icon-halo-color": "rgba(0,0,0,0.55)",
      "icon-halo-width": 1,
      "text-color": "#0e1110",
    },
  });
}

/** White teardrop on a transparent canvas; used as an SDF so MapLibre can colour it per pin. */
function pinImage() {
  const w = 56;
  const h = 68;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(28, 66);
  g.bezierCurveTo(26, 59, 21, 54, 15, 48);
  g.arc(28, 27, 24, Math.PI * 0.8, Math.PI * 0.2);
  g.bezierCurveTo(35, 54, 30, 59, 28, 66);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, w, h);
}

function pushData(map: maplibregl.Map, d: Pick<Props, "pins" | "routes" | "selectedId">) {
  const pinSrc = map.getSource("trip-pins") as GeoJSONSource | undefined;
  const routeSrc = map.getSource("trip-routes") as GeoJSONSource | undefined;
  if (!pinSrc || !routeSrc) return;
  pinSrc.setData({
    type: "FeatureCollection",
    features: d.pins.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { id: p.id, color: p.color, label: p.label, selected: p.id === d.selectedId },
    })),
  });
  routeSrc.setData({
    type: "FeatureCollection",
    features: d.routes
      .filter((r) => r.coords.length > 1)
      .map((r) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: r.coords },
        properties: { color: r.color, style: r.style ?? "dashed" },
      })),
  });
}

const empty = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });
