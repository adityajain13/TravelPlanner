/** Atlas Journeys: the Atlas New Tab globe, in the app's green instead of gold. */
export const APP_NAME = "Atlas Journeys";

export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  // Same geometry as public/icon.svg; lines a touch heavier so it holds up at 24–32px
  const c = "var(--accent)";
  return (
    <svg width={size} height={size} viewBox="12 12 72 72" className={className} aria-hidden>
      <circle cx="48" cy="48" r="34" fill="none" stroke={c} strokeWidth="3.2" />
      <line x1="14" y1="48" x2="82" y2="48" stroke={c} strokeWidth="1.8" opacity="0.6" />
      <line x1="20" y1="32" x2="76" y2="32" stroke={c} strokeWidth="1.3" opacity="0.38" />
      <line x1="20" y1="64" x2="76" y2="64" stroke={c} strokeWidth="1.3" opacity="0.38" />
      <ellipse cx="48" cy="48" rx="16" ry="34" fill="none" stroke={c} strokeWidth="1.8" opacity="0.6" />
      <ellipse cx="48" cy="48" rx="30" ry="34" fill="none" stroke={c} strokeWidth="1.1" opacity="0.35" />
      <circle cx="48" cy="48" r="4.5" fill={c} />
    </svg>
  );
}

export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="font-display leading-none font-bold tracking-tight text-fg" style={{ fontSize: size * 0.8 }}>
        Atlas <span className="font-semibold text-muted">Journeys</span>
      </span>
    </span>
  );
}
