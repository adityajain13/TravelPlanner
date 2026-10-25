/** Cairn: three stacked trail-marker stones. Mark only, or mark + wordmark. */
export const APP_NAME = "Cairn";

export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="96 96 320 320" className={className} aria-hidden>
      <g transform="rotate(-4 256 256)">
        <ellipse cx="256" cy="352" rx="146" ry="62" fill="#2a8553" />
        <ellipse cx="246" cy="242" rx="104" ry="46" fill="#3fae6e" />
        <ellipse cx="264" cy="150" rx="66" ry="38" fill="#5fd68b" />
      </g>
    </svg>
  );
}

export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="font-display leading-none font-bold tracking-tight text-fg" style={{ fontSize: size * 0.82 }}>
        {APP_NAME}
      </span>
    </span>
  );
}
