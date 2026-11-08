import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  /** Multi-select: every section ticked here; picks toggle and the menu stays open. */
  selected?: string[];
  /** Single mode: the days/lists the selected items are on now (marked "here"). */
  here?: string[];
  children: ReactNode; // trigger contents
  className?: string;
  align?: "left" | "right";
  /** Open the list above the trigger (a trigger near the bottom of the screen). */
  up?: boolean;
  disabled?: boolean;
  title?: string;
}

/** Wanderlog's "Added ▾" menu: every day and list, with the current one ticked. */
export function SectionPicker({ targets, current, onPick, children, className = "", align = "left", up, disabled, title, selected, here }: Props) {
  const multi = !!selected;
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", close), document.removeEventListener("keydown", esc));
  }, [open]);
  // Keep the list on screen: a right-aligned list on a phone can run off the left edge (and vice versa)
  useLayoutEffect(() => {
    if (!open) {
      setNudge(0);
      return;
    }
    const r = listRef.current?.getBoundingClientRect();
    if (!r) return;
    if (r.left < 8) setNudge(8 - r.left);
    else if (r.right > window.innerWidth - 8) setNudge(window.innerWidth - 8 - r.right);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()} {...(open ? { "data-popover": "" } : {})}>
      <button type="button" disabled={disabled} title={title} onClick={() => setOpen((o) => !o)} className={`flex items-center gap-1.5 ${className}`}>
        {children}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          ref={listRef}
          aria-multiselectable={multi || undefined}
          style={{ transform: `translateX(${nudge}px)` }}
          className={`absolute ${up ? "bottom-full mb-1.5" : "top-full mt-1.5"} z-50 max-h-80 min-w-52 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-line bg-surface py-1.5 shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          {targets.map((t) => {
            // The only ticked day or list can't be unticked: it's the last copy
            const lastOne = multi && selected!.length === 1 && selected![0] === t.key;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  title={lastOne ? "It stays on at least one day or list" : undefined}
                  onClick={() => {
                    if (lastOne) return;
                    onPick(t.key);
                    if (!multi) setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] text-fg hover:bg-surface-2"
                >
                  <PinMarker color={t.color} size={16} label="" />
                  <span className="flex-1 truncate">{t.label}</span>
                  {multi ? (
                    <span
                      className={`grid size-[18px] place-items-center rounded-[5px] border ${
                        selected!.includes(t.key) ? (lastOne ? "border-line bg-surface-2 text-muted" : "border-accent bg-accent text-on-accent") : "border-line"
                      }`}
                    >
                      {selected!.includes(t.key) && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                  ) : (
                    <>
                      {here?.includes(t.key) && <span className="text-[12px] font-normal text-muted">here</span>}
                      {t.key === current && <Check className="size-4 text-accent" />}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
