// PROTOTYPE (proto/trip-focus): playground for the idea card's layout, folded vs expanded.
// Dev only, at /travelplanner/proto/cards. Every variant shows the same idea twice (folded, expanded) so the
// way each region grows is visible side by side. The four regions are always the same:
//   What it is · How the group feels · Why and fit · Decision
// To try another layout, add a component to VARIANTS.
import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, CircleAlert, ExternalLink, ImageIcon, Map as MapIcon, MoreHorizontal, Star, Ticket, X } from "lucide-react";
import { hue, Knob, LABEL, key, PALETTES, PersonTrack, SoftTrack, stopsBetween, usePalette, type Answer, type Answers } from "./ProtoInterest";

/* ---------- demo ideas ---------- */

type DayState = "best" | "good" | "ok" | "out";
type Demo = {
  id: string;
  name: string;
  where: string;
  category: string;
  booking: { kind: "booked"; text: string; conf?: string } | { kind: "needed" } | null;
  why: { text: string; by: string } | null;
  facts: string[];
  address: string;
  best: { day: string; title: string } | null;
  good: string[];
  warn: string[];
  out: string | null;
  days: { d: string; state: DayState; reason: string }[];
  answers: Answers;
  addedBy: string;
};

const DAYS = ["Mon 14", "Tue 15", "Wed 16", "Thu 17", "Fri 18", "Sat 19", "Sun 20"];
const IDEAS: Demo[] = [
  {
    id: "ghibli",
    name: "Ghibli Museum",
    where: "Tokyo, Japan",
    category: "Experiences",
    booking: { kind: "booked", text: "Mon 14, 16:00", conf: "GM48213" },
    why: { text: "Tickets go on sale the 10th of the month before. @Maya has wanted this for years", by: "Vishal" },
    facts: ["About 2.5 h", "Best early", "Closed Tuesdays"],
    address: "1-1-83 Shimorenjaku, Mitaka, Tokyo",
    best: { day: "Mon 14", title: "Land in Tokyo" },
    good: ["Booked for Mon 14, 16:00", "12 km from Omoide Yokocho"],
    warn: [],
    out: "Closed Tuesdays: Tue 15",
    days: [
      { d: "Mon 14", state: "best", reason: "Booked 16:00" },
      { d: "Tue 15", state: "out", reason: "Closed" },
      { d: "Wed 16", state: "ok", reason: "75 km away" },
      { d: "Thu 17", state: "ok", reason: "Kyoto day" },
      { d: "Fri 18", state: "ok", reason: "Kyoto day" },
      { d: "Sat 19", state: "ok", reason: "Kyoto day" },
      { d: "Sun 20", state: "good", reason: "Open day" },
    ],
    answers: { Vishal: 1, Maya: 1, Sam: 0, Aditya: null },
    addedBy: "Vishal",
  },
  {
    id: "hakone",
    name: "Hakone Yuryo",
    where: "Hakone, Japan",
    category: "Nature",
    booking: { kind: "needed" },
    why: { text: "@Sam said Hakone has good day-use ones", by: "Maya" },
    facts: ["About 2 h", "Best in the evening"],
    address: "National Highway Route 1, Tōnosawa, Hakone",
    best: { day: "Wed 16", title: "Hakone day trip" },
    good: ["7 km from Owakudani"],
    warn: ["Private baths book out on weekends"],
    out: null,
    days: [
      { d: "Mon 14", state: "ok", reason: "75 km away" },
      { d: "Tue 15", state: "ok", reason: "80 km away" },
      { d: "Wed 16", state: "best", reason: "7 km from Owakudani" },
      { d: "Thu 17", state: "ok", reason: "On the way?" },
      { d: "Fri 18", state: "ok", reason: "300 km away" },
      { d: "Sat 19", state: "ok", reason: "300 km away" },
      { d: "Sun 20", state: "ok", reason: "Open day" },
    ],
    answers: { Vishal: 0, Maya: 1, Sam: -1, Aditya: 0 },
    addedBy: "Maya",
  },
  {
    id: "onsen",
    name: "Try a proper onsen",
    where: "Needs a place",
    category: "Experiences",
    booking: null,
    why: null,
    facts: [],
    address: "",
    best: null,
    good: [],
    warn: [],
    out: null,
    days: DAYS.map((d) => ({ d, state: "ok" as const, reason: "No place yet" })),
    answers: { Vishal: null, Maya: 0, Sam: null, Aditya: null },
    addedBy: "Sam",
  },
];

/* Comments and emailed bookings (round 4), and answers for bigger groups */
type Comment = { by: string; when: string; text: string };
type Booking = { title: string; when: string; conf?: string; source: string };
const EXTRA: Record<string, { comments: Comment[]; bookings: Booking[]; more: Answer[] }> = {
  ghibli: {
    comments: [
      { by: "Vishal", when: "Nov 2", text: "Tickets go on sale the 10th of the month before. @Maya has wanted this for years" },
      { by: "Maya", when: "Nov 3", text: "Yes!! The Catbus room is only for kids though" },
      { by: "Sam", when: "Nov 4", text: "Happy to come if we do Kichijoji after" },
    ],
    bookings: [{ title: "Ghibli Museum · 4 tickets", when: "Mon 14, 16:00", conf: "GM48213", source: "From a forwarded email · Nov 10" }],
    more: [1, 0, 0, null, 1, -1],
  },
  hakone: {
    comments: [
      { by: "Maya", when: "Nov 5", text: "@Sam said Hakone has good day-use ones" },
      { by: "Sam", when: "Nov 6", text: "I'll sit this one out, I'd rather spend longer at Owakudani" },
    ],
    bookings: [],
    more: [0, 1, null, -1, 0, 0],
  },
  onsen: {
    comments: [{ by: "Sam", when: "Nov 7", text: "Somewhere with an outdoor bath would be amazing" }],
    bookings: [],
    more: [null, null, 0, null, 1, null],
  },
};
const NAMES = ["Vishal", "Maya", "Sam", "Aditya", "Priya", "Leo", "Hana", "Omar", "Jules", "Kai"];
function sized(base: Answers, id: string, n: number): Answers {
  const out: Answers = {};
  NAMES.slice(0, n).forEach((p, i) => (out[p] = i < 4 ? (base[p] ?? null) : EXTRA[id].more[i - 4]));
  return out;
}

type Props = { idea: Demo; open: boolean; toggle: () => void; me: string; setMine: (a: Answer) => void };

/* ---------- shared pieces ---------- */

const answeredOf = (a: Answers) => Object.values(a).filter((x): x is -1 | 0 | 1 => x !== null);

function Band({ answers, w = 112 }: { answers: Answers; w?: number }) {
  const a = answeredOf(answers);
  const x = (v: number) => ((v + 1) / 2) * w;
  if (!a.length) return <SoftTrack faint w={w} />;
  const lo = Math.min(...a);
  const hi = Math.max(...a);
  const mean = a.reduce((p, q) => p + q, 0) / a.length;
  return (
    <SoftTrack faint w={w}>
      {hi > lo && (
        <span
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full"
          style={{ left: x(lo) - 6, width: x(hi) - x(lo) + 12, background: `linear-gradient(90deg,${stopsBetween(lo, hi, "66")})`, maskImage: "linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent)" }}
        />
      )}
      <Knob value={mean} x={x(mean)} />
    </SoftTrack>
  );
}

const Ava = ({ name, size = 20 }: { name: string; size?: number }) => (
  <span className="grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-surface" style={{ width: size, height: size, fontSize: size * 0.46, background: `hsl(${hue(name)} 55% 45%)` }}>
    {name[0]}
  </span>
);

function People({ idea, me, setMine, w = 120, compact }: { idea: Demo; me: string; setMine: (a: Answer) => void; w?: number; /** No answer labels: the knob says it */ compact?: boolean }) {
  const people = Object.keys(idea.answers).sort((a, b) => (a === me ? -1 : b === me ? 1 : 0));
  return (
    <ul className="space-y-1">
      {people.map((p) => (
        <li key={p} className="flex items-center gap-2 text-[12.5px]">
          <Ava name={p} size={18} />
          <span className={`${compact ? "w-11" : "w-12"} truncate ${p === me ? "font-semibold" : ""}`} title={LABEL[key(idea.answers[p])]}>
            {p === me ? "You" : p}
          </span>
          <PersonTrackW a={idea.answers[p]} editable={p === me} onSet={setMine} w={w} />
          {!compact && <span className="truncate text-[11.5px] text-muted">{LABEL[key(idea.answers[p])].replace("Hasn't weighed in", "—")}</span>}
        </li>
      ))}
    </ul>
  );
}
// PersonTrack has a fixed width; wrap so narrow quadrants can scale it down
const PersonTrackW = ({ w, ...p }: { a: Answer; editable: boolean; onSet: (a: Answer) => void; w: number }) => (
  <span className="inline-block origin-left" style={{ width: w + 16, transform: `scale(${Math.min(1, w / 132)})` }}>
    <PersonTrack {...p} />
  </span>
);

