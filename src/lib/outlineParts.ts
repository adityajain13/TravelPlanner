// PROTOTYPE (proto/new-trip): picking which pieces of a place's official boundary to highlight and frame.
import type { Position } from "geojson";
import type { Outline } from "./destinations";

export type Bounds = [number, number, number, number]; // [west, south, east, north]

/** Rough area of a ring (degrees², longitude scaled by latitude): only for comparing parts of one place. */
function ringArea(ring: Position[]): number {
  const k = Math.cos((ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180));
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * k + ring[i][0] * k) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}

function inRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringBounds(ring: Position[]): Bounds {
  const b: Bounds = [180, 90, -180, -90];
  for (const [x, y] of ring) (b[0] = Math.min(b[0], x)), (b[1] = Math.min(b[1], y)), (b[2] = Math.max(b[2], x)), (b[3] = Math.max(b[3], y));
  return b;
}

/**
 * Keeps the place itself, not everything officially attached to it: the part that contains the place's
 * point (else the largest), plus parts near it that aren't specks. "Tokyo" is Tokyo Metropolis, which
 * includes island chains 1,000km out in the Pacific; those go, and so do Japan's remote islets.
 */
export function mainParts(outline: Outline, at?: Position): Outline {
  if (outline.type === "Polygon") return outline;
  const parts = outline.coordinates.map((p) => ({ p, b: ringBounds(p[0]), a: ringArea(p[0]) }));
  const main = (at && parts.find((s) => inRing(at, s.p[0]))) || parts.reduce((m, s) => (s.a > m.a ? s : m));
  const k = Math.cos((((main.b[1] + main.b[3]) / 2) * Math.PI) / 180);
  const diag = Math.hypot((main.b[2] - main.b[0]) * k, main.b[3] - main.b[1]);
  const gap = (b: Bounds) => Math.hypot(Math.max(0, b[0] - main.b[2], main.b[0] - b[2]) * k, Math.max(0, b[1] - main.b[3], main.b[1] - b[3]));
  // "Near" = within 15% of the main part's size: keeps Hokkaido, Corsica, the Balearics, Stewart Island;
  // drops Svalbard, NZ's subantarctic islands, the Canaries, Okinawa
  const kept = parts.filter((s) => s === main || (gap(s.b) <= diag * 0.15 && s.a >= main.a * 0.005)).map((s) => s.p);
  return kept.length === 1 ? { type: "Polygon", coordinates: kept[0] } : { type: "MultiPolygon", coordinates: kept };
}

export function boundsOf(outline: Outline): Bounds {
  const rings = outline.type === "Polygon" ? [outline.coordinates[0]] : outline.coordinates.map((p) => p[0]);
  const b: Bounds = [180, 90, -180, -90];
  for (const r of rings) {
    const rb = ringBounds(r);
    (b[0] = Math.min(b[0], rb[0])), (b[1] = Math.min(b[1], rb[1])), (b[2] = Math.max(b[2], rb[2])), (b[3] = Math.max(b[3], rb[3]));
  }
  return b;
}
