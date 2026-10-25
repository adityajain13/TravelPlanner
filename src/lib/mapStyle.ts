import type { StyleSpecification } from "maplibre-gl";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { Theme } from "./theme";

export type MapMode = "map" | "satellite";

export const PROTOMAPS_KEY = import.meta.env.VITE_PROTOMAPS_KEY as string | undefined;
export const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

const ATTR_OSM = '<a href="https://openstreetmap.org/copyright">© OpenStreetMap</a>';
const ATTR_PM = '<a href="https://protomaps.com">Protomaps</a>';
const ATTR_MT = '<a href="https://www.maptiler.com/copyright/">© MapTiler</a>';

/*
 * Map: Protomaps vector tiles in the dark (or light) flavour.
 * Satellite: MapTiler imagery with Protomaps labels on top (hybrid).
 * Phase 2 swaps the `protomaps` source to a downloaded .pmtiles extract when offline.
 */
export function buildStyle(theme: Theme, mode: MapMode): StyleSpecification {
  const flavor = theme === "dark" ? "dark" : "light";
  const style: StyleSpecification = {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${mode === "satellite" ? "dark" : flavor}`,
    sources: {
      protomaps: {
        type: "vector",
        url: `https://api.protomaps.com/tiles/v4.json?key=${PROTOMAPS_KEY ?? ""}`,
        attribution: `${ATTR_PM} ${ATTR_OSM}`,
      },
    },
    layers: [],
  };

  if (mode === "satellite" && MAPTILER_KEY) {
    style.sources.satellite = {
      type: "raster",
      tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`],
      tileSize: 256,
      maxzoom: 20,
      attribution: ATTR_MT,
    };
    style.layers = [
      { id: "satellite", type: "raster", source: "satellite" },
      // Labels are drawn with the dark flavour so text gets a dark halo over imagery
      ...layers("protomaps", namedFlavor("dark"), { lang: "en", labelsOnly: true }),
    ];
  } else {
    style.layers = layers("protomaps", namedFlavor(flavor), { lang: "en" });
  }
  return style;
}
