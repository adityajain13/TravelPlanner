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
}

maplibregl.setWorkerUrl(workerUrl);

const readMode = (): MapMode => {
  try {
    return localStorage.getItem("tp-map-mode") === "satellite" && MAPTILER_KEY ? "satellite" : "map";
  } catch {
    return "map";
  }
};

export function TripMap({ pins, routes, selectedId, onSelect, theme, fitKey, fallbackCenter }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mode, setMode] = useState<MapMode>(readMode);
  const latest = useRef({ pins, routes, selectedId, onSelect });
  latest.current = { pins, routes, selectedId, onSelect };
  const firstStyle = useRef(true);

  // Create the map once
  useEffect(() => {
    if (!container.current || !PROTOMAPS_KEY) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: buildStyle(theme, mode),
      center: (fallbackCenter ?? [139.69, 35.68]) as LngLatLike,
      zoom: fallbackCenter ? 10 : 2,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
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
    return () => {
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
    const b = new maplibregl.LngLatBounds();
    pins.forEach((p) => b.extend([p.lng, p.lat]));
    map.fitBounds(b, { padding: 64, maxZoom: 15, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, pins.length > 0]);

  // Follow selection
  useEffect(() => {
    const map = mapRef.current;
    const p = pins.find((x) => x.id === selectedId);
    if (map && p) map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 14), duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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
  map.addLayer({
    id: "trip-pins",
    type: "circle",
    source: "trip-pins",
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": ["case", ["get", "selected"], 13, 10],
      "circle-stroke-color": ["case", ["get", "selected"], "#ffffff", "#0e1110"],
      "circle-stroke-width": ["case", ["get", "selected"], 3, 2],
    },
  });
  map.addLayer({
    id: "trip-pin-labels",
    type: "symbol",
    source: "trip-pins",
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Medium"],
      "text-size": 11,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": "#0e1110" },
  });
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
