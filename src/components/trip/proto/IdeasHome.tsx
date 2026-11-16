// PROTOTYPE (proto/trip-focus): variant B's Ideas area, the top of the funnel.
// Capture anything in one box → a short "why" (with @mentions) → ideas in a stable order you can switch
// (Suggested picks by area, or most wanted once several people vote), ★ must-dos, votes on group trips,
// and one tap to put an idea on a day. Rough ideas (no place yet) wait at the top under "Needs a place".
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Info, Lightbulb, MapPin, RotateCcw, Star, ThumbsUp, Trash2 } from "lucide-react";
import type { SectionInfo } from "../../Section";
import type { PlaceResult } from "../../../lib/photon";
import type { Reservation } from "../../../lib/trips";
import { factsOf, fitFor, isGoodFit } from "../../../lib/protoFit";
import { addedByOf, bookingState, clusterAreas, GROUP_LABEL, GROUP_ORDER, interestOf, isMustDo, mentionParts, placeLine, removedByOf, useAreaNames, votesOf, type Answer, type Group } from "../../../lib/protoIdeas";
import { IdeaCard } from "./IdeaCard";
import { dayShort, type DayFit } from "./DayMenu";
import { formatChip } from "../DayChips";
import { CaptureBox, type Existing } from "./CaptureBox";
import { Avatar, MentionInput } from "./MentionInput";
import { placesIn } from "./kinds";
import { isTravelDay } from "../../../lib/protoSlot";
import type { Idea } from "./IdeasShelf";

