// PROTOTYPE (proto/new-trip): an ambient globe for the new-trip flow.
//  Idle:    no labels, a slow drift that eases in.
//  Typing:  `preview` (the highlighted suggestion) pulls the globe toward it, staying zoomed out.
//  Picked:  `place` flies in, then everything outside its boundary dims (labels included): the trip's focus.
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { Feature, FeatureCollection, Position } from "geojson";
import { buildStyle, PROTOMAPS_KEY } from "../../lib/mapStyle";
import { isDark, useTheme } from "../../lib/theme";
import { fetchOutline, hasCoords, zoomForKind, type Destination, type Outline } from "../../lib/destinations";
import { boundsOf, mainParts } from "../../lib/outlineParts";

maplibregl.setWorkerUrl(workerUrl);

/** Keyless fallback for local dev without VITE_PROTOMAPS_KEY: OpenFreeMap (OSM data, no key). */
const keylessStyle = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;

const DRIFT_DEG_PER_SEC = 1.5; // one turn in 4 minutes
const DRIFT_EASE_IN_MS = 5000;
const IDLE_ZOOM = 1.5;
const PREVIEW_MAX_ZOOM = 3.5;
/** How much land outside the chosen place is dimmed (the sea is left alone). */
const MASK = { dark: { color: "#03060a", opacity: 0.2 }, light: { color: "#1c2220", opacity: 0.15 } };

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** The whole world with the place cut out of it. */
function focusData(outline: Outline): FeatureCollection {
  const polys: Position[][][] = outline.type === "Polygon" ? [outline.coordinates] : outline.coordinates;
  const world: Position[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  const mask: Feature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...polys.map((p) => p[0])] } };
  return { type: "FeatureCollection", features: [mask] };
}

