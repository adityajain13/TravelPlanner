// PROTOTYPE (proto/trip-focus): the "put it on a day" control. A split button when there's a real best
// day ("Add to Thu 17" | ▾), else one "Add to a day" button. The menu lists every day with how this
// idea would fit it: ✓ near something planned, ! a warning, ✕ ruled out (icons and words, not just colour).
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Check, ChevronDown, CircleAlert, X } from "lucide-react";
import type { Fit } from "../../../lib/protoFit";
import { isGoodFit } from "../../../lib/protoFit";
import { dtf } from "../../../lib/intl";
import { parseISODate } from "../../../lib/dates";

export type DayFit = { key: string; date: string; title: string; fit: Fit; /** The day's places with coordinates, in order (for the fit map) */ stops?: import("../../../lib/protoSlot").Stop[]; /** A long-distance travel day (stops >100 km apart): not a day to slot sights into */ travel?: boolean };
export const dayShort = (iso: string) => {
  const d = parseISODate(iso);
  return `${dtf(undefined, { weekday: "short", timeZone: "UTC" }).format(d)} ${d.getUTCDate()}`;
};

export function DayMenu({ days, best, booked, onAdd }: { days: DayFit[]; best: DayFit | null; /** The day it's booked for: always the suggestion */ booked?: DayFit; onAdd: (dayKey: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const suggest = booked ?? (best && isGoodFit(best.fit) ? best : null);
  const base = "flex items-center gap-1.5 bg-accent text-[12.5px] font-semibold text-on-accent hover:brightness-110";

  return (
    <div ref={box} className="relative flex shrink-0">
      {suggest ? (
        <>
          <button onClick={() => onAdd(suggest.key)} className={`${base} rounded-l-full py-1.5 pr-2.5 pl-3`} title={`Add to ${dayShort(suggest.date)}`}>
            <CalendarPlus className="size-3.5" /> Add to {dayShort(suggest.date)}
            {booked && <span className="font-normal opacity-85">· booked</span>}
          </button>
          <button onClick={() => setOpen((o) => !o)} aria-label="Pick another day" aria-expanded={open} className={`${base} rounded-r-full border-l border-on-accent/25 px-2 py-1.5`}>
            <ChevronDown className="size-3.5" />
          </button>
        </>
      ) : (
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${base} rounded-full px-3 py-1.5`}>
          <CalendarPlus className="size-3.5" /> Add to a day <ChevronDown className="size-3.5" />
        </button>
      )}
      {open && (
        <ul className="absolute top-full right-0 z-40 mt-1.5 w-72 rounded-2xl border border-line bg-surface p-1 shadow-2xl">
          {days.map((d) => {
            const why = d.fit.out ? d.fit.blockers[0] : isGoodFit(d.fit) ? d.fit.reasons[0] : d.fit.blockers[0];
            const tone = d.fit.out ? "out" : isGoodFit(d.fit) ? "good" : why ? "warn" : "none";
            return (
              <li key={d.key}>
                <button
                  disabled={d.fit.out}
                  onClick={() => (onAdd(d.key), setOpen(false))}
                  className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2 disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="mt-0.5 w-12 shrink-0 text-[12.5px] font-semibold tabular-nums">{dayShort(d.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{d.title}</span>
                    {why && (
                      <span
                        className={`mt-0.5 flex items-center gap-1 text-[11.5px] ${tone === "good" ? "text-accent" : tone === "out" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}
                      >
                        {tone === "good" ? <Check className="size-3" /> : tone === "out" ? <X className="size-3" /> : <CircleAlert className="size-3" />}
                        {why.text}
                      </span>
                    )}
                  </span>
                  {booked?.key === d.key ? (
                    <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[10px] font-bold text-accent uppercase">Booked</span>
                  ) : best?.key === d.key && suggest && !booked && <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[10px] font-bold text-accent uppercase">Best</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
