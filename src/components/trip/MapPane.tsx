import { Suspense, lazy, type ReactNode } from "react";
import { PanelLeft } from "lucide-react";
import type { DayFrame, ItineraryData, PlanSection, TripView, TripPin } from "./types";
import type { Item } from "../../lib/trips";
import type { Theme } from "../../lib/theme";
// MapLibre is the heaviest dependency; load it after the plan panel is on screen.
// Start fetching the (large) map chunk as soon as the trip page loads, in parallel with the
// trip's own data, instead of only once the page has rendered
const tripMapChunk = import("../TripMap");
const TripMap = lazy(() => tripMapChunk.then((m) => ({ default: m.TripMap })));

/** The map side: the hide / show itinerary button and the map itself. Overlays go in as children. */
export function MapPane({
  planHidden,
  togglePlan,
  mobileView,
  view,
  flights,
  routes,
  flightPaths,
  selectedId,
  onSelect,
  theme,
  tripId,
  focus,
  dayFrame,
  near,
  openItem,
  openSection,
  panelInset,
  pinClick,
  mapPicked,
  children,
}: {
  planHidden: boolean;
  togglePlan: (hidden: boolean) => void;
  mobileView: "plan" | "map";
  view: TripView;
  flights: ItineraryData["flights"];
  routes: ItineraryData["routes"];
  flightPaths: "show" | "hide";
  selectedId: string | null;
  onSelect: (itemId: string) => void;
  theme: Theme;
  tripId: string | undefined;
  focus: string | null;
  dayFrame: DayFrame | null;
  near: [number, number] | undefined;
  openItem: Item | undefined;
  openSection: PlanSection | undefined;
  panelInset: TripPin | null;
  pinClick: "focus" | "card";
  mapPicked: string | null;
  children?: ReactNode;
}) {
  return (
    <main className={`relative min-h-0 flex-1 ${mobileView === "plan" ? "max-md:hidden" : ""}`}>
      {/* Hide / show the itinerary (desktop) for a full-width map */}
      <button
        onClick={() => togglePlan(!planHidden)}
        className="absolute top-3 left-3 z-30 flex h-9 items-center gap-2 rounded-full border border-line bg-surface/90 px-3 text-[13px] font-semibold text-muted shadow-lg backdrop-blur hover:text-fg max-md:hidden"
        title={planHidden ? "Show itinerary" : "Hide itinerary (full map)"}
        aria-label={planHidden ? "Show itinerary" : "Hide itinerary"}
      >
        <PanelLeft className="size-4" />
        {planHidden && <span>Itinerary</span>}
      </button>
      <Suspense fallback={<div className="h-full w-full bg-surface-2" />}>
        <TripMap
          pins={flights.pins.length ? [...view.pins, ...flights.pins] : view.pins}
          routes={flights.arcs.length && flightPaths !== "hide" ? [...flights.arcs, ...routes] : routes}
          selectedId={selectedId}
          onSelect={onSelect}
          theme={theme}
          fitKey={`${tripId}:${focus ?? "all"}`}
          frameAll={!!focus}
          frame={dayFrame}
          fallbackCenter={near}
          inset={openItem ? (panelInset ?? { top: 0, bottom: 0 }) : null}
          focusColor={openSection?.color}
          // Settings → "Just open the card": a pin clicked on the map doesn't move the map
          holdView={pinClick === "card" && !!selectedId && mapPicked === selectedId}
        />
      </Suspense>
      {children}
    </main>
  );
}
