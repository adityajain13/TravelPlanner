// PROTOTYPE (proto/trip-focus): the idea card, "evidence | decision" (round 7 of /proto/cards, on real trip data).
// Left = what you weigh: the place, How it fits (the week in green/red, and open, where it would land in the chosen
// day; then every ✓ / ⚠ / ✕ reason, once), comments. The card picks the DAY; times are refined on the itinerary.
// Right = what you act on: your answer in the group poll, the proposed day, the button. On wide cards the two sit
// side by side; under 600px (the card's own width) they stack. Adding when someone said "Not for me" asks who's going.
import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, CircleAlert, ExternalLink, ImageIcon, Map as MapIcon, Star, Ticket, Trash2, X } from "lucide-react";
import { googleMapsLink } from "../../../lib/photon";
import { addedByOf, autoGroupOf, GROUP_LABEL, GROUP_ORDER, hasOwnGroup, mentionParts, type Answer, type BookingState, type Group } from "../../../lib/protoIdeas";
import { factsOf } from "../../../lib/protoFit";
import { placeDetails } from "../../../lib/protoPlaceDemo";
import { parseISODate } from "../../../lib/dates";
import { bestSlot, kmBetween, kmText, slotText, type LatLng, type Slot, type Stop } from "../../../lib/protoSlot";
import { Avatar, MentionInput } from "./MentionInput";
import { dayShort, type DayFit } from "./DayMenu";
import type { Idea } from "./IdeasShelf";

const POLL: [string, string, string] = ["Yes!", "Sure", "Not for me"];
const C = { must: "#178a7c", along: "#8f9a95", out: "#c8604a" };

export type AddOptions = { who?: string[]; afterId?: string | null; /** "HH:MM", sets the stop's start time */ time?: string };

type DayState = "fits" | "far" | "free" | "closed" | "travel";
type Fitted = { d: DayFit; state: DayState; slot?: Slot; stops: Stop[] };

const Cap = ({ children }: { children: ReactNode }) => <p className="mb-1 text-[10.5px] font-semibold tracking-wider text-muted uppercase">{children}</p>;

