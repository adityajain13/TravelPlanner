import { Plus } from "lucide-react";
import type { SectionInfo } from "../Section";
import { dayCardOf, distanceText, formatDayShort, type OverviewTarget } from "../../lib/overview";
import type { LegState, TravelMode } from "../../lib/routing";
import { RouteSketch } from "./RouteSketch";

/** One day in "Your days": sketch, title, stop count and route length. Clicking anywhere goes to the day. */
export function DayCard({
  section,
  legs,
  subtitle,
  onGo,
}: {
  section: SectionInfo;
  legs?: Map<string, { mode: TravelMode; state?: LegState }>;
  subtitle?: string;
  onGo: (t: OverviewTarget) => void;
}) {
  const c = dayCardOf(section, legs, subtitle);
  const meta = c.distanceKm > 0 ? `${c.stops} ${c.stops === 1 ? "stop" : "stops"} · ${distanceText(c.distanceKm, c.mode)}` : `${c.stops} ${c.stops === 1 ? "stop" : "stops"}`;
  return (
    <button
      onClick={() => onGo({ kind: "section", key: section.key })}
      className={`flex w-[72%] shrink-0 snap-start flex-col rounded-2xl border p-3 text-left hover:border-accent sm:w-auto ${c.empty ? "border-dashed border-line" : "border-line bg-surface"}`}
    >
      {c.empty ? (
        <div className="grid h-24 place-items-center">
          <span className="grid size-12 place-items-center rounded-full border-2 border-dashed border-line text-muted">
            <Plus className="size-5" />
          </span>
        </div>
      ) : (
        <RouteSketch points={c.points} color={section.color} />
      )}
      <p className="mt-3 text-[12px] text-muted">
        Day {section.dayNumber} · {formatDayShort(section.date!)}
      </p>
      <p className={`truncate font-bold ${c.empty ? "text-muted" : ""}`}>{c.title}</p>
      {c.empty ? (
        <p className="mt-2 text-[13px] font-bold text-amber-400">Plan this day +</p>
      ) : (
        <>
          <p className="mt-1 truncate text-[13px] text-muted">{meta}</p>
          <p className="mt-2 text-[13px] font-bold text-accent">Explore ›</p>
        </>
      )}
    </button>
  );
}
