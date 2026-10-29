import { useEffect, useMemo, useState } from "react";
import { loadAirports, type AirportDb } from "../lib/airports";
import { useLegs } from "../lib/routing";
import { airportPins, buildItinerary, legsByPlan, mapRoutes, mergeLegs, NO_VIA, viaLegs, withAutoTimes } from "../lib/itinerary";
import type { TripState } from "../lib/trips";

export function useItinerary(state: TripState | null, opts: { focus: string | null; dayDraft: Record<string, string>; autoOn: boolean }) {
  const { focus, dayDraft, autoOn } = opts;
  // Build sections, their items, colours and map data in one pass
  const hasFlights = !!state?.reservations.some((r) => r.type === "flight");
  const [airportDb, setAirportDb] = useState<AirportDb | null>(null);
  useEffect(() => {
    if (!hasFlights || airportDb) return;
    // After the itinerary has painted: the airport table is big and only adds pins/legs
    const go = () => loadAirports().then(setAirportDb).catch(() => undefined);
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(go, { timeout: 1500 });
    else setTimeout(go, 300);
  }, [hasFlights, airportDb]);
  const view = useMemo(() => (state ? buildItinerary(state, { focus, airportDb, dayDraft }) : null), [state, focus, airportDb, dayDraft]);
  // Airports from flight bookings: a plane pin each, and an arc per flight (never routed like a leg)
  const flights = useMemo(() => airportPins(state, view, airportDb, focus), [airportDb, state, view, focus]);
  // Route every direct leg (stop to stop, hotel, airports); cached per device
  const legResults = useLegs(view?.legs.map((l) => l.req) ?? []);
  const legsDirect = useMemo(() => legsByPlan(view?.legs ?? [], legResults), [view, legResults]);
  // Times from the direct legs only; bookings between two stops are then slotted from those times
  const timed1 = useMemo(() => withAutoTimes(view, state, autoOn, legsDirect), [view, state, autoOn, legsDirect]);
  const via = useMemo(() => (state ? viaLegs(timed1.sections, state, view?.legs ?? []) : NO_VIA), [timed1, state, view]);
  // Legs from a booking into the next stop (and from the stop before into the booking), routed the same way
  const viaResults = useLegs(via.legs.map((l) => l.req));
  const results = useMemo(() => new Map([...legResults, ...viaResults]), [legResults, viaResults]);
  const legs = useMemo(() => mergeLegs(view?.legs ?? [], via), [view, via]);
  const routes = useMemo(() => mapRoutes(legs, results, focus), [legs, results, focus]);
  const legsBySection = useMemo(() => legsByPlan(legs, results), [legs, results]);
  const timed = useMemo(() => withAutoTimes(view, state, autoOn, legsBySection, via.slots), [view, state, autoOn, legsBySection, via]);
  return { view, flights, legResults: results, routes, legsBySection, timed };
}
