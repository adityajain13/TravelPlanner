import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { PinMarker } from "./ItemCard";

export interface SectionTarget {
  key: string;
  label: string;
  color: string;
}

interface Props {
  targets: SectionTarget[];
  /** Section the item is in now (gets a check mark). */
  current?: string;
  onPick: (key: string) => void;
  children: ReactNode; // trigger contents
  className?: string;
  align?: "left" | "right";
  disabled?: boolean;
  title?: string;
}

/** Wanderlog's "Added ▾" menu: every day and list, with the current one ticked. */
export function SectionPicker({ targets, current, onPick, children, className = "", align = "left", disabled, title }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", close), document.removeEventListener("keydown", esc));
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()} {...(open ? { "data-popover": "" } : {})}>
      <button type="button" disabled={disabled} title={title} onClick={() => setOpen((o) => !o)} className={`flex items-center gap-1.5 ${className}`}>
        {children}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          className={`absolute top-full z-50 mt-1.5 max-h-80 min-w-52 overflow-y-auto rounded-xl border border-line bg-surface py-1.5 shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          {targets.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => (onPick(t.key), setOpen(false))}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] text-fg hover:bg-surface-2"
              >
                <PinMarker color={t.color} size={16} label="" />
                <span className="flex-1 truncate">{t.label}</span>
                {t.key === current && <Check className="size-4 text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
