import { useState } from "react";
import type { MiniMap } from "../../lib/miniMaps";

const W = 200;
const H = 90;
const P = 14;
// Snapshot box (same aspect as the map picture from lib/miniMaps)
const MINI_W = 400;
const MINI_H = 192;

/** Stop positions in the sketch's W x H box. Lng is scaled by cos(lat) so the sketch keeps its real shape. */
function sketchPoints(points: [number, number][]): (readonly [number, number])[] {
  const cos = Math.cos((points.reduce((s, p) => s + p[1], 0) / points.length) * (Math.PI / 180));
  const xs = points.map(([lng]) => lng * cos);
  const ys = points.map(([, lat]) => -lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const k = Math.min((W - 2 * P) / spanX, (H - 2 * P) / spanY);
  const ox = P + (W - 2 * P - spanX * k) / 2;
  const oy = P + (H - 2 * P - spanY * k) / 2;
  return xs.map((x, i) => [ox + (x - minX) * k, oy + (ys[i] - minY) * k] as const);
}

/**
 * A tiny map of the day's pinned stops: dotted route, first stop filled, last stop ringed.
 * With `mini` (a real map snapshot), the same marks sit on the picture instead.
 */
export function RouteSketch({ points, color, mini }: { points: [number, number][]; color: string; mini?: MiniMap }) {
  if (!points.length) return null;
  const vw = mini ? MINI_W : W;
  const vh = mini ? MINI_H : H;
  const pts = mini ? mini.pts.map(([x, y]) => [x * MINI_W, y * MINI_H] as const) : sketchPoints(points);
  // The bigger box needs bigger marks
  const s = mini ? 2 : 1;
  const last = pts.length - 1;
  return (
    <div className="relative h-24 overflow-hidden rounded-xl bg-surface-2">
      {mini && <MiniImage key={mini.url} url={mini.url} />}
      <svg viewBox={`0 0 ${vw} ${vh}`} className={mini ? "absolute inset-0 size-full" : "size-full"} preserveAspectRatio={mini ? "xMidYMid slice" : undefined} aria-hidden>
        {pts.length === 1 && <circle cx={mini ? pts[0][0] : W / 2} cy={mini ? pts[0][1] : H / 2} r={6 * s} fill={color} />}
        {pts.length > 1 && (
          <polyline
            points={pts.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={3 * s}
            strokeDasharray={`${s} ${6 * s}`}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* White halo under each mark so the dots read on the map (the plain sketch has no map under it) */}
        {mini &&
          pts.map(([x, y], i) => <circle key={`h${i}`} cx={x} cy={y} r={(i === 0 || i === last ? 7.5 : 5.5) * s} fill="#fff" />)}
        {pts.slice(1, last).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4 * s} fill={color} />
        ))}
        {pts.length > 1 && <circle cx={pts[last][0]} cy={pts[last][1]} r={6 * s} className="fill-surface-2" stroke={color} strokeWidth={3 * s} />}
        {pts.length > 1 && <circle cx={pts[0][0]} cy={pts[0][1]} r={6 * s} fill={color} />}
      </svg>
    </div>
  );
}

/** The snapshot fades in once it has loaded; the sketch underneath shows until then. */
function MiniImage({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  return <img src={url} alt="" onLoad={() => setLoaded(true)} className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`} />;
}
