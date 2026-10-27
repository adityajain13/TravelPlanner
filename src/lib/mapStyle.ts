import type { StyleSpecification } from "maplibre-gl";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { Theme } from "./theme";

export type MapMode = "map" | "satellite";

import { MAPTILER_KEY, PROTOMAPS_KEY } from "./mapKeys";
export { MAPTILER_KEY, PROTOMAPS_KEY };

const ATTR_OSM = '<a href="https://openstreetmap.org/copyright">© OpenStreetMap</a>';
const ATTR_PM = '<a href="https://protomaps.com">Protomaps</a>';
const ATTR_MT = '<a href="https://www.maptiler.com/copyright/">© MapTiler</a>';

/*
 * Map: Protomaps vector tiles in the dark (or light) flavour.
 * Satellite: MapTiler imagery with Protomaps labels on top (hybrid).
 * Phase 2 swaps the `protomaps` source to a downloaded .pmtiles extract when offline.
 */
export function buildStyle(theme: Theme, mode: MapMode): StyleSpecification {
  const flavor = theme === "light" ? "light" : "dark";
  // Black mode: same dark map, with land and the void around it taken to true black
  const fl = theme === "amoled" ? { ...namedFlavor("dark"), background: "#000000", earth: "#050505", water: "#161a22" } : namedFlavor(flavor);
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
      // Labels over imagery: white text with a strong dark halo so it reads on any photo
      // (the flavour's own grey-on-grey labels vanished over rooftops)
      ...layers("protomaps", namedFlavor("dark"), { lang: "en", labelsOnly: true }).map((l) =>
        l.type === "symbol"
          ? {
              ...l,
              paint: {
                ...l.paint,
                "text-color": /road|street|highway/.test(l.id) ? "#f1f3f2" : "#ffffff",
                "text-halo-color": "rgba(0,0,0,0.85)",
                "text-halo-width": 1.6,
                "text-halo-blur": 0.4,
              },
            }
          : l,
      ),
    ];
  } else {
    style.layers = layers("protomaps", fl, { lang: "en" });
  }
  return style;
}
