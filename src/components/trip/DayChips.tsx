import type { Dispatch, RefObject, SetStateAction } from "react";
import { ChipScroller } from "../ChipScroller";
import { scrollToId } from "../../lib/scroll";
import { dtf } from "../../lib/intl";
import { parseISODate } from "../../lib/dates";
import type { DayFrame, TripView } from "./types";

export const formatChip = (d: string) =>
  dtf(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(parseISODate(d));

/** Jump chips for each day: scroll to the day and frame its stops on the map. */
export function DayChips({
  view,
  scrollRef,
  setDayFrame,
}: {
  view: TripView;
  scrollRef: RefObject<HTMLDivElement | null>;
  setDayFrame: Dispatch<SetStateAction<DayFrame | null>>;
}) {
  return (
    <ChipScroller className="pt-2 pb-2.5">
      {view.sections
        .filter((s) => s.kind === "day")
        .map((s) => (
          <button
            key={s.key}
            onClick={() => {
              scrollToId(scrollRef.current, `sec-${s.key}`);
              const ids = s.items.filter((i) => i.lat != null && i.lng != null).map((i) => i.id);
              if (ids.length) setDayFrame((f) => ({ ids, nonce: (f?.nonce ?? 0) + 1 }));
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-fg"
          >
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {formatChip(s.date!)}
          </button>
        ))}
    </ChipScroller>
  );
}