type Sort = "suggested" | "area" | "fit" | "wanted" | "newest";
const SORT_LABEL: Record<Sort, string> = { suggested: "Suggested", area: "By area", fit: "Best fit", wanted: "Most wanted", newest: "Newest" };
const SORT_HELP: Record<Exclude<Sort, "suggested">, string> = {
  area: "Grouped by where they are, so you can see which ideas could make a day together. Must-dos first, then newest.",
  fit: "Ideas that slot into your planned days most easily come first: near a day's stops, open that day, and room left in it.",
  wanted: "Most 👍 from the group first, must-dos on top.",
  newest: "Most recently added first.",
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
  onAnswer,
  onOpenDay,
  onOpen,
  onVote,
  onMustDo,
  onWhy,
  onRemove,
  onRestore,
  onDoneWhy,
  onGroup,
  onFillDay,
  subtitles,
  country,
  existing,
  onExisting,
  reservations,
  selectedId,
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
  onAdd: (itemId: string, dayKey: string, opts?: import("./IdeaFitCard").AddOptions) => void;
  /** Your answer in an idea's group poll */
  onAnswer: (itemId: string, a: Answer) => void;
  onOpenDay: (key: string) => void;
  /** Open the place's card over the map */
  onOpen: (itemId: string) => void;
  onVote: (itemId: string) => void;
  onMustDo: (itemId: string) => void;
  onWhy: (itemId: string, text: string) => void;
  onRemove: (itemId: string) => void;
  onRestore: (itemId: string) => void;
  onDoneWhy: () => void;
  onGroup: (itemId: string, g: Group | undefined) => void;
  /** Put several ideas on one (empty) day */
  onFillDay: (itemIds: string[], dayKey: string) => void;
  subtitles?: Record<string, string>;
  /** The trip's country, for ideas without an address */
  country?: string;
  existing?: (text: string) => Existing[];
  onExisting?: (e: Existing) => void;
  reservations: Reservation[];
  selectedId: string | null;
}) {
  const [filter, setFilter] = useState<Group | "rough" | null>(null);
  const [sort, setSort] = useState<Sort>("suggested");
  const [showPlanned, setShowPlanned] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [finding, setFinding] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const group = people.length >= 2;
  const anyStops = days.some((d) => placesIn(d).length > 0);

  const open = ideas.filter((i) => !i.days.length);
  const rough = open.filter((i) => i.rough);
  const placeIdeas = open.filter((i) => !i.rough);
  const planned = ideas.filter((i) => i.days.length);
  const dayFits = (i: Idea): DayFit[] =>
    days.map((d, n) => ({ key: d.key, date: d.date!, title: subtitles?.[d.key] || (placesIn(d).length ? placesIn(d).map((x) => x.name).slice(0, 2).join(" · ") : `Day ${n + 1} · nothing planned`), fit: fitFor(i.item, { date: d.date!, items: d.items }), ...withStops(d) }));
  function withStops(d: SectionInfo) {
    const stops = placesIn(d).filter((x) => x.lat != null && x.lng != null).map((x) => ({ id: x.id, name: x.name, at: [x.lat!, x.lng!] as [number, number], start: x.startTime, mins: x.stay }));
    return { stops, travel: isTravelDay(stops) };
  }
  const fits = new Map(
    placeIdeas.map((i) => {
      const all = dayFits(i);
      return [i.item.id, all.reduce<DayFit | null>((b, d) => (!b || d.fit.score > b.fit.score ? d : b), null)];
    }),
  );
  const areas = useMemo(() => clusterAreas(placeIdeas.map((i) => i.item)).sort((a, b) => b.ids.length - a.ids.length), [placeIdeas.map((i) => i.item.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const areaNames = useAreaNames(areas);
  // The trip's country, else the one most ideas' addresses end in (so every card reads "Town, Country")
  const tripCountry =
    country ||
    (() => {
      const n = new Map<string, number>();
      for (const i of ideas) {
        const c = i.item.address?.split(",").at(-1)?.trim();
        if (c) n.set(c, (n.get(c) ?? 0) + 1);
      }
      return [...n].sort((x, y) => y[1] - x[1])[0]?.[0];
    })();
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
    requestAnimationFrame(() => document.getElementById(`item-${flash.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
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

  // In "By area", a heading wherever the area changes
  const list: ReactNode[] = [];
  let lastArea: string | undefined;
  for (const idea of shown) {
    const a = areaOf.get(idea.item.id);
    if (mode === "area" && a !== lastArea) {
      const n = shown.filter((x) => areaOf.get(x.item.id) === a).length;
      // A cluster of ideas nowhere near the plan, and a day with nothing on it: offer to make that its day
      const members = shown.filter((x) => areaOf.get(x.item.id) === a);
      const free = days.find((d) => !placesIn(d).length);
      const farFromPlan = anyStops && members.every((x) => !(fits.get(x.item.id) && isGoodFit(fits.get(x.item.id)!.fit)));
      const name = (a && areaNames.get(a)) || "Nearby";
      list.push(
        <div key={`h-${a}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1 pt-3 text-[13px]">
          <span className="flex items-baseline gap-2 font-semibold">
            <MapPin className="size-3.5 self-center text-muted" />
            {name}
            <span className="font-normal text-muted">{n}</span>
          </span>
          {!readOnly && free && farFromPlan && members.length >= 2 && (
            <button onClick={() => onFillDay(members.map((x) => x.item.id), free.key)} className="ml-auto rounded-full px-2 py-0.5 text-[12.5px] text-accent hover:bg-accent/10">
              {dayShort(free.date!)} is still open: make it a {name} day →
            </button>
          )}
        </div>,
      );
      lastArea = a;
    }
    list.push(
      <IdeaCard
        key={idea.item.id}
        idea={idea}
        where={placeLine(idea.item, areaNames.get(areaOf.get(idea.item.id) ?? ""), tripCountry)}
        days={dayFits(idea)}
        best={fits.get(idea.item.id) ?? null}
        people={people}
        me={me}
        readOnly={readOnly}
        highlight={lit === idea.item.id ? "lit" : justAdded === idea.item.id ? "new" : null}
        selected={selectedId === idea.item.id}
        booking={bookingState(idea.item, reservations, !!factsOf(idea.item).book)}
        startWhy={justAdded === idea.item.id}
        onAdd={(k, o) => onAdd(idea.item.id, k, o)}
        answers={interestOf(idea.item, people)}
        onAnswer={(a) => onAnswer(idea.item.id, a)}
        onOpen={() => onOpen(idea.item.id)}
        onVote={() => onVote(idea.item.id)}
        onMustDo={() => onMustDo(idea.item.id)}
        onWhy={(t) => onWhy(idea.item.id, t)}
        onGroup={(g) => onGroup(idea.item.id, g)}
        onRemove={() => onRemove(idea.item.id)}
        onDoneWhy={onDoneWhy}
      />,
    );
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
          <CaptureBox near={near} countryCode={countryCode} onPlace={onCapturePlace} onRough={onCaptureRough} existing={existing} onExisting={onExisting} />
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
              <div key={idea.item.id} id={`item-${idea.item.id}`} className="rounded-2xl border border-dashed border-amber-400/60 bg-amber-400/[0.04] p-3.5">
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