function Why({ idea, clamp }: { idea: Demo; clamp?: boolean }) {
  if (!idea.why) return <p className="text-[12.5px] text-muted italic">No why yet</p>;
  return (
    <p className={`text-[13px] leading-snug text-fg/85 italic ${clamp ? "line-clamp-2" : ""}`}>
      “
      {idea.why.text.split(/(@\w+)/).map((t, i) =>
        t.startsWith("@") ? (
          <span key={i} className="rounded bg-accent/12 px-1 font-semibold text-accent not-italic">
            {t}
          </span>
        ) : (
          t
        ),
      )}
      ”<span className="text-muted not-italic"> · {idea.why.by}</span>
    </p>
  );
}

function BookBadge({ idea }: { idea: Demo }) {
  const b = idea.booking;
  if (!b) return null;
  return b.kind === "booked" ? (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
      <Check className="size-3" /> Booked
    </span>
  ) : (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/25 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
      <Ticket className="size-3" /> Not booked
    </span>
  );
}

function Title({ idea, size = 16, badge = true }: { idea: Demo; size?: number; badge?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 truncate font-semibold" style={{ fontSize: size }}>
          {idea.name}
        </p>
        {badge && <BookBadge idea={idea} />}
      </div>
      <p className="mt-0.5 truncate text-[12.5px] text-muted">
        {idea.where} · {idea.category} <ChevronDown className="inline size-3" />
      </p>
    </div>
  );
}

