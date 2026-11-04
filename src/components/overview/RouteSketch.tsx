/** A tiny map of the day's pinned stops: dotted route, first stop filled, last stop ringed. */
export function RouteSketch({ points, color }: { points: [number, number][]; color: string }) {
  if (!points.length) return null;
  const W = 200;
  const H = 90;
  const P = 14;
  // Lng is scaled by cos(lat) so the sketch keeps its real shape
  const cos = Math.cos((points.reduce((s, p) => s + p[1], 0) / points.length) * (Math.PI / 180));
  const xs = points.map(([lng]) => lng * cos);
  const ys = points.map(([, lat]) => -lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const k = Math.min((W - 2 * P) / spanX, (H - 2 * P) / spanY);
  const ox = P + (W - 2 * P - spanX * k) / 2;
  const oy = P + (H - 2 * P - spanY * k) / 2;
  const pts = xs.map((x, i) => [ox + (x - minX) * k, oy + (ys[i] - minY) * k] as const);
  const last = pts.length - 1;
  return (
    <div className="h-24 overflow-hidden rounded-xl bg-surface-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="size-full" aria-hidden>
        {pts.length === 1 && <circle cx={W / 2} cy={H / 2} r={6} fill={color} />}
        {pts.length > 1 && (
          <polyline
            points={pts.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeDasharray="1 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {pts.slice(1, last).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4} fill={color} />
        ))}
        {pts.length > 1 && <circle cx={pts[last][0]} cy={pts[last][1]} r={6} className="fill-surface-2" stroke={color} strokeWidth={3} />}
        {pts.length > 1 && <circle cx={pts[0][0]} cy={pts[0][1]} r={6} fill={color} />}
      </svg>
    </div>
  );
}
