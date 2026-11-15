// PROTOTYPE (proto/trip-focus): variant B's Ideas area, the top of the funnel.
// Capture anything in one box → a short "why" (with @mentions) → ideas in a stable order you can switch
// (Suggested picks by area, or most wanted once several people vote), ★ must-dos, votes on group trips,
// and one tap to put an idea on a day. Rough ideas (no place yet) wait at the top under "Needs a place".
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Info, Lightbulb, MapPin, MoreHorizontal, Plus, RotateCcw, Star, ThumbsUp, Trash2 } from "lucide-react";
import type { SectionInfo } from "../../Section";
import type { PlaceResult } from "../../../lib/photon";
import { bestDay, type Fit } from "../../../lib/protoFit";
import { addedByOf, clusterAreas, GROUP_LABEL, GROUP_ORDER, isMustDo, mentionParts, removedByOf, useAreaNames, votesOf, type Group } from "../../../lib/protoIdeas";
import { dtf } from "../../../lib/intl";
import { parseISODate } from "../../../lib/dates";
import { formatChip } from "../DayChips";
import { CaptureBox } from "./CaptureBox";
import { Avatar, MentionInput } from "./MentionInput";
import { placesIn } from "./kinds";
import type { Idea } from "./IdeasShelf";

type Sort = "suggested" | "area" | "fit" | "wanted" | "newest";
const SORT_LABEL: Record<Sort, string> = { suggested: "Suggested", area: "By area", fit: "Best fit", wanted: "Most wanted", newest: "Newest" };
const SORT_HELP: Record<Exclude<Sort, "suggested">, string> = {
  area: "Grouped by where they are, so you can see which ideas could make a day together. Must-dos first, then newest.",
  fit: "Ideas that slot into your planned days most easily come first: near a day's stops, open that day, and room left in it.",
  wanted: "Most 👍 from the group first, must-dos on top.",
  newest: "Most recently added first.",
};
/** "Thu 17" */
const dayShort = (iso: string) => {
  const d = parseISODate(iso);
  return `${dtf(undefined, { weekday: "short", timeZone: "UTC" }).format(d)} ${d.getUTCDate()}`;
};

