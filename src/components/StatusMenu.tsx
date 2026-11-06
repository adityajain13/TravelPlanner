import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  CalendarCheck,
  Check,
  CircleCheck,
  PencilRuler,
  type LucideIcon,
} from "lucide-react";
import { STATUSES, STATUS_LABEL, type TripStatus } from "../lib/tripStatus";

const ICON: Record<TripStatus, LucideIcon> = {
  planning: PencilRuler,
  booked: CalendarCheck,
  done: CircleCheck,
};

/** Planning / booked / done pill. Clickable only when onPick is given and the trip is editable. */
export function StatusMenu({
  value,
  onPick,
  disabled,
  variant,
}: {
  value: TripStatus;
  onPick?: (s: TripStatus) => void;
  disabled?: boolean;
  variant: "card" | "hero";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const interactive = !disabled && !!onPick;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !menu.current?.contains(t))
        setOpen(false);
    };
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const Icon = ICON[value];
  const card = variant === "card";
  const pill = card
    ? `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold ${value === "booked" ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"}`
    : "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-black/35 px-3.5 py-1.5 font-semibold text-white backdrop-blur hover:bg-black/55";
  const iconClass = card ? "size-3.5" : "size-4";
  const content = (
    <>
      <Icon className={iconClass} />
      {STATUS_LABEL[value]}
    </>
  );

  if (!interactive) return <span className={pill}>{content}</span>;

  return (
    <div ref={wrap} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // The menu is portalled (the trip cover clips its children): place it under the pill,
          // right-aligned so it stays on screen, and above the pill when there's no room below
          const r = e.currentTarget.getBoundingClientRect();
          const up = r.bottom + 150 > window.innerHeight;
          setPos({
            right: Math.max(8, window.innerWidth - r.right),
            ...(up
              ? { bottom: window.innerHeight - r.top + 4 }
              : { top: r.bottom + 4 }),
          });
          setOpen((o) => !o);
        }}
        className={`${pill} cursor-pointer transition-colors`}
      >
        {content}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            style={pos}
            className="fixed z-[120] min-w-40 rounded-xl border border-line bg-surface p-1 text-fg shadow-xl"
          >
            {STATUSES.map((s) => {
              const I = ICON[s];
              return (
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={s === value}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    onPick?.(s);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] hover:bg-surface-2"
                >
                  <I className="size-4" />
                  {STATUS_LABEL[s]}
                  {s === value && <Check className="ml-auto size-4" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
