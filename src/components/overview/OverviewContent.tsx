import type { SectionInfo } from "../Section";
import type { Line } from "../../lib/budget";
import type { TripState } from "../../lib/trips";
import type { LegState, TravelMode } from "../../lib/routing";
import { budgetPace, overviewOf, spendSeries, type OverviewTarget } from "../../lib/overview";
import { OverviewHero } from "./OverviewHero";
import { LookAtCard } from "./LookAtCard";
import { BudgetCard } from "./BudgetCard";
import { DaysGrid } from "./DaysGrid";
import { QuickLinks } from "./QuickLinks";

export interface OverviewContentProps {
  state: TripState;
  /** Day and list sections (no orphans). */
  sections: SectionInfo[];
  legs: Map<string, Map<string, { mode: TravelMode; state?: LegState }>>;
  lines: Line[];
  spent: number;
  today: string;
  readOnly: boolean;
  onGo: (t: OverviewTarget) => void;
}

/** The overview's body. Kept separate from the portal so it can be rendered on the server. */
export function OverviewContent({ state, sections, legs, lines, spent, today, readOnly, onGo }: OverviewContentProps) {
  const { meta } = state;
  const o = overviewOf(state, sections, today);
  const { pct, trendingOver } = budgetPace(meta.budget, spent, o.phase, o.dayIdx, o.dayCount);
  const series = spendSeries(lines, meta.startDate, meta.endDate, meta.budget, today);
  const currency = meta.currency ?? "CAD";
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Phones stack in this order: hero, budget, to look at, days, links. Desktop: two columns under the hero. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
        <OverviewHero meta={meta} o={o} />
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <LookAtCard look={o.look} readyCount={o.readyCount} readOnly={readOnly} onGo={onGo} />
          <QuickLinks reservations={state.reservations} onGo={onGo} />
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <BudgetCard budget={meta.budget} spent={spent} currency={currency} pct={pct} trendingOver={trendingOver} series={series} onGo={onGo} />
          <DaysGrid sections={sections} legs={legs} subtitles={meta.subtitles} onGo={onGo} />
        </div>
      </div>
    </div>
  );
}