export function IdeasHome({
  ideas,
  removed,
  days,
  people,
  me,
  readOnly,
  near,
  countryCode,
  justAdded,
  flash,
  onCapturePlace,
  onCaptureRough,
  onFindPlace,
  onAdd,
  onOpenDay,
  onOpen,
  onVote,
  onMustDo,
  onWhy,
  onRemove,
  onRestore,
  onDoneWhy,
}: {
  ideas: Idea[];
  /** Ideas someone removed that another person added: kept so they can be restored */
  removed: Idea[];
  days: SectionInfo[];
  people: string[];
  me: string | null;
  readOnly: boolean;
  near?: [number, number];
  countryCode?: string;
  /** The idea just captured: its "why" field opens */
  justAdded: string | null;
  /** An idea to scroll to and highlight (captured again as a duplicate) */
  flash: { id: string; n: number } | null;
  onCapturePlace: (p: PlaceResult) => void;
  onCaptureRough: (text: string) => void;
  onFindPlace: (itemId: string, p: PlaceResult) => void;
  onAdd: (itemId: string, dayKey: string) => void;
  onOpenDay: (key: string) => void;
  /** Open the place's card over the map */
  onOpen: (itemId: string) => void;
  onVote: (itemId: string) => void;
  onMustDo: (itemId: string) => void;
  onWhy: (itemId: string, text: string) => void;
  onRemove: (itemId: string) => void;
  onRestore: (itemId: string) => void;
  onDoneWhy: () => void;
}) {
  const [filter, setFilter] = useState<Group | "rough" | null>(null);
  const [sort, setSort] = useState<Sort>("suggested");
  const [showPlanned, setShowPlanned] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [finding, setFinding] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const group = people.length >= 2;
  const dayInputs = useMemo(() => days.map((d) => ({ key: d.key, date: d.date!, items: d.items })), [days]);
  const anyStops = days.some((d) => placesIn(d).length > 0);

  const open = ideas.filter((i) => !i.days.length);
  const rough = open.filter((i) => i.rough);
  const placeIdeas = open.filter((i) => !i.rough);
  const planned = ideas.filter((i) => i.days.length);
  const fits = new Map(placeIdeas.map((i) => [i.item.id, bestDay(i.item, dayInputs)]));
  const areas = useMemo(() => clusterAreas(placeIdeas.map((i) => i.item)).sort((a, b) => b.ids.length - a.ids.length), [placeIdeas.map((i) => i.item.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const areaNames = useAreaNames(areas);
  const areaOf = new Map(areas.flatMap((a) => a.ids.map((id) => [id, a.key] as const)));

  // Suggested: by area unless several people are actually voting
  const voters = new Set(ideas.flatMap((i) => votesOf(i.item)));
  const auto: Exclude<Sort, "suggested"> = group && voters.size >= 2 ? "wanted" : "area";
  const mode = sort === "suggested" ? auto : sort;

  const created = (i: Idea) => i.item.createdAt ?? 0;
  const must = (i: Idea) => (isMustDo(i.item) ? 1 : 0);
  const sorted = () => {
    const xs = [...placeIdeas];
    if (mode === "area") {
      const rank = new Map(areas.map((a, n) => [a.key, n]));
      xs.sort((a, b) => (rank.get(areaOf.get(a.item.id)!) ?? 99) - (rank.get(areaOf.get(b.item.id)!) ?? 99) || must(b) - must(a) || created(b) - created(a));
    } else if (mode === "fit") xs.sort((a, b) => (fits.get(b.item.id)?.fit.score ?? -999) - (fits.get(a.item.id)?.fit.score ?? -999));
    else if (mode === "wanted") xs.sort((a, b) => must(b) - must(a) || votesOf(b.item).length - votesOf(a.item).length || created(b) - created(a));
    else xs.sort((a, b) => created(b) - created(a));
    return xs.map((i) => i.item.id);
  };
  // Stable order: re-sort only when the sort changes or a new idea arrives, never because one was
  // put on a day or voted on (cards shouldn't jump under the pointer)
  const order = useRef<{ mode: Sort; ids: string[] }>({ mode, ids: [] });
  const openIds = new Set(placeIdeas.map((i) => i.item.id));
  const known = new Set(order.current.ids);
  if (order.current.mode !== mode || placeIdeas.some((i) => !known.has(i.item.id))) order.current = { mode, ids: sorted() };
  const byId = new Map(placeIdeas.map((i) => [i.item.id, i]));
  const ordered = order.current.ids.filter((id) => openIds.has(id)).map((id) => byId.get(id)!);

  const counts = new Map<Group, number>();
  for (const i of placeIdeas) counts.set(i.group, (counts.get(i.group) ?? 0) + 1);
  const shown = filter === "rough" ? [] : filter ? ordered.filter((i) => i.group === filter) : ordered;
  const showRough = !filter || filter === "rough";
  const whyOpen = (id: string) => editing === id || justAdded === id;
  const closeWhy = () => (setEditing(null), onDoneWhy());

  // A duplicate capture: scroll to the existing card and light it up
  useEffect(() => {
    if (!flash) return;
    setFilter(null);
    setLit(flash.id);
    requestAnimationFrame(() => document.getElementById(`idea-${flash.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
    const t = setTimeout(() => setLit(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const chip = (key: string, label: string, on: boolean, onClick: () => void, n?: number, icon?: ReactNode) => (
    <button
      key={key}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] ${
        on ? "border-accent bg-accent/10 font-semibold text-fg" : "border-line text-muted hover:border-accent hover:text-fg"
      }`}
    >
      {icon}
      {label}
      {n != null && <span className="text-muted tabular-nums">{n}</span>}
    </button>
  );

  const why = (idea: Idea) =>
    whyOpen(idea.item.id) && !readOnly ? (
      <div className="mt-2.5">
        <MentionInput
          autoFocus
          initial={idea.item.notes ?? ""}
          people={people}
          placeholder={group ? "Why this? Type @ to mention someone · Enter to save" : "Why this? · Enter to save"}
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
    ) : null;

  const mustBtn = (idea: Idea) => {
    const on = isMustDo(idea.item);
    if (readOnly && !on) return null;
    return (
      <button
        onClick={() => !readOnly && onMustDo(idea.item.id)}
        title={on ? "Must do: we'll make sure this gets on a day" : "Mark as a must do"}
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold ${on ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
      >
        <Star className={`size-3.5 ${on ? "fill-current" : ""}`} /> {on ? "Must do" : ""}
      </button>
    );
  };

  const votes = (idea: Idea) => {
    if (!group) return null;
    const v = votesOf(idea.item);
    const mine = !!me && v.includes(me);
    return (
      <div className="flex items-center gap-1">
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

  const reason = (best: ReturnType<typeof bestDay>) => {
    const fit: Fit | undefined = best?.fit;
    if (!fit || !anyStops) return null;
    const w = (fit.blockers[0]?.weight ?? 0) >= 40 ? undefined : fit.reasons[0];
    const b = fit.blockers[0];
    if (!w && !b) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        {w && (
          <span className="flex items-center gap-1.5 text-accent">
            <Check className="size-3.5 shrink-0" /> {dayShort(best!.day.date)} · {w.text}
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

  const dayPicker = (idea: Idea, label: string, primary: boolean) => (
    <select
      aria-label={label}
      title={label}
      value=""
      onChange={(e) => e.target.value && onAdd(idea.item.id, e.target.value)}
      className={
        primary
          ? "cursor-pointer appearance-none rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent hover:opacity-90"
          : "w-8 cursor-pointer appearance-none rounded-full border border-line bg-transparent py-1.5 text-center text-[12px] text-muted hover:border-accent"
      }
    >
      <option value="">{primary ? "+ Add to a day ▾" : "⋯"}</option>
      {days.map((d) => (
        <option key={d.key} value={d.key}>
          {formatChip(d.date!)}
        </option>
      ))}
    </select>
  );

  const card = (idea: Idea) => {
    const best = fits.get(idea.item.id) ?? null;
    const by = addedByOf(idea.item);
    const mustOn = isMustDo(idea.item);
    return (
      <div
        key={idea.item.id}
        id={`idea-${idea.item.id}`}
        className={`rounded-2xl border bg-surface p-3.5 transition-all duration-500 ${
          lit === idea.item.id ? "border-accent ring-4 ring-accent/20" : justAdded === idea.item.id ? "border-accent" : mustOn ? "border-amber-400/70" : "border-line"
        }`}
      >
        <div className="flex items-start gap-3">
          <button onClick={() => onOpen(idea.item.id)} className="min-w-0 flex-1 text-left">
            <p className="truncate text-[16px] font-semibold hover:underline">{idea.item.name}</p>
            <p className="text-[12px] text-muted">
              {GROUP_LABEL[idea.group]}
              {group && by && <> · {by === me ? "your idea" : `${by}'s idea`}</>}
            </p>
          </button>
          {!readOnly && (
            <div className="flex shrink-0 items-center gap-1.5">
              {anyStops && best ? (
                <>
                  <button
                    onClick={() => onAdd(idea.item.id, best.day.key)}
                    title={`Add to ${formatChip(best.day.date!)}`}
                    className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent hover:opacity-90"
                  >
                    <Plus className="size-3.5" /> {formatChip(best.day.date!)}
                  </button>
                  {dayPicker(idea, "Another day", false)}
                </>
              ) : (
                dayPicker(idea, "Add to a day", true)
              )}
              <div className="relative">
                <button onClick={() => setMenu(menu === idea.item.id ? null : idea.item.id)} aria-label="More" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
                  <MoreHorizontal className="size-4" />
                </button>
                {menu === idea.item.id && (
                  <div className="absolute top-full right-0 z-30 mt-1 w-44 rounded-xl border border-line bg-surface p-1 shadow-xl" onMouseLeave={() => setMenu(null)}>
                    {!idea.item.notes && (
                      <button onClick={() => (setEditing(idea.item.id), setMenu(null))} className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2">
                        Add why
                      </button>
                    )}
                    <button onClick={() => (onRemove(idea.item.id), setMenu(null))} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-red-500 hover:bg-surface-2">
                      <Trash2 className="size-3.5" /> Remove idea
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {reason(best)}
        {why(idea)}
        <div className="mt-2 flex items-center gap-1.5">
          {mustBtn(idea)}
          {votes(idea)}
          {!idea.item.notes && !whyOpen(idea.item.id) && !readOnly && (
            <button onClick={() => setEditing(idea.item.id)} className="ml-auto text-[12.5px] text-muted hover:text-fg">
              + Why this?
            </button>
          )}
        </div>
      </div>
    );
  };

  // In "By area", a heading wherever the area changes
  const list: ReactNode[] = [];
  let lastArea: string | undefined;
  for (const idea of shown) {
    const a = areaOf.get(idea.item.id);
    if (mode === "area" && a !== lastArea) {
      const n = shown.filter((x) => areaOf.get(x.item.id) === a).length;
      list.push(
        <p key={`h-${a}`} className="flex items-baseline gap-2 px-1 pt-3 text-[13px] font-semibold">
          <MapPin className="size-3.5 self-center text-muted" />
          {(a && areaNames.get(a)) || "Nearby"}
          <span className="font-normal text-muted">{n}</span>
        </p>,
      );
      lastArea = a;
    }
    list.push(card(idea));
  }

  return (
    <div className="px-5 pt-6 pb-16">
      <h1 className="font-display text-[28px] leading-tight">Ideas</h1>
      <p className="mt-1 text-[14px] text-muted">
        {open.length} not on a day yet · {planned.length} planned
        {placeIdeas.some((i) => isMustDo(i.item)) && <> · {placeIdeas.filter((i) => isMustDo(i.item)).length} must-dos</>}
      </p>

      {!readOnly && (
        <div className="mt-4">
          <CaptureBox near={near} countryCode={countryCode} onPlace={onCapturePlace} onRough={onCaptureRough} />
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {chip("all", "All", !filter, () => setFilter(null), open.length)}
          {rough.length > 0 && chip("rough", "Needs a place", filter === "rough", () => setFilter(filter === "rough" ? null : "rough"), rough.length, <Lightbulb className="size-3.5 text-amber-500" />)}
          {GROUP_ORDER.filter((g) => counts.get(g)).map((g) => chip(g, GROUP_LABEL[g], filter === g, () => setFilter(filter === g ? null : g), counts.get(g)))}
        </div>
        {/* Sort: Suggested picks for you; the others override it */}
        <div className="flex shrink-0 items-center gap-1 self-start text-[13px]">
          <span className="text-muted">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="cursor-pointer bg-transparent font-semibold outline-none">
            {(["suggested", "area", "fit", ...(group ? (["wanted"] as const) : []), "newest"] as Sort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
          <span className="group/info relative">
            <Info className="size-4 text-muted" />
            <span className="pointer-events-none absolute top-full right-0 z-40 mt-2 w-72 rounded-xl border border-line bg-surface p-3 text-[12.5px] leading-snug text-fg opacity-0 shadow-xl transition-opacity group-hover/info:opacity-100">
              {sort === "suggested" ? (
                <>
                  <b>Suggested</b> picks the order for you: by area while you're collecting or planning solo, most wanted once several people are voting.
                  <span className="mt-1.5 block text-muted">
                    Now: <b className="text-fg">{SORT_LABEL[auto]}</b>. {SORT_HELP[auto]}
                  </span>
                </>
              ) : (
                <>
                  <b>{SORT_LABEL[sort]}</b>: {SORT_HELP[sort as Exclude<Sort, "suggested">]}
                  {sort === "fit" && !anyStops && <span className="mt-1.5 block text-muted">Your days have no stops yet, so there's nothing to fit around.</span>}
                </>
              )}
              <span className="mt-1.5 block text-muted">The order holds still while you work; it only changes when you switch or add an idea.</span>
            </span>
          </span>
        </div>
      </div>

      {showRough && rough.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold tracking-wider text-muted/80 uppercase">
            <Lightbulb className="size-3.5 text-amber-500" /> Needs a place
          </p>
          <div className="space-y-2.5">
            {rough.map((idea) => (
              <div key={idea.item.id} id={`idea-${idea.item.id}`} className="rounded-2xl border border-dashed border-amber-400/60 bg-amber-400/[0.04] p-3.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold break-words">{idea.item.name}</p>
                    {group && addedByOf(idea.item) && <p className="text-[12px] text-muted">{addedByOf(idea.item) === me ? "your idea" : `${addedByOf(idea.item)}'s idea`}</p>}
                  </div>
                  {mustBtn(idea)}
                  {votes(idea)}
                </div>
                {why(idea)}
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
                      {!idea.item.notes && !whyOpen(idea.item.id) && (
                        <button onClick={() => setEditing(idea.item.id)} className="text-[12.5px] text-muted hover:text-fg">
                          + Why this?
                        </button>
                      )}
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

      <div className="mt-3 space-y-2.5">
        {!shown.length && !(showRough && rough.length) && (
          <p className="mt-2 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[14px] text-muted">
            {ideas.length ? "Every idea here is on a day." : "Nothing yet. Add a place, a link, or a thought above."}
          </p>
        )}
        {list}
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
                  <span className="min-w-0 flex-1 truncate">
                    {isMustDo(i.item) && <Star className="mr-1 inline size-3.5 fill-amber-400 text-amber-400" />}
                    {i.item.name}
                  </span>
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

      {removed.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowRemoved((v) => !v)} className="flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-fg">
            <ChevronDown className={`size-4 transition-transform ${showRemoved ? "" : "-rotate-90"}`} />
            Removed ({removed.length})
          </button>
          {showRemoved && (
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
              {removed.map((i) => (
                <li key={i.item.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[14px]">
                  <span className="min-w-0 flex-1 truncate text-muted line-through">{i.item.name}</span>
                  <span className="shrink-0 text-[12px] text-muted">
                    {addedByOf(i.item)}'s idea · removed by {removedByOf(i.item) === me ? "you" : removedByOf(i.item)}
                  </span>
                  {!readOnly && (
                    <button onClick={() => onRestore(i.item.id)} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-accent hover:bg-accent/10">
                      <RotateCcw className="size-3.5" /> Restore
                    </button>
                  )}
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