export function GlobeView({
  place,
  preview = null,
  padding = { top: 40, bottom: 40, left: 40, right: 40 },
  className = "",
}: {
  place: Destination | null;
  preview?: Destination | null;
  /** Keeps the place clear of anything drawn over the map (the phone card). */
  padding?: maplibregl.PaddingOptions;
  className?: string;
}) {
  const [theme] = useTheme();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const labelLayers = useRef<string[]>([]);
  /** The style's own label filters, to put back when the focus clears. */
  const labelFilters = useRef(new Map<string, maplibregl.FilterSpecification | undefined>());
  /** Copies of the water layers drawn above the mask, so the sea keeps its colour everywhere. */
  const waterAbove = useRef<string[]>([]);
  const mode = useRef<"idle" | "preview" | "picked">("idle");
  const driftSince = useRef(0);
  const pad = useRef(padding);
  pad.current = padding;

  useEffect(() => {
    if (!el.current) return;
    const dark = isDark(theme);
    const map = new maplibregl.Map({
      container: el.current,
      style: PROTOMAPS_KEY ? buildStyle(theme, "map") : keylessStyle(dark),
      center: [20, 18],
      zoom: IDLE_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    let raf = 0;
    let last = performance.now();
    let dragging = false;

    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
      // No atmosphere glow around the edge
      try {
        map.setSky({ "atmosphere-blend": 0 });
      } catch {
        /* older style specs */
      }
      const layers = map.getStyle().layers;
      labelLayers.current = layers.filter((l) => l.type === "symbol").map((l) => l.id);
      labelFilters.current = new Map(labelLayers.current.map((id) => [id, map.getFilter(id) ?? undefined]));
      setLabels(map, mode.current === "picked");
      // Order: map → mask → sea again → labels. The mask dims land outside the place, the sea is drawn
      // over it so water looks the same everywhere, and names stay on top (they're clipped to the place).
      const firstLabel = labelLayers.current[0];
      const m = dark ? MASK.dark : MASK.light;
      map.addSource("focus", { type: "geojson", data: EMPTY });
      map.addLayer(
        { id: "focus-mask", type: "fill", source: "focus", paint: { "fill-color": m.color, "fill-opacity": 0, "fill-opacity-transition": { duration: 900, delay: 0 } } },
        firstLabel,
      );
      waterAbove.current = [];
      for (const l of layers) {
        if (l.type !== "fill" || !/water|ocean/i.test(l.id)) continue;
        const id = `${l.id}-above-focus`;
        map.addLayer({ ...l, id, layout: { ...l.layout, visibility: "none" } }, firstLabel);
        waterAbove.current.push(id);
      }
    });

    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      if (mode.current === "idle" && !dragging && !map.isMoving()) {
        const ramp = Math.min(1, (now - driftSince.current) / DRIFT_EASE_IN_MS);
        const eased = ramp * ramp * (3 - 2 * ramp); // smoothstep: starts still, settles into the drift
        const c = map.getCenter();
        map.setCenter([c.lng + (DRIFT_DEG_PER_SEC * eased * dt) / 1000, c.lat]);
      }
      raf = requestAnimationFrame(tick);
    };
    map.on("load", () => {
      driftSince.current = performance.now();
      raf = requestAnimationFrame(tick);
    });
    map.on("dragstart", () => (dragging = true));
    map.on("dragend", () => ((dragging = false), (driftSince.current = performance.now())));
    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
  }, [theme]);

  function setLabels(map: maplibregl.Map, on: boolean) {
    for (const id of labelLayers.current) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }

  /**
   * Spotlight on the outline (or clear it with null): land outside is dimmed by the mask,
   * and labels are clipped to the outline so only names inside it show.
   */
  function setFocus(map: maplibregl.Map, outline: Outline | null) {
    const src = map.getSource<maplibregl.GeoJSONSource>("focus");
    if (!src) return;
    if (outline) src.setData(focusData(outline));
    const m = isDark(theme) ? MASK.dark : MASK.light;
    map.setPaintProperty("focus-mask", "fill-opacity", outline ? m.opacity : 0);
    for (const id of labelLayers.current) {
      if (!map.getLayer(id)) continue;
      const own = labelFilters.current.get(id);
      const within = ["within", outline] as unknown as maplibregl.FilterSpecification;
      map.setFilter(id, outline ? (own ? (["all", own, within] as maplibregl.FilterSpecification) : within) : (own ?? null));
    }
    for (const id of waterAbove.current) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", outline ? "visible" : "none");
  }

  // Picked place, or a preview while typing, or back to idle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    marker.current?.remove();
    marker.current = null;

    if (place && hasCoords(place)) {
      mode.current = "picked";
      if (place.bbox) map.fitBounds(place.bbox, { padding: pad.current, maxZoom: 10, duration: 2400, essential: true });
      else map.flyTo({ center: [place.lng, place.lat], zoom: zoomForKind(place.kind), padding: pad.current, duration: 2400, essential: true });
      // Labels and the spotlight arrive together, and the camera re-centres on the highlighted area itself;
      // without an outline, a pin marks the spot instead
      const ctl = new AbortController();
      fetchOutline(place, ctl.signal)
        .catch(() => null)
        .then((raw) => {
          if (ctl.signal.aborted) return;
          const outline = raw && mainParts(raw, [place.lng, place.lat]);
          setLabels(map, true);
          setFocus(map, outline);
          if (outline) map.fitBounds(boundsOf(outline), { padding: pad.current, maxZoom: 11, duration: 1400, essential: true });
          else {
            const dot = document.createElement("div");
            dot.className = "size-3.5 rounded-full border-2 border-white bg-accent shadow-[0_0_0_6px_rgb(95_214_139/.3)]";
            marker.current = new maplibregl.Marker({ element: dot }).setLngLat([place.lng, place.lat]).addTo(map);
          }
        });
      return () => ctl.abort();
    }
    if (place) return; // picked, coordinates still on their way

    setLabels(map, false);
    setFocus(map, null);
    if (preview && hasCoords(preview)) {
      // Head toward it quickly, staying zoomed out so it still feels like the whole world
      mode.current = "preview";
      const cam = preview.bbox ? map.cameraForBounds(preview.bbox, { padding: pad.current }) : undefined;
      const zoom = Math.min(PREVIEW_MAX_ZOOM, cam?.zoom ?? zoomForKind(preview.kind), zoomForKind(preview.kind));
      map.easeTo({ center: cam?.center ?? [preview.lng, preview.lat], zoom: Math.max(zoom, 2), padding: pad.current, duration: 900, essential: true });
      return;
    }
    if (mode.current !== "idle") {
      mode.current = "idle";
      map.easeTo({ zoom: IDLE_ZOOM, center: [map.getCenter().lng, 18], padding: pad.current, duration: 1600 });
      map.once("moveend", () => (driftSince.current = performance.now()));
    }
  }, [place, preview]);

  return <div ref={el} className={`size-full ${className}`} />;
}
