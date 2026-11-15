// PROTOTYPE (proto/trip-focus): variant B's shelf beside a day. Ideas not on any day yet, best fit for
// this day first, each with at most one reason for and one against. "Add" puts it on the day.
import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Lightbulb, Plus } from "lucide-react";
import type { Item } from "../../../lib/trips";
import type { SectionInfo } from "../../Section";
import { bestDay, fitFor } from "../../../lib/protoFit";
import { formatChip } from "../DayChips";

export type Idea = { item: Item; list: string; days: string[] };

export function IdeasShelf({
  day,
  days,
  ideas,
  readOnly,
  onAdd,
  onPickDay,
}: {
  day: SectionInfo;
  days: SectionInfo[];
  ideas: Idea[];
  readOnly: boolean;
  onAdd: (itemId: string) => void;
  onPickDay: (key: string) => void;
}) {
  const [showPlanned, setShowPlanned] = useState(false);
  const dayInputs = useMemo(() => days.map((d) => ({ key: d.key, date: d.date!, items: d.items })), [days]);
  const open = ideas.filter((i) => !i.days.length);
  const planned = ideas.filter((i) => i.days.length);
  const ranked = open
    .map((idea) => {
      const fit = fitFor(idea.item, { date: day.date!, items: day.items });
      const best = bestDay(idea.item, dayInputs);
      // Point elsewhere only when another day is clearly better
      const better = best && best.day.key !== day.key && best.fit.score - fit.score >= 15 ? best.day : null;
      return { idea, fit, better };
    })
    .sort((a, b) => Number(a.fit.out) - Number(b.fit.out) || b.fit.score - a.fit.score);

  return (
    <div className="flex h-full w-[320px] flex-col xl:w-[340px]">
      <div className="border-b border-line px-4 py-3">
        <p className="flex items-center gap-2 font-semibold">
          <Lightbulb className="size-4 text-amber-500" /> Ideas for {formatChip(day.date!)}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted">Best fit for this day first</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 [scrollbar-width:thin]">
        {!ranked.length && <p className="px-1 py-6 text-center text-[13px] text-muted">Every idea is on a day.</p>}
        {ranked.map(({ idea, fit, better }) => {
          // A strong reason against (far away) mutes the small reasons for ("Best early")
          const why = (fit.blockers[0]?.weight ?? 0) >= 40 ? undefined : fit.reasons[0];
          const against = fit.blockers[0];
          return (
            <div key={idea.item.id} className={`rounded-2xl border border-line bg-surface p-3 ${fit.out ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{idea.item.name}</p>
                  <p className="text-[11.5px] text-muted">{idea.list}</p>
                </div>
                {!readOnly && !fit.out && (
                  <button
                    onClick={() => onAdd(idea.item.id)}
                    title={`Add to ${formatChip(day.date!)}`}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[12px] font-semibold text-accent hover:bg-accent hover:text-on-accent"
                  >
                    <Plus className="size-3.5" /> Add
                  </button>
                )}
              </div>
              {(why || against) && (
                <div className="mt-2 space-y-1 text-[12.5px]">
                  {why && !fit.out && (
                    <p className="flex items-start gap-1.5 text-accent">
                      <Check className="mt-0.5 size-3.5 shrink-0" /> {why.text}
                    </p>
                  )}
                  {against && (
                    <p className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {against.text}
                    </p>
                  )}
                </div>
              )}
              {better && (
                <button onClick={() => onPickDay(better.key)} className="mt-2 text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline">
                  Fits better on {formatChip(better.date!)} →
                </button>
              )}
            </div>
          );
        })}
        {planned.length > 0 && (
          <div className="pt-2">
            <button onClick={() => setShowPlanned((v) => !v)} className="flex w-full items-center gap-1.5 px-1 text-[12.5px] font-semibold text-muted hover:text-fg">
              <ChevronDown className={`size-4 transition-transform ${showPlanned ? "" : "-rotate-90"}`} />
              Already on a day ({planned.length})
            </button>
            {showPlanned && (
              <ul className="mt-1.5 space-y-1 px-1 text-[13px]">
                {planned.map((i) => (
                  <li key={i.item.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{i.item.name}</span>
                    <span className="shrink-0 text-[12px] text-muted">{i.days.map((k) => formatChip(k.slice(4))).join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <p className="border-t border-line px-4 py-2 text-[10.5px] text-muted/70">Prototype: hours and booking flags are demo values</p>
    </div>
  );
}