/** Grows in place: height (grid rows 0fr → 1fr) and opacity, so opening only adds below what's there */
function Grow({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} aria-hidden={!open}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

const names = (ps: string[], me: string | null, mid = false) => {
  const n = ps.map((p) => (p === me ? "you" : p));
  const t = n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n.at(-1)}` : (n[0] ?? "");
  return mid || !t ? t : t[0].toUpperCase() + t.slice(1);
};

const hmOf = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const clockOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
const BUFFER = 20; // minutes to get between stops (straight-line; routing comes later)

/** Read-only: the chosen day with the idea where it would land. With times set on the day, also the free gaps and
    what it would push later; without, just the order. Nothing here is a control: the day is picked in the week strip,
    the time on the itinerary. */
function DayPreview({ f, name, mins, fixed, open }: { f: Fitted; name: string; mins: number; fixed?: string; open: boolean }) {
  // Folded: only the suggested slot shows (day and time, when known). Open: the rest of the day grows in around it.
  const st = f.stops;
  const at = !f.slot ? 0 : f.slot.kind === "start" ? 0 : f.slot.kind === "between" ? f.slot.i + 1 : st.length;
  const timed = st.length > 0 && st.every((x) => x.start);
  const more = (key: string, node: ReactNode) => (
    <Grow key={key} open={open}>
      {node}
    </Grow>
  );
  const row = (key: string, time: string, body: ReactNode, note?: string) =>
    more(
      key,
      <div className="flex items-start gap-2.5 px-2.5 py-1">
        <span className="w-11 shrink-0 text-[11.5px] text-muted tabular-nums">{time}</span>
        <span className="min-w-0 text-[12.5px] text-fg/85">
          {body}
          {note && <span className="text-amber-700 dark:text-amber-300"> · {note}</span>}
        </span>
      </div>,
    );
  // The suggestion: the accent colour (a recommendation, not a warning)
  const here = (time: string, until?: string) => (
    <div key="here" className="flex items-start gap-2.5 rounded-lg bg-accent/10 px-2.5 py-1.5" style={{ boxShadow: "inset 3px 0 0 var(--accent)" }}>
      <span className="w-11 shrink-0 text-[11.5px] font-semibold text-accent tabular-nums">{time || dayShort(f.d.date)}</span>
      <span className="min-w-0 text-[12.5px]">
        <span className="font-semibold">{name}</span>
        <span className="text-muted"> would go here{until ? ` · until ${until}` : ""}</span>
      </span>
    </div>
  );
  const note = (key: string, text: string) => more(key, <p className="mt-1 px-2.5 text-[11.5px] text-muted">{text}</p>);
  if (!st.length) return <div>{[here(fixed ?? ""), note("none", `Nothing else planned on ${dayShort(f.d.date)} yet`)]}</div>;
  if (!timed) {
    const rows: ReactNode[] = st.map((x, i) => row(x.id, "", <><span className="mr-1.5 text-muted tabular-nums">{i + 1}</span>{x.name}</>));
    rows.splice(at, 0, here(fixed ?? ""));
    rows.push(note("untimed", `No times set on ${dayShort(f.d.date)} yet: set them on the itinerary`));
    return <div>{rows}</div>;
  }
  const times = st.map((x) => ({ start: hmOf(x.start!), end: hmOf(x.start!) + (x.mins ?? 60) }));
  const start = fixed ? hmOf(fixed) : at === 0 ? times[0].start - BUFFER - mins : times[at - 1].end + BUFFER;
  const end = start + mins;
  // Ripple: each later stop starts no earlier than the one before it ends (plus travel); free time absorbs the delay
  const shifts: number[] = [];
  let prevEndAfter = end;
  for (let i = 0; i < st.length; i++) {
    if (i < at) {
      shifts.push(0);
      continue;
    }
    const s0 = Math.max(times[i].start, prevEndAfter + BUFFER);
    shifts.push(s0 - times[i].start);
    prevEndAfter = s0 + (times[i].end - times[i].start);
  }
  const gap = (key: string, a: number, b: number) =>
    b - a >= 30 &&
    more(
      key,
      <div className="flex items-center gap-2.5 px-2.5 py-0.5 text-[11.5px] text-muted">
        <span className="w-11 shrink-0 tabular-nums">{clockOf(a)}</span>
        <span className="h-px flex-1 border-t border-dashed border-line" />
        <span>free · {Math.round((b - a) / 30) / 2} h</span>
      </div>,
    );
  const rows: ReactNode[] = [];
  st.forEach((x, i) => {
    const shift = shifts[i];
    const prevEnd = i === 0 ? 9 * 60 : i === at ? times[i - 1].end : times[i - 1].end + shifts[i - 1];
    if (i === at) rows.push(gap(`gb${i}`, prevEnd, start), here(clockOf(start), clockOf(end)), gap(`ga${i}`, end + BUFFER, times[i].start + shift));
    else rows.push(gap(`g${i}`, prevEnd, times[i].start + shift));
    rows.push(row(x.id, clockOf(times[i].start + shift), <><span className="mr-1.5 text-muted tabular-nums">{i + 1}</span>{x.name}</>, shift ? `${Math.round(shift / 5) * 5} min later` : undefined));
  });
  if (at >= st.length) rows.push(gap("gb-end", times[st.length - 1].end, start), here(clockOf(start), clockOf(end)));
  return <div>{rows}</div>;
}

/** The group poll: three rows that are both the result and your vote (tap again to clear) */
function Poll({ answers, me, open, readOnly, onAnswer }: { answers: Record<string, Answer>; me: string | null; open: boolean; readOnly: boolean; onAnswer: (a: Answer) => void }) {
  const people = Object.keys(answers);
  const n = people.length;
  const solo = n <= 1;
  const whoIs = (a: Answer) => {
    const ps = people.filter((p) => answers[p] === a);
    return [...ps.filter((p) => p === me), ...ps.filter((p) => p !== me)];
  };
  const rows: { a: -1 | 0 | 1; label: string; col: string; icon: ReactNode }[] = [
    { a: 1, label: POLL[0], col: C.must, icon: <Star className="size-3 fill-current" /> },
    { a: 0, label: POLL[1], col: C.along, icon: <Check className="size-3" strokeWidth={3} /> },
    { a: -1, label: POLL[2], col: C.out, icon: <X className="size-3" strokeWidth={3} /> },
  ];
  const waiting = whoIs(null);
  return (
    <div>
      <Cap>{solo ? "Your take" : `Group · ${n}`}</Cap>
      <ul className="space-y-1">
        {rows.map((r) => {
          const who = whoIs(r.a);
          const mine = !!me && answers[me] === r.a;
          return (
            <li key={r.a}>
              <button
                disabled={readOnly || !me}
                onClick={() => onAnswer(mine ? null : r.a)}
                aria-pressed={mine}
                className={`-mx-1.5 block w-[calc(100%+12px)] rounded-lg px-1.5 py-1 text-left transition-colors ${mine ? "bg-surface" : "hover:bg-surface/70"}`}
              >
                <span className="flex h-5 items-center gap-1.5 text-[12.5px]">
                  <span className="grid size-4 shrink-0 place-items-center rounded-full" style={mine ? { background: r.col, color: "#fff" } : { color: r.col }}>
                    {r.icon}
                  </span>
                  <span className={mine ? "font-semibold" : ""}>{r.label}</span>
                  {!solo && <span className="text-muted">· {who.length}</span>}
                  {!solo && who.length > 0 && (
                    <span className="ml-auto flex items-center -space-x-1.5">
                      {who.slice(0, 4).map((p) => (
                        <span key={p} className={p === me ? "rounded-full ring-2 ring-accent" : ""}>
                          <Avatar name={p} size={16} />
                        </span>
                      ))}
                      {who.length > 4 && <span className="pl-2 text-[11px] text-muted">+{who.length - 4}</span>}
                    </span>
                  )}
                </span>
                {!solo && (
                  <span className="mt-1 block h-[3px] rounded-full bg-fg/8">
                    <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${(who.length / n) * 100}%`, background: r.col }} />
                  </span>
                )}
                {!solo && who.length > 0 && (
                  <Grow open={open}>
                    <span className="block pt-1 text-[11.5px] text-muted">{who.map((p) => (p === me ? "You" : p)).join(", ")}</span>
                  </Grow>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!solo && waiting.length > 0 && (
        <p className="mt-1.5 text-[11.5px] text-muted">
          {open ? `Waiting on ${waiting.map((p) => (p === me ? "you" : p)).join(", ")}` : `${waiting.length} ${waiting.length === 1 ? "hasn't" : "haven't"} answered`}
        </p>
      )}
    </div>
  );
}

