// PROTOTYPE (proto/trip-focus): playground for the idea card's layout, folded vs expanded.
// Dev only, at /travelplanner/proto/cards. Every variant shows the same idea twice (folded, expanded) so the
// way each region grows is visible side by side. The four regions are always the same:
//   What it is · How the group feels · Why and fit · Decision
// To try another layout, add a component to VARIANTS.
import { useState, type ReactNode } from "react";
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

const VARIANTS: { id: string; name: string; note: string; wideOpen?: boolean; round: 1 | 2 | 3; C: (p: Props) => ReactNode }[] = [
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
  const [me] = useState("Vishal");
  const [mine, setMineMap] = useState<Record<string, Answer>>({});
  const [live, setLive] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"pair" | "live">("pair");
  const [earlier, setEarlier] = useState<0 | 1 | 2>(0);
  const base = IDEAS.find((i) => i.id === ideaId)!;
  const idea: Demo = { ...base, answers: { ...base.answers, ...(ideaId in mine ? { [me]: mine[ideaId] } : {}) } };
  const setMine = (a: Answer) => setMineMap((m) => ({ ...m, [ideaId]: a }));

  return (
    <div className="min-h-full bg-bg px-6 py-8 text-fg">
      <div className="mx-auto max-w-6xl">
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
          <label className="flex items-center gap-2">
            Earlier rounds
            <select value={earlier} onChange={(e) => setEarlier(+e.target.value as 0 | 1 | 2)} className="rounded-lg border border-line bg-bg px-2 py-1">
              <option value={0}>Hide</option>
              <option value={2}>Round 2 (C1–C4)</option>
              <option value={1}>Rounds 1–2 (all)</option>
            </select>
          </label>
          <span className="text-muted">Colours: {PALETTES.teal.name}</span>
        </div>

        <div className="mt-6 space-y-10">
          {VARIANTS.filter((v) => v.round === 3 || (earlier !== 0 && v.round >= earlier)).map((v) => (
            <section key={v.id}>
              <p className="mb-2 text-[14px]">
                <b>
                  {v.id}. {v.name}
                </b>{" "}
                <span className="text-muted">· {v.note}</span>
              </p>
              {mode === "pair" ? (
                <div className={`grid items-start gap-6 ${v.wideOpen ? "md:grid-cols-[minmax(0,440px)_minmax(0,1fr)]" : "md:grid-cols-2"}`}>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Folded</p>
                    <v.C idea={idea} open={false} toggle={() => {}} me={me} setMine={setMine} />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Expanded</p>
                    <v.C idea={idea} open toggle={() => {}} me={me} setMine={setMine} />
                  </div>
                </div>
              ) : (
                <div className={live[v.id] && v.wideOpen ? "max-w-[720px]" : "max-w-[460px]"}>
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
