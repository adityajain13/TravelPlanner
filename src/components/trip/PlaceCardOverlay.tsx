import type { Dispatch, SetStateAction } from "react";
import type * as Y from "yjs";
import { PlacePanel, type PanelMode } from "../PlacePanel";
import type { SectionTarget } from "../SectionPicker";
import { moveItems, updateItem, type Item, type TripState } from "../../lib/trips";
import type { PlanSection, TripPin } from "./types";

/** The place card over the map for the open stop: its details, prev / next stop, moving it between days. */
export function PlaceCardOverlay({
  doc,
  state,
  readOnly,
  openItem,
  openSection,
  openIdx,
  openPlaces,
  goTo,
  setSelectedId,
  panelMode,
  setPanelMode,
  targets,
  writeOf,
  sectionsOf,
  toggleSection,
  setPanelInset,
}: {
  doc: Y.Doc;
  state: TripState;
  readOnly: boolean;
  openItem: Item | undefined;
  openSection: PlanSection | undefined;
  openIdx: number;
  openPlaces: Item[];
  goTo: (itemId: string) => void;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  panelMode: PanelMode;
  setPanelMode: (m: PanelMode) => void;
  targets: SectionTarget[];
  writeOf: (key: string) => string;
  sectionsOf: (itemId: string) => string[];
  toggleSection: (itemId: string, shown: string) => void;
  setPanelInset: Dispatch<SetStateAction<TripPin | null>>;
}) {
  // The stop before this one on its day: the card's route starts there
  const prevStop = (() => {
    if (!openItem || !openSection || openSection.kind !== "day") return undefined;
    const before = openSection.items.slice(0, openSection.items.indexOf(openItem)).filter((i) => i.lat != null && i.lng != null);
    const b = before.at(-1);
    return b ? { lat: b.lat!, lng: b.lng! } : undefined;
  })();
  if (!openItem) return null;
  return (
    <PlacePanel
      key={panelMode}
      item={openItem}
      number={openIdx >= 0 ? openIdx + 1 : undefined}
      color={openSection!.color}
      index={Math.max(0, openIdx)}
      total={Math.max(1, openPlaces.length)}
      onPrev={openIdx > 0 ? () => goTo(openPlaces[openIdx - 1].id) : undefined}
      onNext={openIdx >= 0 && openIdx < openPlaces.length - 1 ? () => goTo(openPlaces[openIdx + 1].id) : undefined}
      onClose={() => setSelectedId(null)}
      mode={panelMode}
      onMode={setPanelMode}
      targets={targets}
      onMoveTo={(k) => moveItems(doc, [openItem.id], writeOf(k))}
      sections={sectionsOf(openItem.id)}
      onToggleSection={readOnly ? undefined : (k) => toggleSection(openItem.id, k)}
      onLink={(googlePlaceId) => updateItem(doc, openItem.id, { googlePlaceId })}
      onSnapshot={(d) => updateItem(doc, openItem.id, { google: { ...d, fetchedAt: Date.now() } })}
      readOnly={readOnly}
      currency={state.meta.currency ?? "CAD"}
      from={prevStop}
      onInset={setPanelInset}
    />
  );
}
