import type * as Y from "yjs";
import { DayCompare } from "./DayCompare";
import type { Pin } from "./TripMap";
import type { LegState } from "../lib/routing";
import { adoptDraft, deleteDraft, draftSection, forkDay, mainPlanName, nextDraftName, renameDraft, updateMeta, type TripState } from "../lib/trips";
import { autoTimes, DEFAULT_DAY_START, fixedBlocks } from "../lib/autoTime";
import { planMapData, type Itinerary, type PlanLegs } from "../lib/itinerary";
import type { Theme } from "../lib/theme";

/** The Compare view for one day: every plan of that day side by side (open while `date` is set). */
export function DayCompareHost(p: {
  doc: Y.Doc;
  state: TripState;
  view: Itinerary;
  flightPins: Pin[];
  legResults: Map<string, LegState>;
  legsBySection: PlanLegs;
  date: string;
  theme: Theme;
  convert: (amount: number, from: string) => number | null;
  readOnly: boolean;
  autoOn: boolean;
  onShowPlan: (draftId: string | undefined) => void;
  onDraftShown: (draftId: string | undefined) => void;
  onClose: () => void;
}) {
  const sec = p.view.sections.find((x) => x.kind === "day" && x.date === p.date);
  if (!sec) return null;
  const dayKey = sec.key;
  const vers = sec.versions ?? [{ id: undefined, name: mainPlanName(p.state.meta, p.date) }];
  const of = (section: string) => p.state.items.filter((i) => i.section === section);
  return (
    <DayCompare
      date={p.date}
      color={sec.color}
      shown={sec.draftId}
      currency={p.state.meta.currency ?? "CAD"}
      theme={p.theme}
      convert={p.convert}
      readOnly={p.readOnly}
      versions={vers.map((v) => {
        const ver = v.id ? draftSection(v.id) : dayKey;
        const raw = of(ver);
        const at = p.autoOn ? autoTimes(raw, p.legsBySection.get(ver), p.state.meta.dayStarts?.[p.date] ?? DEFAULT_DAY_START, p.view.landings.get(ver), p.state.meta.travelers, fixedBlocks(p.state.reservations, p.date)) : null;
        const items = at ? raw.map((it) => (at.get(it.id) ? { ...it, startTime: at.get(it.id)!.start, endTime: at.get(it.id)!.end } : it)) : raw;
        const map = planMapData(p.view, p.flightPins, p.legResults, ver, items, sec.color, { includeGhost: true, numberedPins: true });
        return {
          id: v.id,
          name: v.name,
          items,
          legs: map.legs.map((l) => p.legResults.get(l.req.key)).filter((x) => x != null),
          pins: map.pins,
          routes: map.routes,
          ...p.view.bookends.get(ver),
        };
      })}
      onEdit={p.onShowPlan}
      onUse={(d) => {
        adoptDraft(p.doc, d);
        p.onDraftShown(undefined);
      }}
      onRename={(d, n) => (d ? renameDraft(p.doc, d, n) : updateMeta(p.doc, { planNames: { ...(p.state.meta.planNames ?? {}), [p.date]: n.trim() } }))}
      onDelete={(d) => {
        deleteDraft(p.doc, d);
        if (sec.draftId === d) p.onDraftShown(undefined);
        if (vers.length <= 2) p.onClose();
      }}
      onFork={(from) => {
        const d = forkDay(p.doc, p.date, from ? draftSection(from) : dayKey, nextDraftName(p.state.drafts, p.date));
        p.onDraftShown(d);
      }}
      onClose={p.onClose}
    />
  );
}
