import type { ComponentProps } from "react";
import { Section } from "../Section";
import { askConfirm } from "../ConfirmDialog";
import { DEFAULT_DAY_START } from "../../lib/autoTime";
import { setMetaEntry } from "../../lib/itemActions";
import { adoptDraft, forkDay, nextDraftName } from "../../lib/trips";
import type { PlanContext, PlanSection } from "./types";

type DayOnlyProps = Pick<
  ComponentProps<typeof Section>,
  "onColor" | "onFork" | "onVersion" | "onCompare" | "onUseDraft" | "autoTimes" | "dayStart"
>;

/** The props only a day (not a list) gets: colour, drafts, auto stop times and the day's start. */
export function dayProps(c: PlanContext, s: PlanSection): DayOnlyProps {
  const { doc, state, view, readOnly, autoOn, timed, setDayDraft, setCompareDay } = c;
  return {
    onColor:
      s.kind === "day" && !readOnly
        ? (hex) => setMetaEntry(doc, state, "dayColors", s.date!, hex)
        : undefined,
    onFork:
      s.kind === "day" && !readOnly
        ? () => {
            const d = forkDay(doc, s.date!, s.writeKey ?? s.key, nextDraftName(state.drafts, s.date!));
            setDayDraft(s.date!, d);
          }
        : undefined,
    onVersion: (d) => setDayDraft(s.date!, d),
    onCompare: () => setCompareDay(s.date!),
    onUseDraft:
      s.draftId && !readOnly
        ? async () => {
            const name = s.versions?.find((v) => v.id === s.draftId)?.name ?? "this draft";
            if (
              await askConfirm({
                title: `Make “${name}” the day's plan?`,
                body: `“${s.versions?.[0]?.name}” moves to the drafts, so you can swap back any time.`,
                confirmLabel: "Use this plan",
                danger: false,
              })
            ) {
              adoptDraft(doc, s.draftId!);
              setDayDraft(s.date!, undefined);
            }
          }
        : undefined,
    autoTimes: autoOn && s.kind === "day" ? timed.info : undefined,
    dayStart:
      autoOn && s.kind === "day"
        ? {
            value: state.meta.dayStarts?.[s.date!] ?? DEFAULT_DAY_START,
            isDefault: !state.meta.dayStarts?.[s.date!],
            landed: view.landings.get(s.writeKey ?? s.key),
            onChange: readOnly
              ? undefined
              : (t) => setMetaEntry(doc, state, "dayStarts", s.date!, t),
          }
        : undefined,
  };
}
