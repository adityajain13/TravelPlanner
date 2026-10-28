import type { ComponentProps, Dispatch, RefObject, SetStateAction } from "react";
import type * as Y from "yjs";
import { DayCompareHost } from "../DayCompareHost";
import { ReceiptFlow } from "../ReceiptFlow";
import type { Tab } from "../Contents";
import { scrollToId } from "../../lib/scroll";
import type { Theme } from "../../lib/theme";
import type { TripState } from "../../lib/trips";
import type { ItineraryData, PlanLegs, ReceiptTarget, TripView } from "./types";

/** Floating over the map: the receipt flow and the day compare view. */
export function MapOverlays({
  doc,
  state,
  view,
  flights,
  legResults,
  legsBySection,
  theme,
  convert,
  readOnly,
  autoOn,
  receiptFor,
  setReceiptFor,
  compareDay,
  setCompareDay,
  setDayDraft,
  setTab,
  scrollRef,
}: {
  doc: Y.Doc;
  state: TripState;
  view: TripView;
  flights: ItineraryData["flights"];
  legResults: ItineraryData["legResults"];
  legsBySection: PlanLegs;
  theme: Theme;
  convert: ComponentProps<typeof DayCompareHost>["convert"];
  readOnly: boolean;
  autoOn: boolean;
  receiptFor: ReceiptTarget | null;
  setReceiptFor: Dispatch<SetStateAction<ReceiptTarget | null>>;
  compareDay: string | null;
  setCompareDay: Dispatch<SetStateAction<string | null>>;
  setDayDraft: (date: string, draft: string | undefined) => void;
  setTab: Dispatch<SetStateAction<Tab>>;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {receiptFor && <ReceiptFlow doc={doc} state={state} file={receiptFor.file} stop={state.items.find((i) => i.id === receiptFor.itemId)} onClose={() => setReceiptFor(null)} />}
      {compareDay && (
        <DayCompareHost
          doc={doc}
          state={state}
          view={view}
          flightPins={flights.pins}
          legResults={legResults}
          legsBySection={legsBySection}
          date={compareDay}
          theme={theme}
          convert={convert}
          readOnly={readOnly}
          autoOn={autoOn}
          onShowPlan={(d) => {
            const dayKey = view.sections.find((x) => x.kind === "day" && x.date === compareDay)?.key;
            setDayDraft(compareDay, d);
            setCompareDay(null);
            setTab("plan");
            setTimeout(() => scrollToId(scrollRef.current, `sec-${dayKey}`), 60);
          }}
          onDraftShown={(d) => setDayDraft(compareDay, d)}
          onClose={() => setCompareDay(null)}
        />
      )}
    </>
  );
}
