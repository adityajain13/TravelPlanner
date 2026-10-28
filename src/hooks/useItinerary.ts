import { useEffect, useMemo, useState } from "react";
import { loadAirports, type AirportDb } from "../lib/airports";
import { useLegs } from "../lib/routing";
import { airportPins, buildItinerary, legsByPlan, mapRoutes, withAutoTimes } from "../lib/itinerary";
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
  // Route every leg (cached per device); draw road/path/transit geometry, straight dashes until known
  const legResults = useLegs(view?.legs.map((l) => l.req) ?? []);
  const routes = useMemo(() => mapRoutes(view?.legs ?? [], legResults, focus), [view, legResults, focus]);
  const legsBySection = useMemo(() => legsByPlan(view?.legs ?? [], legResults), [view, legResults]);
  const timed = useMemo(() => withAutoTimes(view, state, autoOn, legsBySection), [view, state, autoOn, legsBySection]);
  return { view, flights, legResults, routes, legsBySection, timed };
}
