import type { SectionInfo } from "../Section";
import { placesOf, type OverviewTarget } from "../../lib/overview";
import type { LegState, TravelMode } from "../../lib/routing";
import { Card } from "./Card";
import { DayCard } from "./DayCard";

type Legs = Map<string, Map<string, { mode: TravelMode; state?: LegState }>>;

/** Every day as a card: a horizontal swipe row on phones, a grid from small screens up. */
export function DaysGrid({ sections, legs, subtitles, onGo }: { sections: SectionInfo[]; legs: Legs; subtitles?: Record<string, string>; onGo: (t: OverviewTarget) => void }) {
  const days = sections.filter((s) => s.kind === "day");
  const stops = days.reduce((n, s) => n + placesOf(s).length, 0);
  return (
    <Card title="Your days" aside={`${stops} stops · ${days.length} days`} className="order-4">
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
        {days.map((s) => (
          <DayCard key={s.key} section={s} legs={legs.get(s.key)} subtitle={subtitles?.[s.key]} onGo={onGo} />
        ))}
      </div>
    </Card>
  );
}
