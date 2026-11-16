// PROTOTYPE (proto/trip-focus): the idea card, "evidence | decision" (round 7 of /proto/cards, on real trip data).
// Left = what you weigh: the place, How it fits (a map of the day plus every ✓ / ⚠ / ✕ reason, once), comments.
// Right = what you act on: your answer in the group poll, the proposed day, the button. On wide cards the two sit
// side by side; under 600px (the card's own width) they stack. Adding when someone said "Not for me" asks who's going.
import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, CircleAlert, ExternalLink, Map as MapIcon, Star, Ticket, Trash2, X } from "lucide-react";
import { googleMapsLink } from "../../../lib/photon";
import { addedByOf, GROUP_LABEL, mentionParts, type Answer, type BookingState } from "../../../lib/protoIdeas";
import { bestSlot, kmBetween, kmText, slotText, type LatLng, type Slot, type Stop } from "../../../lib/protoSlot";
import { Avatar, MentionInput } from "./MentionInput";
import { dayShort, type DayFit } from "./DayMenu";
import type { Idea } from "./IdeasShelf";

const POLL: [string, string, string] = ["Yes!", "Sure", "Not for me"];
const C = { must: "#178a7c", along: "#8f9a95", out: "#c8604a" };

export type AddOptions = { who?: string[]; afterId?: string | null };

type DayState = "fits" | "far" | "free" | "closed";
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

