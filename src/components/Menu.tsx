import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

/** Small styled dropdown, used instead of native <select> everywhere. */
export function Menu({
  label,
  options,
  onPick,
  className = "flex items-center gap-2 rounded-full py-1 pr-1 pl-2 text-[15px] font-semibold text-fg hover:bg-surface-2",
  disabled,
  ariaLabel,
  searchable,
  align = "right",
}: {
  label: ReactNode;
  options: { key: string; label: string; hint?: string; icon?: ReactNode; on?: boolean }[];
  onPick: (key: string) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Long lists: a filter box on top (type part of a name). */
  searchable?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  const shown = q.trim() ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) : options;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={className}>
        {label}
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        // At most ~half the screen tall; scrolls inside itself
        <div className={`absolute top-full z-10 mt-1 flex max-h-[min(22rem,55vh)] w-max max-w-[min(20rem,calc(100vw-2rem))] min-w-48 flex-col rounded-xl border border-line bg-surface shadow-2xl ${align === "left" ? "left-0" : "right-0"}`}>
          {searchable && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="m-1.5 mb-0 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[14px] outline-none focus:border-accent"
            />
          )}
        <ul className="min-h-0 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]">
          {shown.length === 0 && <li className="px-3 py-2 text-[14px] text-muted">No matches</li>}
          {shown.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                onClick={() => (onPick(o.key), setOpen(false))}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[15px] hover:bg-surface-2 ${o.on ? "text-fg" : "text-muted"}`}
              >
                {o.icon}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block text-[12px] text-muted">{o.hint}</span>}
                </span>
                {o.on && <Check className="size-4 text-accent" />}
              </button>
            </li>
          ))}
        </ul>
        </div>
      )}
    </div>
  );
}
