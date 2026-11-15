// PROTOTYPE (proto/trip-focus): variant B's Ideas area, the top of the funnel.
// Capture anything in one box → a short "why" (with @mentions) right after → ideas grouped automatically,
// each with the day it fits best, votes from the trip's people, and one tap to put it on a day.
// Rough ideas (no place yet) wait at the top under "Needs a place".
import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Lightbulb, MapPin, Plus, ThumbsUp, Trash2 } from "lucide-react";
import type { SectionInfo } from "../../Section";
import type { PlaceResult } from "../../../lib/photon";
import { bestDay, type Fit } from "../../../lib/protoFit";
import { GROUP_LABEL, GROUP_ORDER, mentionParts, votesOf, type Group } from "../../../lib/protoIdeas";
import { formatChip } from "../DayChips";
import { CaptureBox } from "./CaptureBox";
import { Avatar, MentionInput } from "./MentionInput";
import type { Idea } from "./IdeasShelf";

/** Each vote counts like being a little closer: enough to reorder near-equal ideas, not to beat "closed" */
const VOTE_WEIGHT = 8;

export function IdeasHome({
  ideas,
  days,
  people,
  me,
  setMe,
  readOnly,
  near,
  countryCode,
  justAdded,
  onCapturePlace,
  onCaptureRough,
  onFindPlace,
  onAdd,
  onOpenDay,
  onOpen,
  onVote,
  onWhy,
  onRemove,
  onDoneWhy,
}: {
  ideas: Idea[];
  days: SectionInfo[];
  people: string[];
  me: string | null;
  setMe: (who: string) => void;
  readOnly: boolean;
  near?: [number, number];
  countryCode?: string;
  /** The idea just captured: its "why" field opens */
  justAdded: string | null;
  onCapturePlace: (p: PlaceResult) => void;
  onCaptureRough: (text: string) => void;
  onFindPlace: (itemId: string, p: PlaceResult) => void;
  onAdd: (itemId: string, dayKey: string) => void;
  onOpenDay: (key: string) => void;
  /** Open the place's card over the map */
  onOpen: (itemId: string) => void;
  onVote: (itemId: string) => void;
  onWhy: (itemId: string, text: string) => void;
  onRemove: (itemId: string) => void;
  onDoneWhy: () => void;
}) {
  const [filter, setFilter] = useState<Group | "rough" | null>(null);
  const [showPlanned, setShowPlanned] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [finding, setFinding] = useState<string | null>(null);
  const dayInputs = useMemo(() => days.map((d) => ({ key: d.key, date: d.date!, items: d.items })), [days]);

  const open = ideas.filter((i) => !i.days.length);
  const rough = open.filter((i) => i.rough);
  const places = open
    .filter((i) => !i.rough)
    .map((idea) => {
      const best = bestDay(idea.item, dayInputs);
      return { idea, best, score: (best?.fit.score ?? -999) + votesOf(idea.item).length * VOTE_WEIGHT };
    })
    .sort((a, b) => b.score - a.score);
  const planned = ideas.filter((i) => i.days.length);
  const counts = new Map<Group, number>();
  for (const p of places) counts.set(p.idea.group, (counts.get(p.idea.group) ?? 0) + 1);
  const shownPlaces = filter && filter !== "rough" ? places.filter((p) => p.idea.group === filter) : filter === "rough" ? [] : places;
  const showRough = !filter || filter === "rough";
  const whyOpen = (id: string) => editing === id || justAdded === id;
  const closeWhy = () => (setEditing(null), onDoneWhy());

  const chip = (key: string, label: string, on: boolean, onClick: () => void, n?: number, tone?: "amber") => (
    <button
      key={key}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] ${
        on ? "border-accent bg-accent/10 font-semibold text-fg" : "border-line text-muted hover:border-accent hover:text-fg"
      }`}
    >
      {tone === "amber" && <Lightbulb className="size-3.5 text-amber-500" />}
      {label}
      {n != null && <span className="text-muted tabular-nums">{n}</span>}
    </button>
  );

  // The why line: shown with mentions highlighted, or an inline editor
  const why = (idea: Idea, prompt: boolean) =>
    whyOpen(idea.item.id) && !readOnly ? (
      <div className="mt-2.5">
        <MentionInput
          autoFocus
          initial={idea.item.notes ?? ""}
          people={people}
          placeholder={people.length ? "Why this? Type @ to mention someone · Enter to save" : "Why this? · Enter to save"}
          onSave={(t) => (t !== (idea.item.notes ?? "") && onWhy(idea.item.id, t), closeWhy())}
          onCancel={closeWhy}
        />
      </div>
    ) : idea.item.notes ? (
      <button onClick={() => !readOnly && setEditing(idea.item.id)} className="mt-2 block w-full text-left text-[13.5px] leading-snug text-fg/85 italic">
        “
        {mentionParts(idea.item.notes, people).map((part, i) =>
          part.who ? (
            <span key={i} className="rounded bg-accent/12 px-1 font-semibold text-accent not-italic">
              {part.text}
            </span>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
        ”
      </button>
    ) : (
      prompt &&
      !readOnly && (
        <button onClick={() => setEditing(idea.item.id)} className="mt-2 text-[12.5px] text-muted hover:text-fg">
          + Why this?
        </button>
      )
    );

  const voters = (idea: Idea) => {
    const v = votesOf(idea.item);
    const mine = !!me && v.includes(me);
    return (
      <div className="flex items-center gap-1.5">
        {v.length > 0 && (
          <span className="flex -space-x-1.5" title={`Wanted by ${v.join(", ")}`}>
            {v.map((n) => (
              <Avatar key={n} name={n} />
            ))}
          </span>
        )}
        {me && !readOnly && (
          <button
            onClick={() => onVote(idea.item.id)}
            title={mine ? "Remove your vote" : "I want to do this"}
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold ${mine ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
          >
            <ThumbsUp className="size-3.5" /> {v.length || ""}
          </button>
        )}
      </div>
    );
  };

  const reasons = (fit?: Fit) => {
    if (!fit) return null;
    const w = (fit.blockers[0]?.weight ?? 0) >= 40 ? undefined : fit.reasons[0];
    const b = fit.blockers[0];
    if (!w && !b) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        {w && (
          <span className="flex items-center gap-1.5 text-accent">
            <Check className="size-3.5 shrink-0" /> {w.text}
          </span>
        )}
        {b && (
          <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5 shrink-0" /> {b.text}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="px-5 pt-6 pb-16">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] leading-tight">Ideas</h1>
          <p className="mt-1 text-[14px] text-muted">
            {open.length} not on a day yet · {planned.length} planned
          </p>
        </div>
        {people.length > 0 && (
          <label className="mt-1 flex shrink-0 items-center gap-1.5 text-[12px] text-muted" title="Prototype: who you are on this trip (for votes)">
            {me && <Avatar name={me} />}
            <select value={me ?? ""} onChange={(e) => setMe(e.target.value)} className="cursor-pointer bg-transparent font-semibold text-fg outline-none">
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!readOnly && (
        <div className="mt-4">
          <CaptureBox near={near} countryCode={countryCode} onPlace={onCapturePlace} onRough={onCaptureRough} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {chip("all", "All", !filter, () => setFilter(null), open.length)}
        {rough.length > 0 && chip("rough", "Needs a place", filter === "rough", () => setFilter(filter === "rough" ? null : "rough"), rough.length, "amber")}
        {GROUP_ORDER.filter((g) => counts.get(g)).map((g) => chip(g, GROUP_LABEL[g], filter === g, () => setFilter(filter === g ? null : g), counts.get(g)))}
      </div>

      {/* Rough ideas wait at the top until they have a place */}
      {showRough && rough.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold tracking-wider text-muted/80 uppercase">
            <Lightbulb className="size-3.5 text-amber-500" /> Needs a place
          </p>
          <div className="space-y-2.5">
            {rough.map((idea) => (
              <div key={idea.item.id} className="rounded-2xl border border-dashed border-amber-400/60 bg-amber-400/[0.04] p-3.5">
                <div className="flex items-start gap-3">
                  <p className="min-w-0 flex-1 text-[15px] font-semibold break-words">{idea.item.name}</p>
                  {voters(idea)}
                </div>
                {why(idea, true)}
                {finding === idea.item.id ? (
                  <div className="mt-2.5">
                    <CaptureBox
                      autoFocus
                      placesOnly
                      initial={/^https?:/i.test(idea.item.name) ? "" : idea.item.name}
                      placeholder="Search for the place"
                      near={near}
                      countryCode={countryCode}
                      onPlace={(p) => (onFindPlace(idea.item.id, p), setFinding(null))}
                      onCancel={() => setFinding(null)}
                    />
                  </div>
                ) : (
                  !readOnly && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <button onClick={() => setFinding(idea.item.id)} className="flex items-center gap-1 rounded-full bg-amber-400/20 px-3 py-1 text-[12.5px] font-semibold text-amber-700 hover:bg-amber-400/30 dark:text-amber-300">
                        <MapPin className="size-3.5" /> Find a place
                      </button>
                      <button onClick={() => onRemove(idea.item.id)} title="Remove" className="ml-auto grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-red-500">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 space-y-2.5">
        {!shownPlaces.length && !(showRough && rough.length) && (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[14px] text-muted">Every idea here is on a day.</p>
        )}
        {shownPlaces.map(({ idea, best }) => (
          <div key={idea.item.id} className={`rounded-2xl border bg-surface p-3.5 transition-colors ${justAdded === idea.item.id ? "border-accent" : "border-line"}`}>
            <div className="flex items-start gap-3">
              <button onClick={() => onOpen(idea.item.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[16px] font-semibold hover:underline">{idea.item.name}</p>
                <p className="text-[12px] text-muted">{GROUP_LABEL[idea.group]}</p>
              </button>
              {best && !readOnly && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => onAdd(idea.item.id, best.day.key)}
                    title={`Add to ${formatChip(best.day.date!)}`}
                    className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent hover:opacity-90"
                  >
                    <Plus className="size-3.5" /> {formatChip(best.day.date!)}
                  </button>
                  <select
                    aria-label="Add to another day"
                    title="Another day"
                    value=""
                    onChange={(e) => e.target.value && onAdd(idea.item.id, e.target.value)}
                    className="w-8 cursor-pointer appearance-none rounded-full border border-line bg-transparent py-1.5 text-center text-[12px] text-muted hover:border-accent"
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
            {reasons(best?.fit)}
            {why(idea, false)}
            <div className="mt-2 flex items-center gap-2">
              {voters(idea)}
              {!idea.item.notes && !whyOpen(idea.item.id) && !readOnly && (
                <button onClick={() => setEditing(idea.item.id)} className="ml-auto text-[12.5px] text-muted hover:text-fg">
                  + Why this?
                </button>
              )}
            </div>
          </div>
        ))}
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
                  {votesOf(i.item).length > 0 && (
                    <span className="flex -space-x-1.5">
                      {votesOf(i.item).map((n) => (
                        <Avatar key={n} name={n} size={18} />
                      ))}
                    </span>
                  )}
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
      <p className="mt-6 text-[10.5px] text-muted/70">Prototype: hours and booking flags are demo values</p>
    </div>
  );
}