/** Adding when someone said "Not for me": who's going, in plain words. The day splits by itself once a stop has `who`. */
function WhoGoing({ name, f, answers, me, visit, onAdd, onCancel }: { name: string; f: Fitted; answers: Record<string, Answer>; me: string | null; visit?: string; onAdd: (who: string[]) => void; onCancel: () => void }) {
  const people = [...(me ? [me] : []), ...Object.keys(answers).filter((p) => p !== me)];
  const [going, setGoing] = useState<string[]>(people.filter((p) => answers[p] !== -1));
  const out = people.filter((p) => !going.includes(p));
  const everyone = out.length === 0;
  const day = dayShort(f.d.date);
  const s = f.slot;
  const st = f.stops;
  const preview = everyone
    ? `Everyone goes to ${name} on ${day}. No split.`
    : !s || !st.length
      ? `On ${day}, ${names(going, me, true)} go to ${name}${visit ? ` (${visit})` : ""}. ${names(out, me)} ${out.length > 1 || out[0] === me ? "have" : "has"} the day free.`
      : s.kind === "between"
        ? `After ${s.i + 1} ${st[s.i].name}, ${names(going, me, true)} go to ${name}${visit ? ` (${visit})` : ""}. ${names(out, me)} ${out.length > 1 || out[0] === me ? "have" : "has"} free time. Everyone meets again at ${s.i + 2} ${st[s.i + 1].name}.`
        : s.kind === "start"
          ? `${names(going, me)} start ${day} at ${name}. ${names(out, me)} ${out.length > 1 || out[0] === me ? "join" : "joins"} you at 1 ${st[0].name}.`
          : `After ${st.length} ${st[st.length - 1].name}, ${names(going, me, true)} go to ${name}. ${names(out, me)} ${out.length > 1 || out[0] === me ? "are" : "is"} done for the day.`;
  const notes: { warn: boolean; text: string }[] = [];
  if (!going.length) notes.push({ warn: true, text: "Pick at least one person" });
  if (going.length && me && !going.includes(me)) notes.push({ warn: false, text: "You're not going: it'll show on your day as their plan" });
  const unanswered = going.filter((p) => answers[p] === null && p !== me);
  if (unanswered.length) notes.push({ warn: false, text: `${names(unanswered, me)} ${unanswered.length > 1 ? "haven't" : "hasn't"} answered yet. You can change who's going later.` });
  const label = (a: Answer) => (a === 1 ? POLL[0] : a === 0 ? POLL[1] : a === -1 ? POLL[2] : "hasn't answered");
  return (
    <div className="absolute right-2 bottom-11 z-30 w-[min(360px,calc(100%-16px))] rounded-2xl border border-line bg-surface p-4 text-[13px] shadow-2xl" role="dialog" aria-label="Who's going?">
      <p className="text-[14px] font-semibold">
        Who's going to {name} on {day}?
      </p>
      <ul className="mt-2.5 space-y-1">
        {people.map((p) => {
          const on = going.includes(p);
          const a = answers[p];
          return (
            <li key={p}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2">
                <input type="checkbox" checked={on} onChange={() => setGoing((g) => (on ? g.filter((x) => x !== p) : [...g, p]))} />
                <Avatar name={p} size={20} />
                <span className={p === me ? "font-semibold" : ""}>{p === me ? "You" : p}</span>
                <span className="ml-auto text-[11.5px] text-muted" style={a === -1 ? { color: C.out } : a === 1 ? { color: C.must } : undefined}>
                  {label(a)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 rounded-xl bg-surface-2/70 px-3 py-2.5">
        <Cap>Your day</Cap>
        <p className="leading-snug text-fg/85">{going.length ? preview : "Nobody's going yet."}</p>
      </div>
      {!everyone && going.length > 0 && (
        <button onClick={() => setGoing(people)} className="mt-2 text-[12.5px] text-accent hover:underline">
          Everyone comes along instead
        </button>
      )}
      {notes.length > 0 && (
        <div className="mt-3 space-y-1">
          {notes.map((n) => (
            <p key={n.text} className={`flex items-start gap-1.5 text-[12px] ${n.warn ? "text-amber-700 dark:text-amber-300" : "text-muted"}`}>
              <CircleAlert className="mt-px size-3.5 shrink-0" />
              {n.text}
            </p>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded-full px-3 py-1.5 text-muted hover:text-fg">
          Cancel
        </button>
        <button disabled={!going.length} onClick={() => onAdd(going)} className="rounded-full bg-accent px-4 py-1.5 font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-40">
          {everyone ? "Add for everyone" : `Add for ${going.length}`}
        </button>
      </div>
    </div>
  );
}

export function IdeaFitCard({
  idea,
  where,
  days,
  best,
  people,
  me,
  answers,
  readOnly,
  highlight,
  selected,
  booking,
  startWhy,
  onAdd,
  onOpen,
  onAnswer,
  onWhy,
  onRemove,
  onGroup,
  onDoneWhy,
}: {
  idea: Idea;
  where: string;
  days: DayFit[];
  best: DayFit | null;
  people: string[];
  me: string | null;
  answers: Record<string, Answer>;
  readOnly: boolean;
  highlight: "lit" | "new" | null;
  selected: boolean;
  booking: BookingState;
  startWhy: boolean;
  onAdd: (dayKey: string, opts?: AddOptions) => void;
  onOpen: () => void;
  onAnswer: (a: Answer) => void;
  onWhy: (text: string) => void;
  onRemove: () => void;
  /** Pick the category (undefined = let the app decide) */
  onGroup: (g: Group | undefined) => void;
  onDoneWhy: () => void;
}) {
  const it = idea.item;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const whyOpen = (editing || startWhy) && !readOnly;
  const closeWhy = () => (setEditing(false), onDoneWhy());
  const at: LatLng | undefined = it.lat != null && it.lng != null ? [it.lat, it.lng] : undefined;
  const rough = idea.rough;
  const group = people.length >= 2;
  const booked = booking.kind === "booked" ? booking : null;
  const by = addedByOf(it);
  const stay = factsOf(it).stay;
  const visit = stay ? (stay >= 60 ? `about ${Math.round((stay / 60) * 2) / 2} h` : `about ${stay} min`) : undefined;
  const place = placeDetails(it);
  const hoursOn = (date: string) => place.hoursOn(parseISODate(date).getUTCDay());
  const [menu, setMenu] = useState(false);

  // Each day: closed (his fit rules it out), free (nothing planned), far (>40 km detour) or fits (+N km)
  const fitted: Fitted[] = days.map((d) => {
    const stops = d.stops ?? [];
    if (d.fit.out) return { d, state: "closed", stops };
    if (d.travel) return { d, state: "travel", stops };
    if (!at || !stops.length) return { d, state: "free", stops };
    const slot = bestSlot(at, stops);
    return { d, state: slot.detour > 40 ? "far" : "fits", slot, stops };
  });
  const planned = fitted.some((f) => f.stops.length);
  const proposal =
    fitted.find((f) => booked?.date && f.d.date === booked.date) ??
    [...fitted].filter((f) => f.state === "fits").sort((a, b) => a.slot!.detour - b.slot!.detour)[0] ??
    fitted.find((f) => f.d.key === best?.key) ??
    fitted.find((f) => f.state === "free");
  const [pick, setPick] = useState<string | null>(null);
  let sel = fitted.find((f) => f.d.key === pick) ?? proposal;
  // Booked: it goes where its booked time falls in that day (by the clock), when the day has times
  if (sel && booked?.date === sel.d.date && booked.time && at && sel.stops.length && sel.stops.every((x) => x.start)) {
    const st = sel.stops;
    const k = st.filter((x) => hmOf(x.start!) < hmOf(booked.time!)).length;
    const slot: Slot =
      k === 0
        ? { kind: "start", i: 0, detour: kmBetween(at, st[0].at), near: 0 }
        : k >= st.length
          ? { kind: "end", i: st.length - 1, detour: kmBetween(st[st.length - 1].at, at), near: st.length - 1 }
          : { kind: "between", i: k - 1, detour: kmBetween(st[k - 1].at, at) + kmBetween(at, st[k].at) - kmBetween(st[k - 1].at, st[k].at), near: k - 1 };
    sel = { ...sel, slot, state: "fits" };
  }

  // Every reason once, about the selected day. Distance reasons from his fit are replaced by the slot line.
  type Line = { kind: "good" | "warn" | "out"; text: string };
  const isDistance = (t: string) => / from |walk|km/.test(t);
  const lines: Line[] = [];
  if (sel) {
    if (sel.state === "fits" && sel.slot) lines.push({ kind: "good", text: slotText(dayShort(sel.d.date), sel.slot, sel.stops) });
    if (sel.state === "travel") lines.push({ kind: "warn", text: `${dayShort(sel.d.date)} is a travel day (${sel.d.title})` });
    if (sel.state === "far" && sel.slot) lines.push({ kind: "out", text: `Far from ${dayShort(sel.d.date)}'s stops · +${kmText(sel.slot.detour)}` });
    if (sel.state === "free" && planned) lines.push({ kind: "good", text: `Nothing planned on ${dayShort(sel.d.date)} yet: a free day` });
    if (sel.state === "closed") lines.push({ kind: "out", text: `${sel.d.fit.blockers[0]?.text ?? "Closed"} (${dayShort(sel.d.date)})` });
    sel.d.fit.reasons.filter((r) => !isDistance(r.text)).forEach((r) => lines.push({ kind: "good", text: r.text }));
    sel.d.fit.blockers.filter((b) => !isDistance(b.text) && b.text !== "Book ahead" && !(sel.state === "closed" && b.weight >= 100)).forEach((b) => lines.push({ kind: "warn", text: b.text }));
    if (booked && booked.date === sel.d.date && booked.time) lines.push({ kind: "good", text: `Booked for ${booked.time}` });
  }
  if (booking.kind === "needed") lines.push({ kind: "warn", text: "Book ahead · not booked yet" });
  const closedOther = fitted.filter((f) => f.state === "closed" && f !== sel);
  if (closedOther.length) lines.push({ kind: "out", text: `${closedOther[0].d.fit.blockers[0]?.text ?? "Closed"}: ${closedOther.map((f) => dayShort(f.d.date)).join(", ")}` });
  const glance = [lines.find((l) => l.kind === "good"), lines.find((l) => l.kind === "out") ?? lines.find((l) => l.kind === "warn")].filter(Boolean) as Line[];
  // The card picks the day only; a booking's time comes along automatically (times are refined on the itinerary)
  const bookedTimeOn = (f: Fitted) => (booked?.date === f.d.date ? booked.time : undefined);

  // The split, if someone said "Not for me"
  const sittingOut = Object.keys(answers).filter((p) => answers[p] === -1);
  const goingN = Object.keys(answers).length - sittingOut.length;
  const [asking, setAsking] = useState(false);
  const [added, setAdded] = useState<{ day: string; who: string[]; then: Record<string, Answer> } | null>(null);
  const [toast, setToast] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const afterId = (f: Fitted): string | null | undefined =>
    !f.slot ? undefined : f.slot.kind === "start" ? null : f.slot.kind === "between" ? f.stops[f.slot.i].id : f.stops[f.stops.length - 1].id;
  const doAdd = (f: Fitted, who: string[]) => {
    const all = who.length >= Object.keys(answers).length;
    onAdd(f.d.key, { who: all || !group ? undefined : who, afterId: afterId(f), time: bookedTimeOn(f) || undefined });
    setAdded({ day: dayShort(f.d.date), who, then: { ...answers } });
    setToast(true);
  };
  const press = () => {
    if (readOnly || rough || !sel || sel.state === "closed") return;
    if (group && sittingOut.length) setAsking(true);
    else doAdd(sel, Object.keys(answers));
  };
  const drift = added ? Object.keys(answers).filter((p) => answers[p] !== added.then[p] && (added.who.includes(p) ? answers[p] === -1 : answers[p] === 1 || answers[p] === 0)) : [];

  const line = (l: Line) => (
    <p key={l.text} className={`flex items-start gap-1.5 text-[12.5px] ${l.kind === "good" ? "text-accent" : l.kind === "out" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
      {l.kind === "good" ? <Check className="mt-0.5 size-3.5 shrink-0" /> : l.kind === "out" ? <X className="mt-0.5 size-3.5 shrink-0" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0" />}
      <span className={l.kind === "good" ? "text-fg/85" : ""}>{l.text}</span>
    </p>
  );
  // The week: the one day control. Green fits (+km), red closed/far, grey free; ring = the proposed day.
  const cell = (f: Fitted) => {
    const on = f === sel;
    const [wd, dn] = dayShort(f.d.date).split(" ");
    const tone = f.state === "fits" ? "bg-accent/14 text-accent" : f.state === "closed" || f.state === "far" ? "bg-red-500/10 text-red-600 dark:text-red-400" : f.state === "travel" ? "bg-amber-400/15 text-amber-700 dark:text-amber-300" : "bg-surface-2 text-muted";
    const sub = booked?.date === f.d.date ? "booked" : f.state === "fits" ? (f.slot!.detour < 1 ? "+<1 km" : `+${Math.round(f.slot!.detour)} km`) : f.state;
    return (
      <button
        key={f.d.key}
        onClick={() => setPick(f.d.key)}
        title={`${dayShort(f.d.date)} · ${f.d.title}`}
        aria-pressed={on}
        className={`flex min-w-0 flex-1 flex-col items-center rounded-lg px-0.5 py-1.5 leading-tight transition ${tone} ${on ? "ring-2 ring-inset ring-accent" : "hover:brightness-95"}`}
      >
        <span className="text-[10px] font-semibold uppercase opacity-80">{wd}</span>
        <span className={`text-[13px] font-semibold ${f.state === "closed" ? "line-through" : ""}`}>{dn}</span>
        <span className="text-[9.5px] opacity-85">{sub}</span>
      </button>
    );
  };

  const shownTime = sel ? bookedTimeOn(sel) : undefined;
  const label = rough ? "Find a place" : sel ? `Add to ${dayShort(sel.d.date)}${shownTime ? `, ${shownTime}` : ""}${group && sittingOut.length ? ` · ${goingN} going` : ""}` : "Add to a day";
  const cost = place.cost;
  const rating = place.rating;

  return (
    <div
      id={`item-${it.id}`}
      className={`@container relative rounded-2xl border bg-surface transition-[border-color,box-shadow] duration-500 ${
        highlight === "lit" || selected ? "border-accent ring-4 ring-accent/20" : highlight === "new" ? "border-accent" : Object.values(answers).includes(1) ? "border-amber-400/60" : "border-line"
      }`}
    >
      <div className="grid grid-cols-1 @min-[600px]:grid-cols-[minmax(0,1fr)_252px]">
        {/* Evidence */}
        <div className="min-w-0 px-4 pt-3.5 pb-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <button onClick={onOpen} className="block max-w-full truncate text-left text-[16.5px] font-semibold hover:underline" title="Show on the map">
                {it.name}
              </button>
              <div className="relative mt-0.5 flex min-w-0 items-center gap-x-1.5 text-[12.5px] text-muted">
                {where && <span className="truncate">{where}</span>}
                {where && <span aria-hidden>·</span>}
                <button onClick={() => !readOnly && setMenu((m) => !m)} title={readOnly ? undefined : "Change category"} className="flex shrink-0 items-center gap-0.5 rounded hover:text-fg">
                  {GROUP_LABEL[idea.group]}
                  {!readOnly && <ChevronDown className="size-3" />}
                </button>
                {menu && (
                  <ul className="absolute top-full left-0 z-40 mt-1 w-44 rounded-xl border border-line bg-surface p-1 text-fg shadow-xl" onMouseLeave={() => setMenu(false)}>
                    <li>
                      <button onClick={() => (onGroup(undefined), setMenu(false))} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2">
                        <span className="w-3.5">{!hasOwnGroup(it) && <Check className="size-3.5 text-accent" />}</span>
                        Automatic <span className="text-muted">({GROUP_LABEL[autoGroupOf(it)]})</span>
                      </button>
                    </li>
                    <li className="my-1 border-t border-line" aria-hidden />
                    {GROUP_ORDER.map((g) => (
                      <li key={g}>
                        <button onClick={() => (onGroup(g), setMenu(false))} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2">
                          <span className="w-3.5">{hasOwnGroup(it) && idea.group === g && <Check className="size-3.5 text-accent" />}</span>
                          {GROUP_LABEL[g]}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {(rating || cost) && (
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-fg/80">
                  {rating && (
                    <>
                      <Star className="size-3 fill-amber-400 text-amber-400" /> {rating} {place.ratingCount && <span className="text-muted">({place.ratingCount >= 1000 ? `${Math.round(place.ratingCount / 100) / 10}k` : place.ratingCount})</span>}
                    </>
                  )}
                  {rating && cost && <span className="text-muted">·</span>}
                  {cost && <span>{cost}</span>}
                </p>
              )}
            </div>
            {place.photo ? (
              <img src={place.photo} alt="" className="size-16 shrink-0 rounded-xl object-cover" title={it.image?.credit} />
            ) : (
              place.demoPhoto && (
                <div className="grid size-16 shrink-0 place-items-center rounded-xl text-white/70" style={{ background: "linear-gradient(135deg,#9fc3c9,#6a64a6)" }} title="Cover photo (demo)">
                  <ImageIcon className="size-5" />
                </div>
              )
            )}
          </div>
          {place.summary && <p className={`mt-2.5 text-[13px] leading-snug text-fg/85 ${open ? "" : "line-clamp-2"}`}>{place.summary}</p>}
          {!rough && (
            <Grow open={open}>
              <p className="mt-2 flex flex-wrap gap-x-3 text-[12.5px] text-accent">
                <button onClick={onOpen} className="flex items-center gap-1 hover:underline">
                  <MapIcon className="size-3.5" /> Show on map
                </button>
                <a href={googleMapsLink(it)} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">
                  <ExternalLink className="size-3.5" /> Google Maps
                </a>
                {it.google?.website && (
                  <a href={it.google.website} target="_blank" rel="noreferrer" className="hover:underline">
                    Website
                  </a>
                )}
              </p>
            </Grow>
          )}

          <div className="pt-6">
            <Cap>How it fits</Cap>
            {rough ? (
              <p className="text-[12.5px] text-muted">Needs a place first: then it can be fitted into a day</p>
            ) : !planned ? (
              <p className="text-[12.5px] text-muted">No days planned yet</p>
            ) : (
              <>
                {/* The day, then (open) where it would land in that day, then the reasons */}
                <div className="flex gap-1.5">{fitted.map(cell)}</div>
                {/* The suggested slot shows folded; open, the rest of that day grows in around it */}
                {sel &&
                  (sel.state === "fits" || sel.state === "free" ? (
                    <div className="pt-2.5">
                      <DayPreview f={sel} name={it.name} mins={stay ?? 90} fixed={bookedTimeOn(sel)} open={open} />
                    </div>
                  ) : (
                    <Grow open={open}>
                      <p className={`pt-3 text-[12.5px] ${sel.state === "closed" ? "text-red-600 dark:text-red-400" : "text-muted"}`}>
                        {sel.state === "closed" ? "Closed that day" : sel.state === "far" ? `Too far from ${dayShort(sel.d.date)}'s stops to slot in` : `${dayShort(sel.d.date)} is a travel day`}
                      </p>
                    </Grow>
                  ))}
                <div className="mt-2.5 space-y-0.5">{(open ? lines : glance).map(line)}</div>
              </>
            )}
          </div>

          {booked && (
            <Grow open={open}>
              <div className="pt-6">
                <Cap>Booking</Cap>
                <div className="flex items-start gap-2.5 rounded-xl border border-line px-3 py-2 text-[12.5px]">
                  <Ticket className="mt-0.5 size-4 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <p className="font-semibold">{booked.res.title}</p>
                    <p className="text-fg/80">
                      {[booked.date && dayShort(booked.date), booked.time].filter(Boolean).join(", ") || "No date yet"}
                      {booked.res.confirmation && <span className="text-muted"> · #{booked.res.confirmation}</span>}
                    </p>
                  </div>
                </div>
              </div>
            </Grow>
          )}

          {/* Comments (today: the why note). A count while folded; the note and an editor when open. */}
          <div className="pt-6">
            {whyOpen ? (
              <MentionInput
                autoFocus
                initial={it.notes ?? ""}
                people={people}
                placeholder={group ? "Why this? Type @ to mention someone · Enter to save" : "Why this? · Enter to save"}
                onSave={(t) => (t !== (it.notes ?? "") && onWhy(t), closeWhy())}
                onCancel={closeWhy}
              />
            ) : it.notes ? (
              <>
                {!open ? (
                  <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-[12.5px] text-muted hover:text-fg">
                    {by && <Avatar name={by} size={18} />}1 {group ? "comment" : "note"}
                  </button>
                ) : (
                  <>
                    <Cap>{group ? "Comments · 1" : "Notes"}</Cap>
                    <div className="flex gap-2">
                      {by && <Avatar name={by} size={20} />}
                      <div className="min-w-0 text-[13px] leading-snug">
                        {by && <p className="text-[12px] font-semibold">{by === me ? "You" : by}</p>}
                        <p className="text-fg/85">
                          {mentionParts(it.notes, people).map((p, i) =>
                            p.who ? (
                              <span key={i} className="rounded bg-accent/12 px-1 font-semibold text-accent">
                                {p.text}
                              </span>
                            ) : (
                              <span key={i}>{p.text}</span>
                            ),
                          )}
                        </p>
                      </div>
                    </div>
                    {!readOnly && (
                      <button onClick={() => setEditing(true)} className="mt-2 text-[12.5px] text-accent hover:underline">
                        Edit
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              !readOnly && (
                <button onClick={() => setEditing(true)} className="text-[12.5px] text-muted hover:text-fg">
                  + Add a {group ? "comment" : "note"}
                </button>
              )
            )}
          </div>
        </div>

        {/* Decision */}
        <div className="min-w-0 border-t border-line bg-surface-2/60 @min-[600px]:rounded-tr-2xl @min-[600px]:border-t-0">
          <div className="grid h-full grid-cols-[194px_minmax(0,1fr)] gap-x-5 px-4 pt-3.5 pb-4 @min-[600px]:flex @min-[600px]:flex-col">
            <div className="min-w-0">
              <Poll answers={answers} me={me} open={open} readOnly={readOnly} onAnswer={onAnswer} />
            </div>
            <div className="flex min-w-0 flex-col @min-[600px]:mt-auto @min-[600px]:block @min-[600px]:pt-6">
              <Cap>Proposed day</Cap>
              {sel && !rough ? (
                <>
                  <p className="truncate text-[13px]">
                    <b>{dayShort(sel.d.date)}</b> <span className="text-muted">· {sel.d.title}</span>
                  </p>
                  {(() => {
                    const h = hoursOn(sel.d.date);
                    const bits = [h === null ? "Closed that day" : h ? `Open ${h}` : null, visit && `takes ${visit}`].filter(Boolean) as string[];
                    return bits.length > 0 && <p className="text-[12px] text-muted">{bits.join(" · ").replace(/^takes/, "Takes")}</p>;
                  })()}
                </>
              ) : (
                <p className="text-[12.5px] text-muted">{rough ? "Needs a place first" : "Pick a day"}</p>
              )}
              {drift.length > 0 && (
                <p className="mt-2 rounded-lg bg-amber-400/15 px-2 py-1.5 text-[12px] text-amber-800 dark:text-amber-300">
                  {names(drift, me)} changed {drift.length === 1 && drift[0] === me ? "your" : "their"} {drift.length > 1 ? "answers" : "answer"} since this was added. Check who's going on {added!.day}.
                </p>
              )}
              {!readOnly && (
                // The decision: add it, or drop it. Remove is the quiet one beside Add, never at the top of the card.
                <div className="mt-auto flex items-center gap-1.5 pt-4 @min-[600px]:mt-0">
                  <button onClick={onRemove} aria-label="Remove idea" title="Remove idea" className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted hover:border-red-400 hover:text-red-600">
                    <Trash2 className="size-3.5" />
                  </button>
                  <span className={`flex min-w-0 flex-1 items-center overflow-hidden rounded-full text-[12.5px] font-semibold ${sel && !rough && sel.state !== "closed" ? "bg-accent text-on-accent" : "border border-line bg-surface text-fg"}`}>
                    <button onClick={press} className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-3 py-1.5">
                      <span className="truncate">{label}</span>
                    </button>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {asking && sel && (
        <WhoGoing key={sel.d.key} name={it.name} f={sel} answers={answers} me={me} visit={visit} onCancel={() => setAsking(false)} onAdd={(who) => (doAdd(sel, who), setAsking(false))} />
      )}

      {/* Bottom strip: Show more / less; open, a quiet Remove on the left (rare and destructive, so never at the top) */}
      <div className="relative flex items-center border-t border-line">
        {added && toast ? (
          <p className="flex flex-1 items-center justify-center gap-2 py-1.5 text-[12px]">
            <Check className="size-3.5 text-accent" />
            Added to {added.day} {added.who.length >= Object.keys(answers).length ? (group ? "for everyone" : "") : `for ${names(added.who, me, true)}`}
          </p>
        ) : (
          <>
            <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex flex-1 items-center justify-center gap-1 py-1.5 text-[12px] text-muted hover:text-fg">
              {open ? "Show less" : "Show more"}
              <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Straight-line distance between an idea and a stop, for callers that need it */
export const distanceKm = kmBetween;
