import type { Dispatch, SetStateAction } from "react";
import { PanelLeft } from "lucide-react";
import { OfflineMapButton } from "../OfflineMapButton";
import type { Tab } from "../Contents";
import type { TripState } from "../../lib/trips";

/** The tab row: contents (narrow screens), Itinerary / Reservations / Budget, offline map button. */
export function TabNav({
  state,
  tripId,
  tab,
  setTab,
  onOpenContents,
}: {
  state: TripState;
  tripId: string;
  tab: Tab;
  setTab: Dispatch<SetStateAction<Tab>>;
  onOpenContents: () => void;
}) {
  return (
    <nav className="flex items-stretch gap-5 pt-2.5 text-[15px] font-semibold max-sm:gap-4">
      <button onClick={onOpenContents} className="-ml-1 flex items-center pb-2 text-muted hover:text-fg lg:hidden" title="Contents" aria-label="Contents">
        <PanelLeft className="size-4" />
      </button>
      {(
        [
          ["plan", "Itinerary"],
          ["bookings", `Reservations${state.reservations.length ? ` · ${state.reservations.length}` : ""}`],
          ["budget", "Budget"],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          onClick={() => setTab(k)}
          className={`shrink-0 border-b-2 pb-1.5 whitespace-nowrap transition-colors ${tab === k ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
        >
          {label}
        </button>
      ))}
      {/* Sits at the end of the tab row instead of taking its own line */}
      <div className="ml-auto flex shrink-0 items-center pb-2">
        <OfflineMapButton tripId={tripId} state={state} />
      </div>
    </nav>
  );
}
