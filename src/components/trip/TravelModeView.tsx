import type { Dispatch, SetStateAction } from "react";
import type * as Y from "yjs";
import { TravelView } from "../TravelView";
import { SettingsDialog } from "../SettingsDialog";
import { planMapData } from "../../lib/itinerary";
import { updateItem, type TripState } from "../../lib/trips";
import type { SettingsScope } from "../../lib/settings";
import type { Theme } from "../../lib/theme";
import type { ItineraryData, PlanLegs, TimedPlan, TripView } from "./types";

/** Travel mode (phones): the light day view in place of the whole trip page, plus Settings. */
export function TravelModeView({
  doc,
  state,
  view,
  timed,
  flights,
  legResults,
  legsBySection,
  theme,
  readOnly,
  onExit,
  showSettings,
  setShowSettings,
  settingsScope,
}: {
  doc: Y.Doc;
  state: TripState;
  view: TripView;
  timed: TimedPlan;
  flights: ItineraryData["flights"];
  legResults: ItineraryData["legResults"];
  legsBySection: PlanLegs;
  theme: Theme;
  readOnly: boolean;
  onExit: () => void;
  showSettings: boolean;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  settingsScope: SettingsScope | null;
}) {
  return (
    <>
      <TravelView
        title={state.meta.title}
        days={timed.sections.filter((s) => s.kind === "day")}
        legsFor={(d) => legsBySection.get(d.writeKey ?? d.key)}
        reservations={state.reservations}
        theme={theme}
        onExit={onExit}
        onToggleCheck={readOnly ? undefined : (itemId, checkId) => {
          const it = state.items.find((x) => x.id === itemId);
          if (it) updateItem(doc, itemId, { checks: (it.checks ?? []).map((c) => (c.id === checkId ? { ...c, done: !c.done } : c)) });
        }}
        mapFor={(d) => {
          const ver = d.writeKey ?? d.key;
          const m = planMapData(view, flights.pins, legResults, ver, d.items, d.color, { includeGhost: false, numberedPins: false });
          return { pins: m.pins, routes: m.routes };
        }}
      />
      {showSettings && <SettingsDialog scope={readOnly ? null : settingsScope} onClose={() => setShowSettings(false)} />}
    </>
  );
}
