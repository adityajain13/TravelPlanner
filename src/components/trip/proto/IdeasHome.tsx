// PROTOTYPE (proto/trip-focus): variant B's Ideas area, the top of the funnel. Every idea not on a day
// yet, with the day it fits best and why; one tap puts it there. No separate research or triage step.
import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { SectionInfo } from "../../Section";
import { bestDay } from "../../../lib/protoFit";
import { formatChip } from "../DayChips";
import { placesIn } from "./kinds";
import type { Idea } from "./IdeasShelf";

export function IdeasHome({
  ideas,
  days,
  lists,
  readOnly,
  onAdd,
  onOpenList,
  onOpenDay,
}: {
  ideas: Idea[];
  days: SectionInfo[];
  /** Idea lists (Places to visit, Restaurants…) */
  lists: SectionInfo[];
  readOnly: boolean;
  onAdd: (itemId: string, dayKey: string) => void;
  onOpenList: (key: string) => void;
  onOpenDay: (key: string) => void;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [showPlanned, setShowPlanned] = useState(false);
  const dayInputs = useMemo(() => days.map((d) => ({ key: d.key, date: d.date!, items: d.items })), [days]);
  const shown = ideas.filter((i) => !filter || i.list === filter);
  const open = shown
    .filter((i) => !i.days.length)
    .map((idea) => ({ idea, best: bestDay(idea.item, dayInputs) }))
    .sort((a, b) => (b.best?.fit.score ?? -999) - (a.best?.fit.score ?? -999));
  const planned = shown.filter((i) => i.days.length);
  const chip = (label: string, on: boolean, onClick: () => void, n?: number) => (
    <button
      key={label}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] ${on ? "border-accent bg-accent/10 font-semibold text-fg" : "border-line text-muted hover:border-accent hover:text-fg"}`}
    >
      {label}
      {n != null && <span className="text-muted tabular-nums">{n}</span>}
    </button>
  );

  return (
    <div className="px-5 pt-6 pb-10">
      <h1 className="font-display text-[28px] leading-tight">Ideas</h1>
      <p className="mt-1 text-[14px] text-muted">
        {ideas.filter((i) => !i.days.length).length} not on a day yet · {ideas.filter((i) => i.days.length).length} planned
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {chip("All", !filter, () => setFilter(null), ideas.length)}
        {lists.map((l) => chip(l.title ?? "List", filter === l.title, () => setFilter(filter === l.title ? null : (l.title ?? null)), placesIn(l).length))}
      </div>

      <div className="mt-5 space-y-2.5">
        {!open.length && <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[14px] text-muted">Every idea here is on a day.</p>}
        {open.map(({ idea, best }) => {
          const fit = best?.fit;
          const why = fit && (fit.blockers[0]?.weight ?? 0) < 40 ? fit.reasons[0] : undefined;
          const against = fit?.blockers[0];
          return (
            <div key={idea.item.id} className="rounded-2xl border border-line bg-surface p-3.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">{idea.item.name}</p>
                  <p className="text-[12px] text-muted">{idea.list}</p>
                </div>
                {best && !readOnly && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => onAdd(idea.item.id, best.day.key)}
                      className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent hover:opacity-90"
                    >
                      <Plus className="size-3.5" /> {formatChip(best.day.date!)}
                    </button>
                    <select
                      aria-label="Add to another day"
                      value=""
                      onChange={(e) => e.target.value && onAdd(idea.item.id, e.target.value)}
                      className="w-8 cursor-pointer appearance-none rounded-full border border-line bg-transparent py-1.5 text-center text-[12px] text-muted hover:border-accent"
                      title="Another day"
                    >
                      <option value="">⋯</option>
                      {days.map((d) => (
                        <option key={d.key} value={d.key}>
                          {formatChip(d.date!)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {(why || against) && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                  {why && (
                    <span className="flex items-center gap-1.5 text-accent">
                      <Check className="size-3.5 shrink-0" /> {why.text}
                    </span>
                  )}
                  {against && (
                    <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="size-3.5 shrink-0" /> {against.text}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {planned.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowPlanned((v) => !v)} className="flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-fg">
            <ChevronDown className={`size-4 transition-transform ${showPlanned ? "" : "-rotate-90"}`} />
            On a day ({planned.length})
          </button>
          {showPlanned && (
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
              {planned.map((i) => (
                <li key={i.item.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[14px]">
                  <Check className="size-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate">{i.item.name}</span>
                  {i.days.map((k) => (
                    <button key={k} onClick={() => onOpenDay(k)} className="shrink-0 text-[12.5px] text-muted hover:text-fg hover:underline">
                      {formatChip(k.slice(4))}
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-8 border-t border-line pt-4">
        <p className="mb-1 px-1 text-[11px] font-semibold tracking-wider text-muted/80 uppercase">Lists</p>
        {lists.map((l) => (
          <button key={l.key} onClick={() => onOpenList(l.key)} className="group flex w-full items-center gap-2 rounded-xl px-1 py-2 text-left text-[14px] hover:bg-surface-2/60">
            {l.title}
            <span className="text-muted">· add or edit</span>
            <ChevronRight className="ml-auto size-4 text-muted opacity-0 group-hover:opacity-100" />
          </button>
        ))}
      </div>
      <p className="mt-4 px-1 text-[10.5px] text-muted/70">Prototype: hours and booking flags are demo values</p>
    </div>
  );
}
