import type { Dispatch, SetStateAction } from "react";
import type * as Y from "yjs";
import type { useItinerary } from "../../hooks/useItinerary";
import type { Contents } from "../Contents";
import type { dayChips } from "../Reservations";
import type { SectionTarget } from "../SectionPicker";
import type { Reservation, TripMeta, TripState } from "../../lib/trips";
import type { useUndo } from "../../lib/undo";

/** What useItinerary returns (its view is null until the trip has loaded). */
export type ItineraryData = ReturnType<typeof useItinerary>;
export type TripView = NonNullable<ItineraryData["view"]>;
export type TimedPlan = ItineraryData["timed"];
export type PlanSection = TimedPlan["sections"][number];
export type PlanLegs = ItineraryData["legsBySection"];
export type UndoHistory = ReturnType<typeof useUndo>;
export type ChipsByDay = Map<string, ReturnType<typeof dayChips>>;
/** The props the contents column and drawer share (sections, tab, scroll ref, go…). */
export type ContentsCommon = Omit<Parameters<typeof Contents>[0], "variant" | "header" | "onHide">;

export type ReceiptTarget = { file: File; itemId: string };
export type DayFrame = { ids: string[]; nonce: number };
export type PhotoFill = { done: number; total: number; added: number };
export type TripPin = { top: number; bottom: number };

/** Everything the itinerary's sections read or change, passed from the trip page as one object. */
export interface PlanContext {
  doc: Y.Doc;
  state: TripState;
  view: TripView;
  timed: TimedPlan;
  readOnly: boolean;
  autoOn: boolean;
  near: TripMeta["center"];
  focus: string | null;
  setFocus: Dispatch<SetStateAction<string | null>>;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  checked: Set<string>;
  onCheck: (itemId: string, on: boolean, shift: boolean) => void;
  targets: SectionTarget[];
  writeOf: (key: string) => string;
  sectionsOf: (itemId: string) => string[];
  toggleSection: (itemId: string, shown: string) => void;
  chipsByDay: ChipsByDay;
  chipStyle: "card" | "pill";
  legsBySection: PlanLegs;
  revealAdded: (newId: string) => void;
  setReceiptFor: Dispatch<SetStateAction<ReceiptTarget | null>>;
  setEditingRes: Dispatch<SetStateAction<Partial<Reservation> | null>>;
  setCostFor: Dispatch<SetStateAction<string | null>>;
  setCompareDay: Dispatch<SetStateAction<string | null>>;
  setDayDraft: (date: string, draft: string | undefined) => void;
}
