import type { Dispatch, RefObject, SetStateAction } from "react";
import type * as Y from "yjs";
import { Eye } from "lucide-react";
import type { SectionTarget } from "../SectionPicker";
import type { Tab } from "../Contents";
import type { TripState } from "../../lib/trips";
import { SelectionBar } from "./SelectionBar";
import { DayChips } from "./DayChips";
import { TabNav } from "./TabNav";
import type { DayFrame, TripView } from "./types";

/** Sticky tabs bar: the multi-select actions, the Itinerary / Reservations / Budget tabs, day chips. */
export function TripTabsBar({
  doc,
  state,
  tripId,
  view,
  tab,
  setTab,
  scrollRef,
  setDayFrame,
  focus,
  setFocus,
  checked,
  checkedIds,
  clearChecked,
  targets,
  writeOf,
  selectedId,
  setSelectedId,
  onOpenContents,
}: {
  doc: Y.Doc;
  state: TripState;
  tripId: string;
  view: TripView;
  tab: Tab;
  setTab: Dispatch<SetStateAction<Tab>>;
  scrollRef: RefObject<HTMLDivElement | null>;
  setDayFrame: Dispatch<SetStateAction<DayFrame | null>>;
  focus: string | null;
  setFocus: Dispatch<SetStateAction<string | null>>;
  checked: Set<string>;
  checkedIds: string[];
  clearChecked: () => void;
  targets: SectionTarget[];
  writeOf: (key: string) => string;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  onOpenContents: () => void;
}) {
  // Tabs + day jump chips stay pinned while the plan scrolls
  return (
    <div className="sticky top-0 z-30 border-b border-line bg-bg/95 px-5 backdrop-blur">
      {checked.size > 0 && (
        <SelectionBar
          doc={doc}
          checked={checked}
          checkedIds={checkedIds}
          targets={targets}
          writeOf={writeOf}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          onClear={clearChecked}
        />
      )}
      <TabNav state={state} tripId={tripId} tab={tab} setTab={setTab} onOpenContents={onOpenContents} />
      {tab === "plan" && view.sections.some((s) => s.kind === "day") && <DayChips view={view} scrollRef={scrollRef} setDayFrame={setDayFrame} />}
      {focus && tab === "plan" && (
        <button onClick={() => setFocus(null)} className="mb-2.5 flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
          <Eye className="size-3.5" /> Showing one day on the map · show all
        </button>
      )}
    </div>
  );
}
