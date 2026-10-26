import { dtf } from "../lib/intl";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { lazy, Suspense } from "react";
import type { DateRange } from "react-day-picker";
// The calendar (react-day-picker + date-fns) loads the first time a date picker opens, not with the app
const DayPicker = lazy(() => import("react-day-picker").then((m) => ({ default: m.DayPicker })));
const CalendarLoading = () => <div className="grid h-72 w-72 place-items-center text-muted">…</div>;
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

/*
 * Themed date pickers (react-day-picker, headless) replacing the browser's native date input.
 * Values stay ISO "YYYY-MM-DD" strings everywhere in the app; Dates exist only inside the picker.
 */

export const fromISO = (s?: string) => {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return y ? new Date(y, m - 1, d) : undefined;
};
export const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (d?: Date, withYear = true) =>
  d ? dtf(undefined, { weekday: "short", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) }).format(d) : "";

const classNames = {
  root: "relative p-3 text-[14px] select-none",
  months: "flex flex-wrap gap-6",
  month: "space-y-2",
  month_caption: "flex h-9 items-center justify-center text-[15px] font-bold",
  nav: "absolute inset-x-3 top-3 z-10 flex justify-between",
  button_previous: "grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30",
  button_next: "grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30",
  month_grid: "border-collapse",
  weekdays: "",
  weekday: "h-8 w-10 text-[11px] font-bold tracking-wider text-muted uppercase",
  week: "",
  day: "group/day size-10 p-0 text-center align-middle",
  day_button:
    "mx-auto grid size-9 place-items-center rounded-full text-fg transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
  today: "font-bold [&>button]:text-accent",
  selected: "[&>button]:bg-accent [&>button]:font-bold [&>button]:text-on-accent [&>button:hover]:bg-accent",
  outside: "[&>button]:text-muted/40",
  disabled: "[&>button]:pointer-events-none [&>button]:opacity-25",
  range_start: "rounded-l-full bg-accent/15",
  range_end: "rounded-r-full bg-accent/15",
  // Middle days are also "selected"; ! wins over the selected pill styles
  range_middle: "bg-accent/15 [&>button]:!bg-transparent [&>button]:!font-normal [&>button]:!text-fg [&>button:hover]:!bg-accent/25",
  hidden: "invisible",
  footer: "mt-2",
};

const components = {
  Chevron: ({ orientation }: { orientation?: "left" | "right" | "up" | "down" }) =>
    orientation === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />,
};

/** Popover anchored to a trigger, rendered in <body> so it escapes overflow/containment. */
export function Popover({ anchor, onClose, children }: { anchor: HTMLElement; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // Positioned by writing styles directly (not React state), so it moves in the same frame as
  // the scroll instead of a frame behind, which read as shaking. The side (above/below) is chosen
  // when it opens or its size changes, never mid-scroll, so it can't flip back and forth either.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let side: "below" | "above" | null = null;
    const place = (choose: boolean) => {
      const a = anchor.getBoundingClientRect();
      if (a.bottom < 0 || a.top > window.innerHeight) return closeRef.current(); // its trigger scrolled away
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (choose || !side) side = a.bottom + 8 + h <= window.innerHeight || a.top < h + 8 ? "below" : "above";
      const top = side === "below" ? a.bottom + 8 : a.top - h - 8;
      el.style.top = `${Math.round(Math.max(8, Math.min(top, window.innerHeight - h - 8)))}px`;
      el.style.left = `${Math.round(Math.max(8, Math.min(a.left, window.innerWidth - w - 8)))}px`;
    };
    place(true);
    const grow = new ResizeObserver(() => place(true)); // e.g. the custom colour picker opening
    grow.observe(el);
    const onScroll = () => place(false);
    const onResize = () => place(true);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => (grow.disconnect(), window.removeEventListener("resize", onResize), window.removeEventListener("scroll", onScroll, true));
  }, [anchor]);

  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", down), document.removeEventListener("keydown", esc));
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      data-popover
      style={{ top: -9999, left: -9999 }}
      className="fixed z-[120] rounded-2xl border border-line bg-surface shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

const triggerBase = "flex items-center gap-2 whitespace-nowrap text-left disabled:cursor-default";

interface FieldProps {
  value?: string;
  onChange: (iso: string | undefined) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Can be emptied (optional dates). */
  clearable?: boolean;
  className?: string;
  showYear?: boolean;
}

/** Single date: a button that shows "Fri, Dec 2, 2022" and opens a calendar. */
export function DateField({ value, onChange, min, max, placeholder = "Pick a date", disabled, clearable, className = "", showYear = true }: FieldProps) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = fromISO(value);
  const lo = fromISO(min);
  const hi = fromISO(max);
  return (
    <>
      <button ref={btn} type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className={`${triggerBase} ${className}`}>
        <CalendarDays className="size-4 shrink-0 opacity-70" />
        <span className={selected ? "" : "text-muted/70"}>{selected ? fmt(selected, showYear) : placeholder}</span>
      </button>
      {open && btn.current && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)}>
          <Suspense fallback={<CalendarLoading />}>
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={selected ?? lo}
            onSelect={(d) => {
              if (d) onChange(toISO(d));
              setOpen(false);
            }}
            disabled={[...(lo ? [{ before: lo }] : []), ...(hi ? [{ after: hi }] : [])]}
            showOutsideDays
            weekStartsOn={0}
            classNames={classNames}
            components={components}
            footer={
              clearable && selected ? (
                <button type="button" onClick={() => (onChange(undefined), setOpen(false))} className="rounded-full px-3 py-1 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
                  Clear
                </button>
              ) : undefined
            }
          />
          </Suspense>
        </Popover>
      )}
    </>
  );
}

/** Trip dates: one button ("Dec 1 – Dec 7, 2022"), a two-month range calendar. */
export function DateRangeField({
  start,
  end,
  onChange,
  disabled,
  className = "",
}: {
  start?: string;
  end?: string;
  onChange: (start: string, end: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const from = fromISO(start);
  const to = fromISO(end);
  const sameYear = from && to && from.getFullYear() === to.getFullYear();
  const label =
    from && to
      ? `${dtf(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(from)} – ${dtf(undefined, { month: "short", day: "numeric", year: "numeric" }).format(to)}`
      : "Pick dates";
  const nights = from && to ? Math.round((to.getTime() - from.getTime()) / 86400000) : 0;
  const wide = typeof window !== "undefined" && window.innerWidth >= 720;

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft({ from, to });
          setOpen((o) => !o);
        }}
        className={`${triggerBase} ${className}`}
      >
        <CalendarDays className="size-4 shrink-0 opacity-80" />
        <span>{label}</span>
        {nights > 0 && <span className="opacity-60">· {nights + 1} days</span>}
      </button>
      {open && btn.current && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)}>
          <Suspense fallback={<CalendarLoading />}>
          <DayPicker
            mode="range"
            selected={draft}
            defaultMonth={from}
            numberOfMonths={wide ? 2 : 1}
            onSelect={(r, picked) => {
              // Restart the range when both ends are already set (react-day-picker would extend it)
              const next = draft?.from && draft?.to ? { from: picked, to: undefined } : r;
              setDraft(next);
              if (next?.from && next?.to) {
                onChange(toISO(next.from), toISO(next.to));
                setOpen(false);
              }
            }}
            showOutsideDays={!wide}
            classNames={classNames}
            components={components}
            footer={
              <p className="px-1 text-[12px] text-muted">{draft?.from && !draft.to ? "Now pick the last day" : "Pick the first day, then the last"}</p>
            }
          />
          </Suspense>
        </Popover>
      )}
    </>
  );
}
