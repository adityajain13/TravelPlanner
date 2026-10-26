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
}: {
  label: ReactNode;
  options: { key: string; label: string; hint?: string; icon?: ReactNode; on?: boolean }[];
  onPick: (key: string) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
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
        <ul className="absolute top-full right-0 z-10 mt-1 min-w-48 rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
          {options.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                onClick={() => (onPick(o.key), setOpen(false))}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[15px] hover:bg-surface-2 ${o.on ? "text-fg" : "text-muted"}`}
              >
                {o.icon}
                <span className="min-w-0 flex-1">
                  <span className="block">{o.label}</span>
                  {o.hint && <span className="block text-[12px] text-muted">{o.hint}</span>}
                </span>
                {o.on && <Check className="size-4 text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
