// PROTOTYPE (proto/trip-focus): variant B's thin rail, under the trip bar: this trip's areas in funnel
// order (ideas → itinerary → prep → bookings → budget).
import { CalendarDays, Lightbulb, ListChecks, PiggyBank, Ticket } from "lucide-react";
import type { ReactNode } from "react";

export type Area = "ideas" | "itinerary" | "prep" | "bookings" | "budget";
export const AREA_LABEL: Record<Area, string> = { ideas: "Ideas", itinerary: "Itinerary", prep: "Prep", bookings: "Bookings", budget: "Budget" };
const AREA_ICON: Record<Area, ReactNode> = { ideas: <Lightbulb />, itinerary: <CalendarDays />, prep: <ListChecks />, bookings: <Ticket />, budget: <PiggyBank /> };
const ORDER: Area[] = ["ideas", "itinerary", "prep", "bookings", "budget"];


export function Rail(p: {
  area: Area;
  onArea: (a: Area) => void;
  /** Small count per area (ideas not on a day, bookings…) */
  counts: Partial<Record<Area, number>>;
}) {
  return (
    <nav aria-label="This trip" className="hidden w-[76px] shrink-0 flex-col items-center border-r border-line bg-bg py-3 md:flex">
      <div className="flex w-full flex-col gap-1 px-2">
        {ORDER.map((a) => {
          const on = p.area === a;
          const n = p.counts[a];
          return (
            <button
              key={a}
              onClick={() => p.onArea(a)}
              aria-current={on || undefined}
              className={`relative flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition-colors [&>svg]:size-5 ${
                on ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2/60 hover:text-fg"
              }`}
            >
              {AREA_ICON[a]}
              {AREA_LABEL[a]}
              {!!n && <span className="absolute top-1 right-2 min-w-4 rounded-full bg-amber-400 px-1 text-[9.5px] leading-4 font-bold text-black tabular-nums">{n}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