function Glance({ idea }: { idea: Demo }) {
  const g = idea.best ? `${idea.best.day} · ${idea.good[idea.good.length - 1] ?? idea.best.title}` : null;
  const b = idea.out ?? idea.warn[0] ?? null;
  if (!g && !b) return <p className="text-[12.5px] text-muted">No day stands out yet</p>;
  return (
    <div className="space-y-0.5 text-[12.5px]">
      {g && (
        <p className="flex min-w-0 items-center gap-1.5 text-accent">
          <Check className="size-3.5 shrink-0" />
          <span className="truncate">{g}</span>
        </p>
      )}
      {b && (
        <p className={`flex min-w-0 items-center gap-1.5 ${idea.out ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
          {idea.out ? <X className="size-3.5 shrink-0" /> : <CircleAlert className="size-3.5 shrink-0" />}
          <span className="truncate">{b}</span>
        </p>
      )}
    </div>
  );
}

function FitList({ idea }: { idea: Demo }) {
  const row = (kind: "good" | "warn" | "out", t: string) => (
    <li key={t} className={`flex items-start gap-1.5 ${kind === "good" ? "text-accent" : kind === "out" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
      {kind === "good" ? <Check className="mt-0.5 size-3.5 shrink-0" /> : kind === "out" ? <X className="mt-0.5 size-3.5 shrink-0" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0" />}
      <span className="text-fg/85">{t}</span>
    </li>
  );
  return (
    <div className="text-[12.5px]">
      {idea.best ? (
        <p className="mb-1">
          Best on <b>{idea.best.day}</b> <span className="text-muted">· {idea.best.title}</span>
        </p>
      ) : (
        <p className="mb-1 text-muted">Nothing planned nearby yet</p>
      )}
      <ul className="space-y-0.5">
        {idea.good.map((t) => row("good", t))}
        {idea.warn.map((t) => row("warn", t))}
        {idea.out && row("out", idea.out)}
      </ul>
    </div>
  );
}

function DayBtn({ idea, small }: { idea: Demo; small?: boolean }) {
  const label = idea.best ? `Add to ${idea.best.day}${idea.booking?.kind === "booked" ? " · booked" : ""}` : idea.where === "Needs a place" ? "Find a place" : "Add to a day";
  return (
    <span className={`inline-flex shrink-0 items-center overflow-hidden rounded-full font-semibold ${idea.best ? "bg-accent text-on-accent" : "border border-line text-fg"} ${small ? "text-[12px]" : "text-[12.5px]"}`}>
      <span className={small ? "px-2.5 py-1" : "px-3 py-1.5"}>{label}</span>
      {idea.best && (
        <span className={`border-l border-white/30 ${small ? "px-1.5 py-1" : "px-2 py-1.5"}`}>
          <ChevronDown className="size-3.5" />
        </span>
      )}
    </span>
  );
}

function Facts({ idea }: { idea: Demo }) {
  if (!idea.facts.length && !idea.address) return <p className="text-[12.5px] text-muted">Pick a place to see its details</p>;
  return (
    <div className="space-y-1 text-[12.5px]">
      {idea.facts.length > 0 && <p className="text-fg/85">{idea.facts.join(" · ")}</p>}
      {idea.address && <p className="text-muted">{idea.address}</p>}
      <p className="flex gap-3 text-accent">
        <span className="flex items-center gap-1">
          <MapIcon className="size-3.5" /> Map
        </span>
        <span className="flex items-center gap-1">
          <ExternalLink className="size-3.5" /> Google Maps
        </span>
      </p>
    </div>
  );
}

function TicketLine({ idea }: { idea: Demo }) {
  const b = idea.booking;
  if (!b) return null;
  return (
    <p className={`flex items-center gap-1.5 text-[12.5px] ${b.kind === "booked" ? "text-accent" : "text-amber-700 dark:text-amber-300"}`}>
      <Ticket className="size-3.5 shrink-0" />
      {b.kind === "booked" ? `${b.text}${b.conf ? ` · #${b.conf}` : ""}` : "Book ahead · not booked yet"}
    </p>
  );
}

const STATE = {
  best: { cls: "bg-accent text-on-accent", icon: <Star className="size-3 fill-current" /> },
  good: { cls: "bg-accent/15 text-accent", icon: <Check className="size-3" /> },
  ok: { cls: "bg-surface-2 text-muted", icon: null },
  out: { cls: "bg-red-500/12 text-red-600 dark:text-red-400 line-through", icon: <X className="size-3" /> },
} as const;

const Label = ({ children }: { children: ReactNode }) => <h3 className="mb-1.5 text-[10.5px] font-semibold tracking-wider text-muted uppercase">{children}</h3>;
const Toggle = ({ open, toggle }: { open: boolean; toggle: () => void }) => (
  <button onClick={toggle} className="flex w-full items-center justify-center gap-1 border-t border-line py-1.5 text-[12px] text-muted hover:bg-surface-2/60 hover:text-fg">
    {open ? "Show less" : "Show more"}
    <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
  </button>
);
const Shell = ({ children, idea }: { children: ReactNode; idea: Demo }) => (
  <div className={`overflow-hidden rounded-2xl border bg-surface ${idea.answers && answeredOf(idea.answers).includes(1) ? "border-amber-400/60" : "border-line"}`}>{children}</div>
);
const More = () => (
  <span className="grid size-7 shrink-0 place-items-center rounded-full text-muted">
    <MoreHorizontal className="size-4" />
  </span>
);

/* ---------- variants ---------- */

/** Q1: a 2×2 grid split by hairlines. Folded, each quadrant is one line; expanded, each quadrant grows in place. */
function Quadrants({ idea, open, toggle, me, setMine }: Props) {
  const cell = "min-w-0 p-3";
  return (
    <Shell idea={idea}>
      <div className="grid grid-cols-2 divide-line [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(odd)]:border-r [&>*]:border-line">
        <div className={cell}>
          {open && <Label>What it is</Label>}
          <Title idea={idea} size={15} />
          {open && (
            <div className="mt-2">
              <Facts idea={idea} />
            </div>
          )}
        </div>
        <div className={cell}>
          {open && <Label>How the group feels</Label>}
          {open ? (
            <People idea={idea} me={me} setMine={setMine} w={92} />
          ) : (
            <div className="flex items-center justify-between">
              <Band answers={idea.answers} w={100} />
              <More />
            </div>
          )}
        </div>
        <div className={cell}>
          {open && <Label>Why</Label>}
          <Why idea={idea} clamp={!open} />
        </div>
        <div className={cell}>
          {open && <Label>Fit and decision</Label>}
          {open ? (
            <div className="space-y-2">
              <FitList idea={idea} />
              <TicketLine idea={idea} />
              <DayBtn idea={idea} />
            </div>
          ) : (
            <div className="space-y-2">
              <Glance idea={idea} />
              <div className="flex justify-end">
                <DayBtn idea={idea} small />
              </div>
            </div>
          )}
        </div>
      </div>
      <Toggle open={open} toggle={toggle} />
    </Shell>
  );
}

/** Q2: corners. Folded, the four regions sit in the card's four corners (right side right-aligned).
    Expanded, each corner grows towards the middle, so everything stays where your eye left it. */
function Corners({ idea, open, toggle, me, setMine }: Props) {
  return (
    <Shell idea={idea}>
      <div className={`grid grid-cols-[1fr_auto] gap-x-4 p-3.5 ${open ? "gap-y-4" : "gap-y-2.5"}`}>
        <div className="min-w-0 self-start">
          <Title idea={idea} />
          {open && (
            <div className="mt-2">
              <Facts idea={idea} />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end self-start">
          <Band answers={idea.answers} w={open ? 132 : 96} />
          {open && (
            <div className="mt-2">
              <People idea={idea} me={me} setMine={setMine} w={80} />
            </div>
          )}
        </div>
        <div className="min-w-0 self-end">
          {open && (
            <div className="mb-2">
              <FitList idea={idea} />
            </div>
          )}
          <Why idea={idea} clamp={!open} />
          {!open && (
            <div className="mt-1.5">
              <Glance idea={idea} />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end justify-end gap-2 self-end">
          {open && <TicketLine idea={idea} />}
          <DayBtn idea={idea} small={!open} />
        </div>
      </div>
      <Toggle open={open} toggle={toggle} />
    </Shell>
  );
}

/** Q3: bento. Regions are soft tiles. Folded: identity + why on the left, group and day stacked on the right.
    Expanded: a photo tile joins and the tiles re-flow into a 3-column bento; the fit tile gets the full width. */
function Bento({ idea, open, toggle, me, setMine }: Props) {
  const tile = "min-w-0 rounded-xl bg-surface-2/70 p-3";
  if (!open)
    return (
      <Shell idea={idea}>
        <div className="grid grid-cols-[1fr_auto] gap-2 p-2">
          <div className={`${tile} row-span-2 space-y-2`}>
            <Title idea={idea} size={15} />
            <Why idea={idea} clamp />
          </div>
          <div className={`${tile} flex items-center justify-center`}>
            <Band answers={idea.answers} w={92} />
          </div>
          <div className={`${tile} flex items-center justify-center`}>
            <DayBtn idea={idea} small />
          </div>
        </div>
        <Toggle open={open} toggle={toggle} />
      </Shell>
    );
  return (
    <Shell idea={idea}>
      <div className="grid grid-cols-3 gap-2 p-2">
        <div className={`${tile} col-span-2 space-y-2`}>
          <Title idea={idea} />
          <Why idea={idea} />
        </div>
        <div className="row-span-2 grid min-h-[120px] place-items-center rounded-xl text-muted" style={{ background: `linear-gradient(135deg,hsl(${hue(idea.name)} 35% 80%),hsl(${hue(idea.name) + 40} 30% 65%))` }}>
          <ImageIcon className="size-6 opacity-60" />
        </div>
        <div className={tile}>
          <Label>About</Label>
          <Facts idea={idea} />
        </div>
        <div className={tile}>
          <Label>Group</Label>
          <People idea={idea} me={me} setMine={setMine} w={64} />
        </div>
        <div className={`${tile} col-span-2`}>
          <Label>Fit</Label>
          <FitList idea={idea} />
        </div>
        <div className={`${tile} flex flex-col justify-between gap-2`}>
          <TicketLine idea={idea} />
          <DayBtn idea={idea} small />
        </div>
      </div>
      <Toggle open={open} toggle={toggle} />
    </Shell>
  );
}

/** Q4: two halves over a week strip. Top: identity + why on the left, the group on the right. The decision is the
    week itself: folded, seven dots (★ best, ✓ fits, ✕ closed); expanded, the dots grow into day columns with reasons. */
function WeekStrip({ idea, open, toggle, me, setMine }: Props) {
  return (
    <Shell idea={idea}>
      <div className="grid grid-cols-[1fr_auto] gap-4 p-3.5">
        <div className="min-w-0 space-y-2">
          <Title idea={idea} />
          {open && <Facts idea={idea} />}
          <Why idea={idea} clamp={!open} />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1">
            <Band answers={idea.answers} w={open ? 120 : 92} />
            <More />
          </div>
          {open && <People idea={idea} me={me} setMine={setMine} w={76} />}
        </div>
      </div>
      <div className="border-t border-line px-3.5 py-2.5">
        <div className="flex items-end gap-1">
          {idea.days.map((d) => {
            const s = STATE[d.state];
            return open ? (
              <div key={d.d} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center ${s.cls}`}>
                <span className="text-[11px] font-semibold">{d.d.split(" ")[0]}</span>
                <span className="text-[15px] leading-none font-semibold">{d.d.split(" ")[1]}</span>
                <span className="line-clamp-2 text-[10px] leading-tight opacity-90">{d.reason}</span>
              </div>
            ) : (
              <div key={d.d} title={`${d.d}: ${d.reason}`} className={`grid h-6 min-w-0 flex-1 place-items-center rounded-md text-[10.5px] font-semibold ${s.cls}`}>
                {s.icon ?? d.d.split(" ")[0][0]}
              </div>
            );
          })}
        </div>
        {open && (
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <TicketLine idea={idea} />
            <DayBtn idea={idea} small />
          </div>
        )}
        {!open && <p className="mt-1.5 truncate text-[12px] text-muted">{idea.best ? `Best ${idea.best.day} · ${idea.days.find((d) => d.state === "best")?.reason}` : "No day stands out yet"}</p>}
      </div>
      <Toggle open={open} toggle={toggle} />
    </Shell>
  );
}

/** Q5: side rail. A narrow left column carries the decision (best day, big) and the group knob; the right column
    is identity and why. Expanded, the rail widens with the per-person tracks and the content column gains the facts and fit. */
function SideRail({ idea, open, toggle, me, setMine }: Props) {
  return (
    <Shell idea={idea}>
      <div className={`grid ${open ? "grid-cols-[250px_1fr]" : "grid-cols-[96px_1fr]"} transition-all`}>
        <div className="flex flex-col items-center gap-3 border-r border-line bg-surface-2/50 p-3 text-center">
          {idea.best ? (
            <div>
              <p className="text-[10.5px] font-semibold tracking-wider text-muted uppercase">Best</p>
              <p className="text-[13px] font-semibold">{idea.best.day.split(" ")[0]}</p>
              <p className="font-display text-[28px] leading-none">{idea.best.day.split(" ")[1]}</p>
            </div>
          ) : (
            <p className="text-[12px] text-muted">No day yet</p>
          )}
          <Band answers={idea.answers} w={open ? 170 : 60} />
          {open && (
            <div className="w-full text-left">
              <People idea={idea} me={me} setMine={setMine} w={80} />
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-2.5 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <Title idea={idea} />
            <More />
          </div>
          <Why idea={idea} clamp={!open} />
          {open ? (
            <>
              <Facts idea={idea} />
              <FitList idea={idea} />
              <TicketLine idea={idea} />
            </>
          ) : (
            <Glance idea={idea} />
          )}
          <div className="flex justify-end">
            <DayBtn idea={idea} small={!open} />
          </div>
        </div>
      </div>
      <Toggle open={open} toggle={toggle} />
    </Shell>
  );
}

/* ---------- round 2: Corners, cleaned up ----------
   Same organisation as Q2 (identity ↖, group ↗, why and fit ↙, decision ↘), drawn on a real grid: a wide left
   column and a fixed right column, rows that line up across both, everything left-aligned, one spacing scale,
   the name as the only strong text and the day button as the only filled thing. The variants differ only in how
   the regions are separated. */

type Sep = "space" | "line" | "tint" | "cross";

function groupSummary(a: Answers) {
  const v = Object.values(a);
  const must = v.filter((x) => x === 1).length;
  const along = v.filter((x) => x === 0).length;
  const out = v.filter((x) => x === -1).length;
  const none = v.filter((x) => x === null).length;
  return [must && `${must} must do`, along && `${along} along`, out && `${out} out`, none && `${none} to answer`].filter(Boolean).join(" · ");
}

function CleanCorners({ idea, open, toggle, me, setMine, sep }: Props & { sep: Sep }) {
  const RIGHT = 212;
  const pad = "px-4 py-3.5";
  // the right column: separated by whitespace, a line, a tint, or a line plus a row rule
  const right = sep === "tint" ? "bg-surface-2/60" : sep === "line" || sep === "cross" ? "border-l border-line" : "";
  const rowRule = sep === "cross" ? "border-t border-line" : "";
  const gutter = sep === "space" ? "gap-x-2" : "";
  const b = idea.booking;
  return (
    <Shell idea={idea}>
      <div className={`relative grid ${gutter}`} style={{ gridTemplateColumns: `minmax(0,1fr) ${RIGHT}px` }}>
        <span className="absolute top-2 right-2">
          <More />
        </span>

        {/* ↖ What it is */}
        <div className={`${pad} min-w-0 ${open ? "pb-4" : "pb-2"}`}>
          <Title idea={idea} size={16.5} />
          {open && (
            <div className="mt-3">
              <Facts idea={idea} />
            </div>
          )}
        </div>

        {/* ↗ How the group feels */}
        <div className={`${pad} ${right} min-w-0 pr-9 ${open ? "pb-4" : "pb-2"}`}>
          <p className="mb-1 text-[10.5px] font-semibold tracking-wider text-muted uppercase">Group</p>
          {open ? (
            <People idea={idea} me={me} setMine={setMine} w={70} compact />
          ) : (
            <>
              <span className="-ml-2 block">
                <Band answers={idea.answers} w={110} />
              </span>
              <p className="mt-0.5 truncate text-[11.5px] text-muted">{groupSummary(idea.answers)}</p>
            </>
          )}
        </div>

        {/* ↙ Why and fit */}
        <div className={`${pad} ${rowRule} min-w-0 ${open ? "pt-4" : "pt-2"} space-y-2`}>
          <Why idea={idea} clamp={!open} />
          {open ? <FitList idea={idea} /> : <Glance idea={idea} />}
        </div>

        {/* ↘ Decision: what's settled (tickets), then the one filled button */}
        <div className={`${pad} ${right} ${rowRule} flex min-w-0 flex-col justify-end gap-2 ${open ? "pt-4" : "pt-2"}`}>
          {b && (
            <p className={`flex items-start gap-1.5 text-[12px] ${b.kind === "booked" ? "text-accent" : "text-amber-700 dark:text-amber-300"}`}>
              <Ticket className="mt-px size-3.5 shrink-0" />
              <span>
                {b.kind === "booked" ? `Booked ${b.text}` : "Book ahead"}
                {open && b.kind === "booked" && b.conf && <span className="block text-muted">#{b.conf}</span>}
                {open && b.kind === "needed" && <span className="block text-muted">Not booked yet</span>}
              </span>
            </p>
          )}
          {open && idea.best && (
            <p className="text-[12px] text-muted">
              Other days: {idea.days.filter((d) => d.state === "good").map((d) => d.d).join(", ") || "none fit well"}
            </p>
          )}
          <DayBtnFull idea={idea} />
        </div>
      </div>
      <Toggle open={open} toggle={toggle} />
    </Shell>
  );
}

function DayBtnFull({ idea }: { idea: Demo }) {
  const label = idea.best ? `Add to ${idea.best.day}` : idea.where === "Needs a place" ? "Find a place" : "Add to a day";
  return (
    <span className={`flex w-full items-center overflow-hidden rounded-full text-[12.5px] font-semibold ${idea.best ? "bg-accent text-on-accent" : "border border-line text-fg"}`}>
      <span className="flex-1 px-3 py-1.5 text-center">{label}</span>
      <span className={`border-l px-2 py-1.5 ${idea.best ? "border-white/30" : "border-line"}`}>
        <ChevronDown className="size-3.5" />
      </span>
    </span>
  );
}

/* ---------- round 3: the idea vs the verdict ----------
   C3's tinted layout with one job per side. Left (plain): the idea in people's words: name, place, the why, and
   (expanded) the place's facts. Right (tinted): the verdict, in the order you'd decide: how the group feels → the
   best day and why → the worst blocker → booking → the button. Booking appears only on the right. */

const Cap = ({ children }: { children: ReactNode }) => <p className="mb-1 text-[10.5px] font-semibold tracking-wider text-muted uppercase">{children}</p>;

function Verdict({ idea, open, toggle, me, setMine, merge }: Props & { /** Booked: the button carries the booking */ merge: boolean }) {
  const b = idea.booking;
  const booked = b?.kind === "booked" ? b : null;
  const bestDay = idea.days.find((d) => d.state === "best");
  const reason = idea.good.filter((g) => !g.startsWith("Booked"))[0] ?? bestDay?.reason;
  const blocker = idea.out ? { out: true, text: idea.out } : idea.warn[0] ? { out: false, text: idea.warn[0] } : null;
  const blockLine = (x: { out: boolean; text: string }) => (
    <p key={x.text} className={`flex items-start gap-1.5 text-[12px] ${x.out ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
      {x.out ? <X className="mt-px size-3.5 shrink-0" /> : <CircleAlert className="mt-px size-3.5 shrink-0" />}
      <span>{x.text}</span>
    </p>
  );
  const ticketLine = b && !(merge && booked) && (
    <p className={`flex items-start gap-1.5 text-[12px] ${booked ? "text-accent" : "text-amber-700 dark:text-amber-300"}`}>
      <Ticket className="mt-px size-3.5 shrink-0" />
      <span>
        {booked ? `Booked ${booked.text}` : "Book ahead · not booked yet"}
        {open && booked?.conf && <span className="block text-muted">#{booked.conf}</span>}
      </span>
    </p>
  );
  const label = idea.best ? `Add to ${idea.best.day}` : idea.where === "Needs a place" ? "Find a place" : "Add to a day";
  const button = (
    <span className={`flex w-full items-center overflow-hidden rounded-full font-semibold ${idea.best ? "bg-accent text-on-accent" : "border border-line bg-surface text-fg"}`}>
      <span className="flex flex-1 flex-col items-center px-3 py-1.5 leading-tight">
        <span className="flex items-center gap-1.5 text-[12.5px]">
          {merge && booked && <Ticket className="size-3.5" />}
          {label}
          {merge && booked && `, ${booked.text.split(", ")[1] ?? ""}`}
        </span>
        {merge && booked && <span className="text-[10.5px] font-medium opacity-85">Booked{open && booked.conf ? ` · #${booked.conf}` : ""}</span>}
      </span>
      <span className={`self-stretch border-l px-2 ${idea.best ? "border-white/30" : "border-line"} grid place-items-center`}>
        <ChevronDown className="size-3.5" />
      </span>
    </span>
  );

  return (
    <Shell idea={idea}>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 244px" }}>
        {/* The idea */}
        <div className="min-w-0 space-y-3 px-4 py-3.5">
          <Title idea={idea} size={16.5} badge={false} />
          <Why idea={idea} clamp={!open} />
          {open && (
            <div className="border-t border-line pt-3">
              <Cap>About the place</Cap>
              <Facts idea={idea} />
            </div>
          )}
        </div>

        {/* The verdict */}
        <div className="relative flex min-w-0 flex-col gap-3 bg-surface-2/60 px-4 py-3.5">
          <span className="absolute top-2 right-2">
            <More />
          </span>
          <div className="pr-6">
            <Cap>Group</Cap>
            {open ? (
              <People idea={idea} me={me} setMine={setMine} w={84} compact />
            ) : (
              <>
                <span className="-ml-2 block">
                  <Band answers={idea.answers} w={120} />
                </span>
                <p className="mt-0.5 truncate text-[11.5px] text-muted">{groupSummary(idea.answers)}</p>
              </>
            )}
          </div>

          <div>
            <Cap>When</Cap>
            {idea.best ? (
              <>
                <p className="text-[13px]">
                  <b>{idea.best.day}</b>
                  {open && <span className="text-muted"> · {idea.best.title}</span>}
                </p>
                {!open && reason && <p className="truncate text-[12px] text-muted">{reason}</p>}
                {open && (
                  <ul className="mt-1 space-y-0.5 text-[12px]">
                    {idea.good
                      .filter((g) => !g.startsWith("Booked"))
                      .map((g) => (
                        <li key={g} className="flex items-start gap-1.5 text-accent">
                          <Check className="mt-px size-3.5 shrink-0" />
                          <span className="text-fg/85">{g}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-[12.5px] text-muted">{idea.where === "Needs a place" ? "Needs a place first" : "No day stands out yet"}</p>
            )}
            <div className="mt-1 space-y-0.5">
              {open ? [...idea.warn.map((t) => ({ out: false, text: t })), ...(idea.out ? [{ out: true, text: idea.out }] : [])].map(blockLine) : blocker && blockLine(blocker)}
            </div>
            {open && idea.best && (
              <p className="mt-1 text-[12px] text-muted">
                Also fits: {idea.days.filter((d) => d.state === "good").map((d) => d.d).join(", ") || "no other day"}
              </p>
            )}
          </div>

          <div className="mt-auto space-y-2">
            {ticketLine}
            {button}
          </div>
        </div>
      </div>
      <Toggle open={open} toggle={toggle} />
    </Shell>
  );
}

/* ---------- round 4: details on the left, a steady verdict on the right ----------
   Left = everything about the idea, top to bottom: what it is → about the place → comments (one per person,
   threaded) → bookings matched from forwarded emails. It's the side that grows. Right = the verdict and the
   one action: group → when → blockers → day button (day and time only). It stays put while the left grows:
   either it sticks while the page scrolls (no scroll-in-scroll), or the left side scrolls inside a capped card. */

function Mention({ text }: { text: string }) {
  return (
    <>
      {text.split(/(@\w+)/).map((t, i) =>
        t.startsWith("@") ? (
          <span key={i} className="rounded bg-accent/12 px-1 font-semibold text-accent">
            {t}
          </span>
        ) : (
          t
        ),
      )}
    </>
  );
}

/** Grows in place: animates height (grid rows 0fr → 1fr) and fades, so opening only ever adds below what's there */
function Grow({ open, children, className = "" }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} aria-hidden={!open}>
      <div className={`min-h-0 overflow-hidden ${className}`}>{children}</div>
    </div>
  );
}

/* Group rows share one grid: a fixed lead (avatar(s) + name) and the track at the same x and width, in every mode */
const LEAD = 64;
const TW = 104;
function TrackRow({ lead, children }: { lead: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-6 items-center text-[12.5px]">
      <span className="flex shrink-0 items-center gap-1.5" style={{ width: LEAD }}>
        {lead}
      </span>
      {children}
    </div>
  );
}
function SummaryTrack({ answers }: { answers: Answers }) {
  const a = answeredOf(answers);
  const x = (v: number) => ((v + 1) / 2) * TW;
  if (!a.length) return <SoftTrack faint w={TW} />;
  const lo = Math.min(...a);
  const hi = Math.max(...a);
  const mean = a.reduce((p, q) => p + q, 0) / a.length;
  return (
    <SoftTrack faint w={TW}>
      {hi > lo && (
        <span
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full"
          style={{ left: x(lo) - 6, width: x(hi) - x(lo) + 12, background: `linear-gradient(90deg,${stopsBetween(lo, hi, "66")})`, maskImage: "linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent)" }}
        />
      )}
      <Knob value={mean} x={x(mean)} />
    </SoftTrack>
  );
}

/** The group, sized to the group. The summary row never moves: folded it's all you see; open, the detail grows under it.
    Solo: your own track only. 2–5: a row per person. 6+: your row, then everyone else bucketed by answer. */
function GroupBlock({ idea, open, me, setMine }: { idea: Demo; open: boolean; me: string; setMine: (a: Answer) => void }) {
  const people = Object.keys(idea.answers);
  const n = people.length;
  const others = people.filter((p) => p !== me);
  const name = (p: string) => (
    <>
      <Ava name={p} size={18} />
      <span className={`truncate ${p === me ? "font-semibold" : ""}`}>{p === me ? "You" : p}</span>
    </>
  );
  const mine = (
    <TrackRow lead={name(me)}>
      <PersonTrack a={idea.answers[me]} editable onSet={setMine} w={TW} />
    </TrackRow>
  );
  if (n === 1)
    return (
      <div>
        <Cap>Your take</Cap>
        {mine}
        <p className="mt-0.5 text-[11.5px] text-muted" style={{ paddingLeft: LEAD }}>
          {idea.answers[me] === null ? "Must do, happy either way, or skip?" : LABEL[key(idea.answers[me])]}
        </p>
      </div>
    );
  const stack = (names: string[], max: number) => (
    <span className="flex items-center -space-x-1.5">
      {names.slice(0, max).map((p) => (
        <Ava key={p} name={p} size={18} />
      ))}
      {names.length > max && <span className="pl-2 text-[11px] text-muted">+{names.length - max}</span>}
    </span>
  );
  const buckets: [string, Answer][] = [
    ["Must do", 1],
    ["Happy to come", 0],
    ["Sitting out", -1],
    ["No answer yet", null],
  ];
  return (
    <div>
      <Cap>Group · {n}</Cap>
      <TrackRow lead={stack(people, n <= 3 ? 3 : 2)}>
        <SummaryTrack answers={idea.answers} />
      </TrackRow>
      <p className="truncate text-[11.5px] text-muted" style={{ paddingLeft: LEAD }}>
        {groupSummary(idea.answers)}
      </p>
      <Grow open={open}>
        <div className="mt-2.5 space-y-1 border-t border-line/70 pt-2.5">
          {n <= 5
            ? [me, ...others].map((p) => (
                <TrackRow key={p} lead={name(p)}>
                  <PersonTrack a={idea.answers[p]} editable={p === me} onSet={setMine} w={TW} />
                </TrackRow>
              ))
            : (
              <>
                {mine}
                <ul className="space-y-1.5 pt-1">
                  {buckets.map(([label, a]) => {
                    const who = others.filter((p) => idea.answers[p] === a);
                    return (
                      who.length > 0 && (
                        <li key={label} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="text-muted">
                            {label} <span className="text-fg/70">{who.length}</span>
                          </span>
                          <span title={who.join(", ")}>{stack(who, 5)}</span>
                        </li>
                      )
                    );
                  })}
                </ul>
              </>
            )}
        </div>
      </Grow>
    </div>
  );
}

/* ---------- round 5: the group, rethought ----------
   What the block answers: "is the group in?" and "what do I think?". Each option shows the group one way only. */

type GroupStyle = "track" | "G1" | "G2" | "G3" | "G4" | "P";
const T = PALETTES.teal;
const BUCKETS: { a: Answer; label: string; short: string }[] = [
  { a: 1, label: "Must do", short: "must do" },
  { a: 0, label: "Happy to come", short: "happy to come" },
  { a: -1, label: "Sitting out", short: "sitting out" },
  { a: null, label: "No answer yet", short: "haven't answered" },
];
const whoIs = (answers: Answers, a: Answer, me: string) => {
  const ps = Object.keys(answers).filter((p) => answers[p] === a);
  return [...ps.filter((p) => p === me), ...ps.filter((p) => p !== me)];
};
const nameOf = (p: string, me: string) => (p === me ? "You" : p);

/** Your answer as a 3-way choice: ✕ Skip · Happy to · ★ Must do (click again to clear) */
function Choice({ value, onSet }: { value: Answer; onSet: (a: Answer) => void }) {
  const opt = (a: -1 | 0 | 1, label: ReactNode, bg: string, fg: string) => {
    const on = value === a;
    return (
      <button
        onClick={() => onSet(on ? null : a)}
        className={`flex flex-1 items-center justify-center gap-1 rounded-full px-1 py-1 text-[11.5px] whitespace-nowrap font-semibold transition-colors ${on ? "" : "text-muted hover:text-fg"}`}
        style={on ? { background: bg, color: fg } : undefined}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex rounded-full border border-line bg-surface p-0.5">
      {opt(-1, <><X className="size-3" strokeWidth={3} /> Skip</>, T.out, "#fff")}
      {opt(0, "Happy to", "rgb(0 0 0 / .08)", "inherit")}
      {opt(1, <><Star className="size-3 fill-current" /> Must do</>, T.must, "#fff")}
    </div>
  );
}

function Stack({ names, max, size = 18, me }: { names: string[]; max: number; size?: number; me?: string }) {
  return (
    <span className="flex items-center -space-x-1.5">
      {names.slice(0, max).map((p) => (
        <span key={p} className={p === me ? "rounded-full ring-2 ring-accent" : ""} title={p}>
          <Ava name={p} size={size} />
        </span>
      ))}
      {names.length > max && <span className="pl-2 text-[11px] text-muted">+{names.length - max}</span>}
    </span>
  );
}

/** G1: your answer + who's in. Folded: the choice and one line of who's where; open: names per answer */
function GroupChoice({ idea, open, me, setMine }: GroupProps) {
  const n = Object.keys(idea.answers).length;
  const icon = (a: Answer) => (a === 1 ? <Star className="size-3" style={{ color: T.must, fill: T.must }} /> : a === -1 ? <X className="size-3" style={{ color: T.out }} strokeWidth={3} /> : a === 0 ? <span className="text-[11px] text-muted">~</span> : <span className="text-[11px] text-muted">?</span>);
  return (
    <div>
      <Cap>{n === 1 ? "Your take" : "You"}</Cap>
      <Choice value={idea.answers[me]} onSet={setMine} />
      {n > 1 && (
        <div className="mt-4">
          <Cap>Group · {n}</Cap>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {BUCKETS.map(({ a }) => {
              const who = whoIs(idea.answers, a, me);
              return who.length > 0 && (
                <span key={String(a)} className="flex items-center gap-1">
                  {icon(a)}
                  <Stack names={who} max={3} me={me} />
                </span>
              );
            })}
          </div>
          <Grow open={open}>
            <ul className="space-y-1 pt-2.5 text-[12px]">
              {BUCKETS.map(({ a, label }) => {
                const who = whoIs(idea.answers, a, me);
                return who.length > 0 && (
                  <li key={String(a)} className="flex gap-2">
                    <span className="w-24 shrink-0 text-muted">{label}</span>
                    <span className="text-fg/85">{who.map((p) => nameOf(p, me)).join(", ")}</span>
                  </li>
                );
              })}
            </ul>
          </Grow>
        </div>
      )}
    </div>
  );
}

/** G2 / G3 share a 3-stop track sized to the panel. Stops sit at fixed x so columns can line up under them. */
const GW = 196;
const STOPS: Record<string, number> = { "-1": 30, "0": 98, "1": 166 };
function StopTrack({ children, faint }: { children?: ReactNode; faint?: boolean }) {
  return (
    <div className="relative h-8" style={{ width: GW }}>
      <span className={`absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full ${faint ? "opacity-60" : ""}`} style={{ left: STOPS["-1"], right: GW - STOPS["1"], background: `linear-gradient(90deg,${T.out}99,${T.line} 25%,${T.line} 75%,${T.must}99)` }} />
      <span className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-fg/25" style={{ left: STOPS["0"] }} />
      {children}
    </div>
  );
}
const Under = ({ children }: { children: ReactNode }) => (
  <div className="grid text-center text-[10.5px] text-muted" style={{ width: GW, gridTemplateColumns: `${STOPS["-1"] * 2}px 1fr ${(GW - STOPS["1"]) * 2}px` }}>
    {children}
  </div>
);
const stopLabels = (
  <Under>
    <span style={{ color: T.out }}>Skip</span>
    <span>Happy to</span>
    <span style={{ color: T.must }}>Must do</span>
  </Under>
);

/** Columns of names lined up under the three stops (G2 and G3, open) */
function StopColumns({ idea, me }: { idea: Demo; me: string }) {
  const col = (a: Answer) => (
    <ul className="min-w-0 space-y-0.5">
      {whoIs(idea.answers, a, me).map((p) => (
        <li key={p} className={`truncate ${p === me ? "font-semibold text-fg" : "text-fg/80"}`}>
          {nameOf(p, me)}
        </li>
      ))}
    </ul>
  );
  const none = whoIs(idea.answers, null, me);
  return (
    <div className="pt-2.5 text-[12px]">
      <div className="grid gap-1 text-center" style={{ width: GW, gridTemplateColumns: "1fr 1fr 1fr" }}>
        {col(-1)}
        {col(0)}
        {col(1)}
      </div>
      {none.length > 0 && <p className="mt-2 text-[11.5px] text-muted">No answer yet: {none.map((p) => nameOf(p, me)).join(", ")}</p>}
    </div>
  );
}

/** G2: everyone on one track. Avatars sit at their answer and stack; yours has a ring. Click a stop to move yourself. */
function GroupOnTrack({ idea, open, me, setMine }: GroupProps) {
  const n = Object.keys(idea.answers).length;
  const none = whoIs(idea.answers, null, me);
  return (
    <div>
      <Cap>{n === 1 ? "Your take" : `Group · ${n}`}</Cap>
      <StopTrack faint={answeredOf(idea.answers).length === 0}>
        {([-1, 0, 1] as const).map((a) => {
          const who = whoIs(idea.answers, a, me);
          return (
            <button
              key={a}
              onClick={() => setMine(idea.answers[me] === a ? null : a)}
              title={`You: ${LABEL[key(a)]}`}
              className="absolute top-1/2 flex min-h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full hover:bg-fg/5"
              style={{ left: STOPS[String(a)] }}
            >
              {who.length ? (
                <Stack names={who} max={3} me={me} size={open ? 22 : 20} />
              ) : a === 1 ? (
                <Star className="size-3.5" style={{ color: T.must, fill: T.must }} />
              ) : a === -1 ? (
                <span className="grid size-3.5 place-items-center rounded-full" style={{ background: T.out }}>
                  <X className="size-2.5 text-white" strokeWidth={3.5} />
                </span>
              ) : (
                <span className="size-2 rounded-full bg-fg/25" />
              )}
            </button>
          );
        })}
      </StopTrack>
      {stopLabels}
      {!open && none.length > 0 && n > 1 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
          Waiting on <Stack names={none} max={4} size={16} me={me} />
        </p>
      )}
      {n > 1 && (
        <Grow open={open}>
          <StopColumns idea={idea} me={me} />
        </Grow>
      )}
    </div>
  );
}

/** G3: the knob + band summary, labelled stops; open, names line up in columns under the stops. Your answer is the Choice. */
function GroupColumns({ idea, open, me, setMine }: GroupProps) {
  const n = Object.keys(idea.answers).length;
  const a = answeredOf(idea.answers);
  const lo = a.length ? Math.min(...a) : 0;
  const hi = a.length ? Math.max(...a) : 0;
  const mean = a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0;
  const x = (v: number) => STOPS["-1"] + ((v + 1) / 2) * (STOPS["1"] - STOPS["-1"]);
  if (n === 1)
    return (
      <div>
        <Cap>Your take</Cap>
        <Choice value={idea.answers[me]} onSet={setMine} />
      </div>
    );
  return (
    <div>
      <Cap>Group · {n}</Cap>
      <StopTrack faint={!a.length}>
        {hi > lo && (
          <span
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full"
            style={{ left: x(lo) - 6, width: x(hi) - x(lo) + 12, background: `linear-gradient(90deg,${stopsBetween(lo, hi, "66")})`, maskImage: "linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent)" }}
          />
        )}
        {a.length > 0 && <Knob value={mean} x={x(mean)} />}
      </StopTrack>
      {stopLabels}
      <p className="mt-1 text-[11.5px] text-muted">{groupSummary(idea.answers)}</p>
      <Grow open={open}>
        <StopColumns idea={idea} me={me} />
      </Grow>
      <div className="mt-3">
        <Choice value={idea.answers[me]} onSet={setMine} />
      </div>
    </div>
  );
}

/** G4: a sentence, then your choice. Folded abbreviates long lists; open spells out every name. */
function GroupSentence({ idea, open, me, setMine }: GroupProps) {
  const n = Object.keys(idea.answers).length;
  const list = (ps: string[]) => {
    const names = ps.map((p) => nameOf(p, me));
    const shown = !open && names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} others`] : names;
    return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0];
  };
  const parts = BUCKETS.map(({ a }) => {
    const who = whoIs(idea.answers, a, me).filter((p) => !(n > 1 && p === me && a === null));
    if (!who.length) return null;
    const plural = who.length > 1 || who[0] === me;
    const verb = a === 1 ? (plural ? "must do this" : "must do this") : a === 0 ? (plural ? "are happy to come" : "is happy to come") : a === -1 ? (plural ? "are sitting out" : "is sitting out") : plural ? "haven't answered" : "hasn't answered";
    return (
      <span key={String(a)} className="block">
        <b className={`font-semibold ${a === 1 ? "" : ""}`} style={{ color: a === 1 ? T.must : a === -1 ? T.out : undefined }}>
          {list(who)}
        </b>{" "}
        <span className="text-fg/75">{verb}</span>
      </span>
    );
  }).filter(Boolean);
  return (
    <div>
      {n > 1 && (
        <>
          <Cap>Group · {n}</Cap>
          <p className="space-y-0.5 text-[12.5px] leading-snug">{parts.length ? parts : <span className="text-muted">Nobody has answered yet</span>}</p>
        </>
      )}
      <div className={n > 1 ? "mt-3" : ""}>
        {n === 1 && <Cap>Your take</Cap>}
        <Choice value={idea.answers[me]} onSet={setMine} />
      </div>
    </div>
  );
}

/* ---------- round 6: a poll (WhatsApp-style), with friendlier answers ----------
   Three rows, each: label · count, faces on the right, a thin bar underneath. Tapping a row is your vote (tap again
   to clear), so the result is also the input. Open adds names under each row and a "Waiting on" line. */

const LABEL_SETS: Record<string, { name: string; l: [string, string, string] }> = {
  yes: { name: "Yes! / Sure / Not for me", l: ["Yes!", "Sure", "Not for me"] },
  ya: { name: "Ya! / Sure / Not for me", l: ["Ya!", "Sure", "Not for me"] },
  keen: { name: "Keen / Sure / Pass", l: ["Keen", "Sure", "Pass"] },
  base: { name: "Must do / Happy to / Skip", l: ["Must do", "Happy to", "Skip"] },
};
let POLL = LABEL_SETS.yes.l; // set by the page's picker on each render

function GroupPoll({ idea, open, me, setMine }: GroupProps) {
  const people = Object.keys(idea.answers);
  const n = people.length;
  const solo = n === 1;
  const rows: { a: -1 | 0 | 1; label: string; col: string; icon: ReactNode }[] = [
    { a: 1, label: POLL[0], col: T.must, icon: <Star className="size-3 fill-current" /> },
    { a: 0, label: POLL[1], col: "#8f9a95", icon: <Check className="size-3" strokeWidth={3} /> },
    { a: -1, label: POLL[2], col: T.out, icon: <X className="size-3" strokeWidth={3} /> },
  ];
  const waiting = whoIs(idea.answers, null, me);
  return (
    <div>
      <Cap>{solo ? "Your take" : `Group · ${n}`}</Cap>
      <ul className="space-y-1">
        {rows.map((r) => {
          const who = whoIs(idea.answers, r.a, me);
          const mine = idea.answers[me] === r.a;
          return (
            <li key={r.a}>
              <button
                onClick={() => setMine(mine ? null : r.a)}
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
                    <span className="ml-auto">
                      <Stack names={who} max={4} size={16} me={me} />
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
                    <span className="block pt-1 text-[11.5px] text-muted">{who.map((p) => nameOf(p, me)).join(", ")}</span>
                  </Grow>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!solo && waiting.length > 0 && (
        <p className="mt-1.5 text-[11.5px] text-muted">
          {open ? `Waiting on ${waiting.map((p) => nameOf(p, me)).join(", ")}` : `${waiting.length} ${waiting.length === 1 ? "hasn't" : "haven't"} answered`}
        </p>
      )}
    </div>
  );
}

type GroupProps = { idea: Demo; open: boolean; me: string; setMine: (a: Answer) => void };
const GROUPS: Record<GroupStyle, (p: GroupProps) => ReactNode> = { track: GroupBlock, G1: GroupChoice, G2: GroupOnTrack, G3: GroupColumns, G4: GroupSentence, P: GroupPoll };

function Detail({ idea, open, toggle, me, setMine, long, group = "track" }: Props & { long: "sticky" | "scroll"; group?: GroupStyle }) {
  const GroupView = GROUPS[group];
  const ex = EXTRA[idea.id];
  // Solo trips: only your own notes (nobody else to comment)
  const solo = Object.keys(idea.answers).length === 1;
  const comments = solo ? ex.comments.filter((c) => c.by === me) : ex.comments;
  const bookings = ex.bookings;
  const booked = idea.booking?.kind === "booked" ? idea.booking : null;
  const time = booked?.text.split(", ")[1];
  const label = idea.best ? `Add to ${idea.best.day}${time ? `, ${time}` : ""}` : idea.where === "Needs a place" ? "Find a place" : "Add to a day";
  const reasons = idea.good.filter((g) => !g.startsWith("Booked"));
  const blockers = [
    ...(idea.booking?.kind === "needed" ? [{ out: false, text: "Book ahead · not booked yet" }] : []),
    ...idea.warn.map((t) => ({ out: false, text: t })),
    ...(idea.out ? [{ out: true, text: idea.out }] : []),
  ];
  // Folded shows the first reason and the first blocker; open adds the rest under them, in the same format
  const lines = [...reasons.map((t) => ({ kind: "good" as const, text: t })), ...blockers.map((b) => ({ kind: b.out ? ("out" as const) : ("warn" as const), text: b.text }))];
  const firstGood = lines.find((l) => l.kind === "good");
  const firstBad = lines.find((l) => l.kind !== "good");
  const glance = [firstGood, firstBad].filter(Boolean) as typeof lines;
  const rest = lines.filter((l) => !glance.includes(l));
  const leftCap = long === "scroll" && open ? "max-h-[360px] overflow-y-auto" : "";
  const SECTION = "pt-6"; // the one gap between sections, on both sides

  const vline = (l: (typeof lines)[number]) => (
    <p key={l.text} className={`flex items-start gap-1.5 text-[12px] ${l.kind === "good" ? "text-accent" : l.kind === "out" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
      {l.kind === "good" ? <Check className="mt-px size-3.5 shrink-0" /> : l.kind === "out" ? <X className="mt-px size-3.5 shrink-0" /> : <CircleAlert className="mt-px size-3.5 shrink-0" />}
      <span className={l.kind === "good" ? "text-fg/85" : ""}>{l.text}</span>
    </p>
  );
  const comment = (c: Comment, clamp: boolean) => (
    <li key={c.by + c.when} className="flex gap-2">
      <Ava name={c.by} size={20} />
      <div className="min-w-0 text-[13px] leading-snug">
        <p className="text-[12px]">
          <b className="font-semibold">{c.by === me ? "You" : c.by}</b> <span className="text-muted">· {c.when}</span>
        </p>
        <p className={`text-fg/85 ${clamp ? "line-clamp-2" : ""}`}>
          <Mention text={c.text} />
        </p>
      </div>
    </li>
  );

  return (
    <div className={`rounded-2xl border bg-surface ${answeredOf(idea.answers).includes(1) ? "border-amber-400/60" : "border-line"}`}>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 252px" }}>
        {/* Left: the idea, all of its details. Each section keeps its folded lines and grows under them. */}
        <div className={`min-w-0 px-4 pt-3.5 pb-4 ${leftCap}`}>
          <div>
            <Title idea={idea} size={16.5} badge={false} />
            <div className="mt-3">
              <Cap>About the place</Cap>
              {idea.facts.length > 0 ? <p className="text-[12.5px] text-fg/80">{idea.facts.join(" · ")}</p> : <p className="text-[12.5px] text-muted">Pick a place to see its details</p>}
              {idea.address && (
                <Grow open={open}>
                  <p className="mt-0.5 text-[12.5px] text-muted">{idea.address}</p>
                  <p className="mt-1 flex gap-3 text-[12.5px] text-accent">
                    <span className="flex items-center gap-1">
                      <MapIcon className="size-3.5" /> Map
                    </span>
                    <span className="flex items-center gap-1">
                      <ExternalLink className="size-3.5" /> Google Maps
                    </span>
                  </p>
                </Grow>
              )}
            </div>
          </div>

          {comments.length > 0 && (
            <div className={SECTION}>
              <Cap>{solo ? "Notes" : `Comments · ${comments.length}`}</Cap>
              <ul className="space-y-2.5">{comment(comments[0], !open)}</ul>
              {comments.length > 1 && (
                <Grow open={!open}>
                  <p className="mt-1 pl-7 text-[12px] text-muted">
                    +{comments.length - 1} more {comments.length === 2 ? "comment" : "comments"}
                  </p>
                </Grow>
              )}
              <Grow open={open}>
                <ul className="space-y-2.5 pt-2.5">{comments.slice(1).map((c) => comment(c, false))}</ul>
                <p className="mt-2.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-muted">{solo ? "Add a note" : "Add a comment · @ to mention"}</p>
              </Grow>
            </div>
          )}

          {(bookings.length > 0 || idea.booking?.kind === "needed") && (
            <Grow open={open}>
              <div className={SECTION}>
                <Cap>Bookings</Cap>
                {bookings.map((bk) => (
                  <div key={bk.title} className="flex items-start gap-2.5 rounded-xl border border-line px-3 py-2">
                    <Ticket className="mt-0.5 size-4 shrink-0 text-accent" />
                    <div className="min-w-0 text-[12.5px]">
                      <p className="font-semibold">{bk.title}</p>
                      <p className="text-fg/80">
                        {bk.when}
                        {bk.conf && <span className="text-muted"> · #{bk.conf}</span>}
                      </p>
                      <p className="text-[11.5px] text-muted">{bk.source}</p>
                    </div>
                  </div>
                ))}
                {bookings.length === 0 && <p className="rounded-xl border border-dashed border-line px-3 py-2 text-[12.5px] text-muted">Nothing booked yet. Forward the confirmation email and it shows up here.</p>}
              </div>
            </Grow>
          )}
        </div>

        {/* Right: Group at the top, When + the button at the bottom */}
        <div className="relative min-w-0 rounded-tr-2xl bg-surface-2/60">
          <div className="flex h-full flex-col px-4 pt-3.5 pb-4">
            <span className="absolute top-2 right-2">
              <More />
            </span>
            <div className="pr-6">
              <GroupView idea={idea} open={open} me={me} setMine={setMine} />
            </div>

            <div className={`mt-auto ${SECTION}`}>
              <Cap>When</Cap>
              {idea.best ? (
                <p className="text-[13px]">
                  <b>{idea.best.day}</b>
                  <span className="text-muted"> · {idea.best.title}</span>
                </p>
              ) : (
                <p className="text-[12.5px] text-muted">{idea.where === "Needs a place" ? "Needs a place first" : "No day stands out yet"}</p>
              )}
              <div className="mt-1 space-y-0.5">{glance.map(vline)}</div>
              <Grow open={open}>
                <div className="space-y-0.5 pt-0.5">{rest.map(vline)}</div>
                {idea.best && <p className="mt-1 text-[12px] text-muted">Also fits: {idea.days.filter((d) => d.state === "good").map((d) => d.d).join(", ") || "no other day"}</p>}
              </Grow>
              <div className="mt-4">
                <span className={`flex w-full items-center overflow-hidden rounded-full text-[12.5px] font-semibold ${idea.best ? "bg-accent text-on-accent" : "border border-line bg-surface text-fg"}`}>
                  <span className="flex-1 px-3 py-1.5 text-center">{label}</span>
                  <span className={`self-stretch border-l px-2 ${idea.best ? "border-white/30" : "border-line"} grid place-items-center`}>
                    <ChevronDown className="size-3.5" />
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Toggle open={open} toggle={toggle} />
    </div>
  );
}

const VARIANTS: { id: string; name: string; note: string; wideOpen?: boolean; round: 1 | 2 | 3 | 4 | 5 | 6; C: (p: Props) => ReactNode }[] = [
  { id: "P1", round: 6, name: "Group · poll", note: "WhatsApp-style rows: label · count, faces, a thin bar; tap a row to vote; open adds names and who's missing. Try the label sets above", C: (p) => <Detail {...p} long="sticky" group="P" /> },
  { id: "G1", round: 5, name: "Group · your answer + who's in", note: "a 3-way choice for you; one line of avatars per answer; open lists names", C: (p) => <Detail {...p} long="sticky" group="G1" /> },
  { id: "G2", round: 5, name: "Group · people on one track", note: "everyone's avatar sits at their answer; click a stop to move yours; open lines names up under the stops", C: (p) => <Detail {...p} long="sticky" group="G2" /> },
  { id: "G3", round: 5, name: "Group · band + columns", note: "the knob + band summary on labelled stops; open puts names in columns under them; your choice below", C: (p) => <Detail {...p} long="sticky" group="G3" /> },
  { id: "G4", round: 5, name: "Group · a sentence", note: "plain words for who's where, then your choice", C: (p) => <Detail {...p} long="sticky" group="G4" /> },
  { id: "E1", round: 4, name: "Details | verdict · growing card", note: "left holds all the details and grows; right: group at the top, when + button at the bottom", C: (p) => <Detail {...p} long="sticky" /> },
  { id: "E2", round: 4, name: "Details | verdict · scrolling details", note: "same, but an expanded card is capped and the left scrolls inside it", C: (p) => <Detail {...p} long="scroll" /> },
  { id: "D1", round: 3, name: "Idea | verdict · booking in the button", note: "left: what and why; tinted right: group → when → blocker → button. Booked shows on the button itself", C: (p) => <Verdict {...p} merge /> },
  { id: "D2", round: 3, name: "Idea | verdict · booking line", note: "same split; booking is one line above the button", C: (p) => <Verdict {...p} merge={false} /> },
  { id: "C1", round: 2, name: "Corners · whitespace", note: "no lines; a gutter and the grid do the separating", C: (p) => <CleanCorners {...p} sep="space" /> },
  { id: "C2", round: 2, name: "Corners · column line", note: "one hairline between the columns", C: (p) => <CleanCorners {...p} sep="line" /> },
  { id: "C3", round: 2, name: "Corners · tinted side", note: "the group + decision column sits on a faint tint", C: (p) => <CleanCorners {...p} sep="tint" /> },
  { id: "C4", round: 2, name: "Corners · cross rule", note: "column line plus a rule between the rows", C: (p) => <CleanCorners {...p} sep="cross" /> },
  { id: "Q1", round: 1, name: "Four quadrants", note: "2×2 grid; each quadrant grows in place", C: Quadrants },
  { id: "Q2", round: 1, name: "Corners", note: "regions pinned to the four corners; they grow towards the middle", C: Corners },
  { id: "Q3", round: 1, name: "Bento", note: "soft tiles; expanded re-flows into a 3-column bento with a photo", wideOpen: true, C: Bento },
  { id: "Q4", round: 1, name: "Week strip", note: "the decision is the week: dots that grow into day columns", C: WeekStrip },
  { id: "Q5", round: 1, name: "Side rail", note: "best day + group on a left rail that widens", wideOpen: true, C: SideRail },
];

export function ProtoCards() {
  usePalette("teal");
  const [ideaId, setIdeaId] = useState("ghibli");
  const [groupSize, setGroupSize] = useState(4);
  const [labelSet, setLabelSet] = useState("yes");
  POLL = LABEL_SETS[labelSet].l;
  // The trip page's Ideas pane is 480 / 600 / 700 / 780px at md / lg / xl / 2xl, with 20px padding each side
  const autoW = () => { const w = window.innerWidth; return w >= 1536 ? 740 : w >= 1280 ? 660 : w >= 1024 ? 560 : 440; };
  const [widthPick, setWidthPick] = useState<"auto" | number>("auto");
  const [winW, setWinW] = useState(autoW);
  useEffect(() => {
    const on = () => setWinW(autoW());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const cardW = widthPick === "auto" ? winW : widthPick;
  const [me] = useState("Vishal");
  const [mine, setMineMap] = useState<Record<string, Answer>>({});
  const [live, setLive] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"pair" | "live">("pair");
  const [earlier, setEarlier] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const base = IDEAS.find((i) => i.id === ideaId)!;
  const sizedAnswers = sized(base.answers, ideaId, groupSize);
  const idea: Demo = { ...base, answers: { ...sizedAnswers, ...(ideaId in mine ? { [me]: mine[ideaId] } : {}) } };
  const setMine = (a: Answer) => setMineMap((m) => ({ ...m, [ideaId]: a }));

  return (
    <div className="min-h-full bg-bg px-6 py-8 text-fg">
      <div className="mx-auto max-w-[1560px]">
        <h1 className="font-display text-[28px]">Idea card layouts</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-muted">
          Prototype playground. Same four regions everywhere: <b>what it is</b>, <b>how the group feels</b>, <b>why and fit</b>, <b>decision</b>. Each row shows a layout folded and
          expanded side by side, so you can see where each region goes and how it grows. Your track row is clickable.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px]">
          <span className="flex items-center gap-1">
            Idea
            {IDEAS.map((i) => (
              <button key={i.id} onClick={() => setIdeaId(i.id)} className={`rounded-full px-2.5 py-1 ${ideaId === i.id ? "bg-accent text-on-accent" : "hover:bg-surface-2"}`}>
                {i.name}
              </button>
            ))}
          </span>
          <span className="flex items-center gap-1">
            Show
            {(["pair", "live"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-full px-2.5 py-1 ${mode === m ? "bg-accent text-on-accent" : "hover:bg-surface-2"}`}>
                {m === "pair" ? "Folded + expanded" : "One card, click to grow"}
              </button>
            ))}
          </span>
          <label className="flex items-center gap-2" title="The idea card's width in the trip page's Ideas area">
            Card width
            <select value={widthPick} onChange={(e) => setWidthPick(e.target.value === "auto" ? "auto" : +e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1">
              <option value="auto">Like the trip page at this window ({winW}px)</option>
              <option value={440}>Small window · 440px</option>
              <option value={560}>Laptop · 560px</option>
              <option value={660}>Desktop · 660px</option>
              <option value={740}>Large screen · 740px</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Group
            <select value={groupSize} onChange={(e) => setGroupSize(+e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1">
              {[1, 2, 3, 4, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "Solo" : `${n} people`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Answers
            <select value={labelSet} onChange={(e) => setLabelSet(e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1">
              {Object.entries(LABEL_SETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Earlier rounds
            <select value={earlier} onChange={(e) => setEarlier(+e.target.value as 0 | 1 | 2 | 3 | 4 | 5)} className="rounded-lg border border-line bg-bg px-2 py-1">
              <option value={0}>Hide</option>
              <option value={5}>Round 5 (G1–G4)</option>
              <option value={4}>Rounds 4–5</option>
              <option value={3}>Rounds 3–5</option>
              <option value={2}>Rounds 2–5</option>
              <option value={1}>All rounds</option>
            </select>
          </label>
          <span className="text-muted">Colours: {PALETTES.teal.name}</span>
        </div>

        <div className="mt-6 space-y-10">
          {VARIANTS.filter((v) => v.round === 6 || (earlier !== 0 && v.round >= earlier)).map((v) => (
            <section key={v.id}>
              <p className="mb-2 text-[14px]">
                <b>
                  {v.id}. {v.name}
                </b>{" "}
                <span className="text-muted">· {v.note}</span>
              </p>
              {/* Cards render at the real Ideas-pane width (pane width minus its 20px padding each side) */}
              {mode === "pair" ? (
                <div className="flex flex-wrap items-start gap-6">
                  <div style={{ width: cardW }}>
                    <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Folded</p>
                    <v.C idea={idea} open={false} toggle={() => {}} me={me} setMine={setMine} />
                  </div>
                  <div style={{ width: cardW }}>
                    <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Expanded</p>
                    <v.C idea={idea} open toggle={() => {}} me={me} setMine={setMine} />
                  </div>
                </div>
              ) : (
                <div style={{ width: cardW }}>
                  <v.C idea={idea} open={!!live[v.id]} toggle={() => setLive((l) => ({ ...l, [v.id]: !l[v.id] }))} me={me} setMine={setMine} />
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