/** The day, drawn: its route numbered, the cheapest detour through this idea (dashed amber) */
function FitMap({ stops, at, slot, tall }: { stops: Stop[]; at: LatLng; slot?: Slot; tall: boolean }) {
  const W = 320;
  const H = tall ? 132 : 76;
  const pad = 14;
  const pts: LatLng[] = [...stops.map((x) => x.at), at];
  const kx = Math.cos((pts.reduce((a, p) => a + p[0], 0) / pts.length) * (Math.PI / 180));
  const xs = pts.map((p) => p[1] * kx);
  const ys = pts.map((p) => p[0]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sc = Math.min((W - pad * 2) / (x1 - x0 || 0.01), (H - pad * 2) / (y1 - y0 || 0.01));
  const ox = (W - (x1 - x0) * sc) / 2;
  const oy = (H - (y1 - y0) * sc) / 2;
  const P = (p: LatLng) => [ox + (p[1] * kx - x0) * sc, H - (oy + (p[0] - y0) * sc)] as const;
  const sp = stops.map((x) => P(x.at));
  const ip = P(at);
  const detour = slot ? (slot.kind === "between" ? [sp[slot.i], ip, sp[slot.i + 1]] : slot.kind === "start" ? [ip, sp[0]] : [sp[sp.length - 1], ip]) : [];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full transition-[height] duration-300" style={{ height: H }} role="img" aria-label="Where it fits in the day">
      {sp.length > 1 && <polyline points={sp.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeOpacity={slot?.kind === "between" ? ".14" : ".28"} strokeWidth="2" strokeLinejoin="round" />}
      {detour.length > 1 && <polyline points={detour.map((p) => p.join(",")).join(" ")} fill="none" stroke="#d97706" strokeWidth="1.75" strokeDasharray="4 3" strokeLinejoin="round" />}
      {sp.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="7.5" fill="var(--surface, #fff)" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.5" />
          <text x={p[0]} y={p[1] + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" fillOpacity=".7">
            {i + 1}
          </text>
        </g>
      ))}
      <circle cx={ip[0]} cy={ip[1]} r="6.5" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
    </svg>
  );
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
  const visit = it.stay ? (it.stay >= 60 ? `about ${Math.round((it.stay / 60) * 2) / 2} h` : `about ${it.stay} min`) : undefined;

  // Each day: closed (his fit rules it out), free (nothing planned), far (>40 km detour) or fits (+N km)
  const fitted: Fitted[] = days.map((d) => {
    const stops = d.stops ?? [];
    if (d.fit.out) return { d, state: "closed", stops };
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
  const sel = fitted.find((f) => f.d.key === pick) ?? proposal;

  // Every reason once, about the selected day. Distance reasons from his fit are replaced by the slot line.
  type Line = { kind: "good" | "warn" | "out"; text: string };
  const isDistance = (t: string) => / from |walk|km/.test(t);
  const lines: Line[] = [];
  if (sel) {
    if (sel.state === "fits" && sel.slot) lines.push({ kind: "good", text: slotText(dayShort(sel.d.date), sel.slot, sel.stops) });
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
  const watch = lines.some((l) => l.kind === "warn");

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
    onAdd(f.d.key, { who: all || !group ? undefined : who, afterId: afterId(f) });
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
  const tag = (f: Fitted) => {
    const on = f === sel;
    const sub = booked?.date === f.d.date ? "booked" : f.state === "closed" ? "closed" : f.state === "free" ? "free" : f.state === "far" ? "far" : `+${f.slot!.detour < 1 ? "<1" : Math.round(f.slot!.detour)} km`;
    const [wd, dn] = dayShort(f.d.date).split(" ");
    return (
      <button
        key={f.d.key}
        onClick={() => setPick(f.d.key)}
        title={f.d.title}
        className={`flex min-w-0 flex-1 flex-col items-center rounded-lg px-1 py-1 text-center leading-tight transition-colors ${
          on ? "bg-accent text-on-accent" : f.state === "closed" ? "bg-red-500/10 text-red-600 dark:text-red-400" : f.state === "fits" ? "bg-accent/12 text-accent hover:bg-accent/20" : "bg-surface-2 text-muted hover:text-fg"
        }`}
      >
        <span className={`text-[11px] font-semibold ${f.state === "closed" ? "line-through" : ""}`}>
          {wd} {dn}
        </span>
        <span className="text-[10px] opacity-85">{sub}</span>
      </button>
    );
  };

  const label = rough ? "Find a place" : sel ? `Add to ${dayShort(sel.d.date)}${booked?.date === sel.d.date && booked.time ? `, ${booked.time}` : ""}${group && sittingOut.length ? ` · ${goingN} going` : ""}` : "Add to a day";
  const cost = it.cost ? `${it.costCurrency ?? ""} ${it.cost.toLocaleString()}`.trim() : null;
  const rating = it.google?.rating;

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
              <p className="mt-0.5 truncate text-[12.5px] text-muted">{[where, GROUP_LABEL[idea.group]].filter(Boolean).join(" · ")}</p>
              {(rating || cost) && (
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-fg/80">
                  {rating && (
                    <>
                      <Star className="size-3 fill-amber-400 text-amber-400" /> {rating} {it.google?.ratingCount && <span className="text-muted">({it.google.ratingCount.toLocaleString()})</span>}
                    </>
                  )}
                  {rating && cost && <span className="text-muted">·</span>}
                  {cost && <span>{cost}</span>}
                </p>
              )}
            </div>
            {it.image?.thumb && <img src={it.image.thumb} alt="" className="size-16 shrink-0 rounded-xl object-cover" title={it.image.credit} />}
          </div>
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
                {sel && at && sel.stops.length > 0 && (
                  <div className={open ? "" : "hidden @min-[600px]:block"}>
                    <div className="overflow-hidden rounded-xl border border-line bg-surface-2/40">
                      <FitMap stops={sel.stops} at={at} slot={sel.state === "fits" ? sel.slot : undefined} tall={open} />
                    </div>
                    <p className="mt-1 truncate text-[11.5px] text-muted">
                      <b className="font-semibold text-fg/75">{dayShort(sel.d.date)}:</b> {sel.stops.map((x, i) => `${i + 1} ${x.name}`).join(" · ")}
                    </p>
                  </div>
                )}
                <Grow open={open}>
                  <div className="flex gap-1 overflow-x-auto pt-2.5">{fitted.map(tag)}</div>
                </Grow>
                <div className="mt-2 space-y-0.5">{(open ? lines : glance).map(line)}</div>
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
                  {visit && <p className="text-[12px] text-muted">Takes {visit}</p>}
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
                      {watch && sel && <CircleAlert className="size-3.5 shrink-0 text-amber-200" aria-label="Something to watch: see How it fits" />}
                    </button>
                    <button onClick={() => setOpen(true)} aria-label="Other days" className={`grid place-items-center self-stretch border-l px-2 ${sel && !rough ? "border-white/30" : "border-line"}`}>
                      <ChevronDown className="size-3.5" />
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
