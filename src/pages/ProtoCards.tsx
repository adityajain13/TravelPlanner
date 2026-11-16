// PROTOTYPE (proto/trip-focus): playground for the idea card's layout, folded vs expanded.
// Dev only, at /travelplanner/proto/cards. Every variant shows the same idea twice (folded, expanded) so the
// way each region grows is visible side by side. The four regions are always the same:
//   What it is · How the group feels · Why and fit · Decision
// To try another layout, add a component to VARIANTS.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, CircleAlert, ExternalLink, ImageIcon, Map as MapIcon, MoreHorizontal, Star, Ticket, Trash2, X } from "lucide-react";
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
/* Place data the real app already stores (Google details, cover photo, cost), as demo values; plus nearby ideas and source */
type PlaceInfo = { exception?: string; at?: [number, number]; desc?: string; costShort?: string; photo?: boolean; rating?: number; ratingCount?: string; price?: string; cost?: string; hours?: Record<string, string>; website?: string; phone?: string; nearby?: string[]; source?: string };
const PLACE: Record<string, PlaceInfo> = {
  ghibli: {
    desc: "Museum of Studio Ghibli's animation, with a short film you can only see here",
    exception: "Tickets only sold online, from the 10th of the month before",
    at: [35.6962, 139.5704],
    costShort: "¥1,000 pp",
    photo: true,
    rating: 4.4,
    ratingCount: "12k",
    cost: "¥1,000 per person",
    hours: { "Mon 14": "10–18", "Tue 15": "Closed", "Wed 16": "10–18", "Thu 17": "10–18", "Fri 18": "10–18", "Sat 19": "10–18", "Sun 20": "10–18" },
    website: "ghibli-museum.jp",
    phone: "0570-055777",
    nearby: ["Inokashira Park", "Kichijoji"],
    source: "Saved from a Google Maps link · Nov 2",
  },
  hakone: {
    desc: "Day-use hot spring with outdoor baths over the river, plus private family baths",
    exception: "Private baths are booked by phone: 0460-85-8411",
    at: [35.2357, 139.0962],
    costShort: "¥1,500 pp",
    photo: true,
    rating: 4.3,
    ratingCount: "3.1k",
    price: "¥¥",
    cost: "¥1,500 per person · private baths extra",
    hours: { "Mon 14": "10–20", "Tue 15": "10–20", "Wed 16": "10–20", "Thu 17": "10–20", "Fri 18": "10–20", "Sat 19": "10–20", "Sun 20": "10–20" },
    website: "yuryo.jp",
    nearby: ["Owakudani", "Hakone Open-Air Museum"],
    source: "From an article Maya shared · Nov 5",
  },
  onsen: { source: "Added as a rough idea by Sam · Nov 7" },
};
/** The trip's planned stops per day, with coordinates (demo; the real trip has these) */
const DAY_STOPS: Record<string, { name: string; at: [number, number] }[]> = {
  "Mon 14": [
    { name: "Haneda Airport", at: [35.5494, 139.7798] },
    { name: "Shinjuku Gyoen", at: [35.6852, 139.71] },
    { name: "Omoide Yokocho", at: [35.6932, 139.6996] },
  ],
  "Tue 15": [
    { name: "Senso-ji", at: [35.7148, 139.7967] },
    { name: "Ueno Park", at: [35.7156, 139.7745] },
    { name: "Akihabara", at: [35.6984, 139.7731] },
  ],
  "Wed 16": [
    { name: "Hakone-Yumoto Station", at: [35.2326, 139.1063] },
    { name: "Lake Ashi", at: [35.2046, 139.0247] },
    { name: "Owakudani", at: [35.2441, 139.0191] },
  ],
  "Thu 17": [
    { name: "Tokyo Station", at: [35.6812, 139.7671] },
    { name: "Kyoto Station", at: [34.9858, 135.7588] },
  ],
  "Fri 18": [
    { name: "Fushimi Inari", at: [34.9671, 135.7727] },
    { name: "Kiyomizu-dera", at: [34.9949, 135.785] },
  ],
  "Sat 19": [
    { name: "Arashiyama", at: [35.0094, 135.6668] },
    { name: "Kinkaku-ji", at: [35.0394, 135.7292] },
  ],
};
const DAY_TITLE: Record<string, string> = { "Mon 14": "Land in Tokyo", "Tue 15": "Tokyo east", "Wed 16": "Hakone day trip", "Thu 17": "Shinkansen to Kyoto", "Fri 18": "Kyoto", "Sat 19": "Kyoto west", "Sun 20": "Open day" };
const CLOSE_AT: Record<string, [number, number]> = {
  "Inokashira Park": [35.6998, 139.5733],
  "Kichijoji Harmonica Yokocho": [35.7035, 139.5795],
  "Hakone Open-Air Museum": [35.2448, 139.0509],
  "Hakone Shrine": [35.2048, 139.0253],
};
const CLOSED_ON: Record<string, string[]> = { ghibli: ["Tue 15"] };
const TRAVEL_DAYS = ["Thu 17"];
/** Planned stop times per day, in the same order as DAY_STOPS: start "HH:MM" and minutes there (demo) */
const STOP_TIMES: Record<string, [string, number][]> = {
  "Mon 14": [["09:30", 60], ["12:00", 90], ["18:00", 90]],
  "Tue 15": [["09:00", 120], ["12:00", 90], ["15:00", 120]],
  "Wed 16": [["09:00", 30], ["11:00", 120], ["14:30", 90]],
  "Thu 17": [["09:00", 30], ["12:00", 30]],
  "Fri 18": [["09:00", 150], ["13:00", 90]],
  "Sat 19": [["09:30", 180], ["14:30", 60]],
};
const VISIT_MIN: Record<string, number> = { ghibli: 150, hakone: 120 };
const hm = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
const BUFFER = 20; // minutes to get between stops

/** Where the idea lands in the day's clock: before, between or after the stops, and what it pushes back */
function placeInDay(f: DayFit, mins: number, openHours?: string, fixed?: string) {
  const times = (STOP_TIMES[f.day] ?? []).map(([t, d]) => ({ start: hm(t), end: hm(t) + d }));
  const s = f.slot;
  let start = 10 * 60;
  if (fixed) start = hm(fixed);
  else if (s && times.length) {
    if (s.kind === "start") start = times[0].start - BUFFER - mins;
    else if (s.kind === "end") start = times[times.length - 1].end + BUFFER;
    else start = times[s.i].end + BUFFER;
  }
  const m = openHours?.match(/(\d+)–(\d+)/);
  const opens = m ? +m[1] * 60 : undefined;
  const closes = m ? +m[2] * 60 : undefined;
  // Arriving before it opens? Wait for it (the rest of the day then shifts, shown as a push)
  if (!fixed && opens !== undefined && start < opens && s?.kind !== "start") start = opens;
  // A booked slot is fixed: the visit just ends when the place closes (only the start can be "outside")
  const cut = !!fixed && closes !== undefined && start + mins > closes;
  const end = cut ? closes! : start + mins;
  const next = s?.kind === "between" ? times[s.i + 1] : s?.kind === "start" ? times[0] : undefined;
  const push = next ? Math.max(0, end + BUFFER - next.start) : 0;
  const outside = opens !== undefined && closes !== undefined && (start < opens || end > closes);
  return { cut, times, start, end, push, nextIndex: s?.kind === "between" ? s.i + 1 : s?.kind === "start" ? 0 : -1, opens, closes, outside };
}
/** Other ideas in the pool and how far they are, per idea (demo) */
const CLOSE_IDEAS: Record<string, string[]> = { ghibli: ["Inokashira Park", "Kichijoji Harmonica Yokocho"], hakone: ["Hakone Open-Air Museum", "Hakone Shrine"] };

/** Where the trip is: nothing planned yet, days planned (nothing booked), or bookings matched */
type Stage = "empty" | "planned" | "booked";
let STAGE: Stage = "booked"; // set by the page's picker on each render

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
  const mean = a.reduce<number>((p, q) => p + q, 0) / a.length;
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
  const mean = a.reduce<number>((p, q) => p + q, 0) / a.length;
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
  const mean = a.length ? a.reduce<number>((p, q) => p + q, 0) / a.length : 0;
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

/** A schematic of the best day: its stops in order, joined, and this idea's pin with a dashed line to the nearest stop.
    No map tiles, just the coordinates the trip already has, so it costs nothing to draw. */
function DayMap({ day, at, name, reason }: { day: string; at: [number, number]; name: string; reason?: string }) {
  const stops = DAY_STOPS[day];
  const W = 300;
  const H = 64;
  const pad = 10;
  const pts = [...stops.map((s) => s.at), at];
  const kx = Math.cos((pts.reduce((a, p) => a + p[0], 0) / pts.length) * (Math.PI / 180));
  const xs = pts.map((p) => p[1] * kx);
  const ys = pts.map((p) => p[0]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sc = Math.min((W - pad * 2) / (x1 - x0 || 1), (H - pad * 2) / (y1 - y0 || 1));
  const ox = (W - (x1 - x0) * sc) / 2;
  const oy = (H - (y1 - y0) * sc) / 2;
  const P = (p: [number, number]) => [ox + (p[1] * kx - x0) * sc, H - (oy + (p[0] - y0) * sc)] as const;
  const sp = stops.map((s) => P(s.at));
  const ip = P(at);
  const near = sp.reduce((b, p) => (Math.hypot(p[0] - ip[0], p[1] - ip[1]) < Math.hypot(b[0] - ip[0], b[1] - ip[1]) ? p : b), sp[0]);
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface-2/40">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="block h-16 w-full" role="img" aria-label={`${name} and the stops on ${day}`}>
          <polyline points={sp.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeOpacity=".28" strokeWidth="2" strokeLinejoin="round" />
          <line x1={near[0]} y1={near[1]} x2={ip[0]} y2={ip[1]} stroke="#d97706" strokeWidth="1.5" strokeDasharray="3 3" />
          {sp.map((p, i) => (
            <g key={i}>
              <circle cx={p[0]} cy={p[1]} r="7" fill="var(--surface, #fff)" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.5" />
              <text x={p[0]} y={p[1] + 3} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor" fillOpacity=".7">
                {i + 1}
              </text>
            </g>
          ))}
          <circle cx={ip[0]} cy={ip[1]} r="6.5" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
        </svg>
      </div>
      <p className="mt-1 truncate text-[11.5px] text-muted">
        <b className="font-semibold text-fg/75">On {day}:</b> {stops.map((s, i) => `${i + 1} ${s.name}`).join(" · ")}
        {reason && <span className="text-amber-700 dark:text-amber-300"> · ● {reason}</span>}
      </p>
    </div>
  );
}

/** What fills the spare space on a wide, folded card: the first two candidates whose condition holds, in this order.
    1 booking summary · 2 the best day's map · 3 other ideas close by · 4 one Google exception · 5 a second comment · else nothing.
    Each has an estimated height; the card only takes the ones that fit in the space the right side leaves (at most two). */
function spareSlot(idea: Demo, place: PlaceInfo, bookings: Booking[], comments: Comment[], me: string, reason?: string): { key: string; h: number; node: ReactNode }[] {
  const out: { key: string; h: number; node: ReactNode }[] = [];
  if (bookings[0])
    out.push({
      key: "booking",
      h: 44,
      node: (
        <div>
          <Cap>Booked</Cap>
          <p className="flex items-center gap-2 text-[12.5px]">
            <Ticket className="size-4 shrink-0 text-accent" />
            <span>
              <b className="font-semibold">{bookings[0].when}</b>
              {bookings[0].conf && <span className="text-muted"> · #{bookings[0].conf}</span>}
              <span className="text-muted"> · {bookings[0].title.split(" · ")[1] ?? bookings[0].title}</span>
            </span>
          </p>
        </div>
      ),
    });
  if (idea.best && place.at && (DAY_STOPS[idea.best.day]?.length ?? 0) >= 2) out.push({ key: "map", h: 86, node: <DayMap day={idea.best.day} at={place.at} name={idea.name} reason={reason} /> });
  const close = CLOSE_IDEAS[idea.id] ?? [];
  if (close.length >= 2)
    out.push({
      key: "close",
      h: 56,
      node: (
        <div>
          <Cap>{close.length} ideas close by</Cap>
          <div className="flex flex-wrap items-center gap-1.5">
            {close.map((n) => (
              <span key={n} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-fg/80">
                {n}
              </span>
            ))}
            <span className="text-[12px] text-muted">could be one day</span>
          </div>
        </div>
      ),
    });
  if (place.exception)
    out.push({
      key: "google",
      h: 50,
      node: (
        <div>
          <Cap>Good to know</Cap>
          <p className="flex items-start gap-1.5 text-[12.5px] text-fg/85">
            <CircleAlert className="mt-px size-3.5 shrink-0 text-muted" />
            {place.exception}
          </p>
        </div>
      ),
    });
  if (comments[1])
    out.push({
      key: "comment",
      h: 44,
      node: (
        <div className="flex gap-2 pl-0">
          <Ava name={comments[1].by} size={20} />
          <p className="line-clamp-2 min-w-0 text-[13px] leading-snug text-fg/85">
            <b className="font-semibold">{comments[1].by === me ? "You" : comments[1].by}:</b> <Mention text={comments[1].text} />
          </p>
        </div>
      ),
    });
  return out;
}

function Detail({ idea, open, toggle, me, setMine, long, group = "track" }: Props & { long: "sticky" | "scroll"; group?: GroupStyle }) {
  const GroupView = GROUPS[group];
  const ex = EXTRA[idea.id];
  // Solo trips: only your own notes (nobody else to comment)
  const solo = Object.keys(idea.answers).length === 1;
  const comments = solo ? ex.comments.filter((c) => c.by === me) : ex.comments;
  const bookings = STAGE === "booked" ? ex.bookings : [];
  const place = PLACE[idea.id] ?? {};
  const booked = idea.booking?.kind === "booked" ? idea.booking : null;
  const time = booked?.text.split(", ")[1];
  const label = idea.best ? `Add to ${idea.best.day}${time ? `, ${time}` : ""}` : idea.where === "Needs a place" ? "Find a place" : "Add to a day";
  // Timing facts belong to When: that day's hours, the visit length, and the best time only when it matters
  const dayHours = idea.best ? place.hours?.[idea.best.day] : undefined;
  const visit = idea.facts.find((f) => f.startsWith("About "))?.replace("About ", "about ");
  const bestTime = idea.facts.find((f) => f.startsWith("Best "));
  const slotHour = time ? parseInt(time) : null;
  const timingClash = bestTime === "Best early" && slotHour !== null && slotHour >= 12 ? `Best early · your slot is ${time}` : null;
  const reasons = [...idea.good.filter((g) => !g.startsWith("Booked")), ...(bestTime && !booked ? [bestTime] : [])];
  const blockers = [
    ...(idea.booking?.kind === "needed" ? [{ out: false, text: "Book ahead · not booked yet" }] : []),
    ...(timingClash ? [{ out: false, text: timingClash }] : []),
    ...idea.warn.map((t) => ({ out: false, text: t })),
    ...(idea.out ? [{ out: true, text: idea.out }] : []),
  ];
  // Folded shows the first reason and the first blocker; open adds the rest under them, in the same format
  const lines = [...reasons.map((t) => ({ kind: "good" as const, text: t })), ...blockers.map((b) => ({ kind: b.out ? ("out" as const) : ("warn" as const), text: b.text }))];
  const firstGood = lines.find((l) => l.kind === "good");
  // "Won't work" outranks "watch out" for the one folded blocker
  const firstBad = lines.find((l) => l.kind === "out") ?? lines.find((l) => l.kind === "warn");
  const glance = [firstGood, firstBad].filter(Boolean) as typeof lines;
  const rest = lines.filter((l) => !glance.includes(l));
  const leftCap = long === "scroll" && open ? "max-h-[360px] overflow-y-auto" : "";
  // How much room the right side leaves under the left side's own content (folded, wide cards)
  const leftTop = useRef<HTMLDivElement>(null);
  const rGroup = useRef<HTMLDivElement>(null);
  const rWhen = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      if (!leftTop.current || !rGroup.current || !rWhen.current) return;
      const right = rGroup.current.offsetHeight + 24 + rWhen.current.offsetHeight;
      setRoom(right - leftTop.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    [leftTop.current, rGroup.current, rWhen.current].forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, []);
  const spare: ReturnType<typeof spareSlot> = [];
  {
    let used = 0;
    for (const c of spareSlot(idea, place, bookings, comments, me, reasons[0])) {
      const need = (spare.length ? 20 : 24) + c.h;
      // The first item may stretch the card a little (24px); a second one has to fit
      const slack = spare.length ? 0 : 24;
      if (spare.length < 2 && used + need <= room + slack) (spare.push(c), (used += need));
    }
  }
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
    // Laid out by the card's own width (container query): side by side from 600px, stacked below that
    <div className={`@container relative rounded-2xl border bg-surface ${answeredOf(idea.answers).includes(1) ? "border-amber-400/60" : "border-line"}`}>
      <span className="absolute top-2 right-2 z-10">
        <More />
      </span>
      <div className="grid grid-cols-1 @min-[600px]:grid-cols-[minmax(0,1fr)_252px]">
        {/* Left: the idea, all of its details. Each section keeps its folded lines and grows under them. */}
        <div className={`min-w-0 px-4 pt-3.5 pb-4 pr-11 @min-[600px]:pr-4 ${leftCap}`}>
          <div ref={leftTop}>
          {/* What is it, and is it worth it? Timing lives on the When side. */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Title idea={idea} size={16.5} badge={false} />
              {(place.rating || place.costShort || place.price) && (
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-fg/80">
                  {place.rating && (
                    <>
                      <Star className="size-3 fill-amber-400 text-amber-400" /> {place.rating} <span className="text-muted">({place.ratingCount})</span>
                    </>
                  )}
                  {place.rating && (place.costShort || place.price) && <span className="text-muted">·</span>}
                  {(place.costShort || place.price) && <span>{place.costShort ?? place.price}</span>}
                </p>
              )}
            </div>
            {place.photo && (
              <div
                className="grid size-[76px] shrink-0 place-items-center rounded-xl text-white/70"
                style={{ background: `linear-gradient(135deg,hsl(${hue(idea.name)} 35% 72%),hsl(${hue(idea.name) + 50} 30% 52%))` }}
                title="Cover photo (demo)"
              >
                <ImageIcon className="size-5" />
              </div>
            )}
          </div>
          {place.desc ? (
            <p className={`mt-2.5 text-[13px] leading-snug text-fg/85 ${open ? "" : "line-clamp-2"}`}>{place.desc}</p>
          ) : (
            idea.where === "Needs a place" && <p className="mt-2.5 text-[12.5px] text-muted">Pick a place to see what it is</p>
          )}
          {idea.address && (
            <Grow open={open}>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-accent">
                <span className="flex items-center gap-1">
                  <MapIcon className="size-3.5" /> Map
                </span>
                <span className="flex items-center gap-1">
                  <ExternalLink className="size-3.5" /> Google Maps
                </span>
                {place.website && <span>Website</span>}
              </p>
            </Grow>
          )}

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

          </div>
          {/* Spare space on wide cards: the first two candidates that apply (see spareSlot). Folded only;
              open, the full sections below take over. */}
          {spare.length > 0 && (
            <div className="hidden @min-[600px]:block">
              <Grow open={!open}>
                <div className="space-y-5 pt-6">
                  {spare.map((x) => (
                    <div key={x.key}>{x.node}</div>
                  ))}
                </div>
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

          {place.nearby && (
            <Grow open={open}>
              <div className={SECTION}>
                <Cap>Also near here</Cap>
                <div className="flex flex-wrap gap-1.5">
                  {place.nearby.map((n) => (
                    <span key={n} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-fg/80">
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            </Grow>
          )}

          {place.source && (
            <Grow open={open}>
              <p className="pt-5 text-[11.5px] text-muted">{place.source}</p>
            </Grow>
          )}
        </div>

        {/* Right: Group at the top, When + the button at the bottom.
            Stacked (narrow card): a tinted band under the idea, Group | When side by side. */}
        <div className="min-w-0 border-t border-line bg-surface-2/60 @min-[600px]:rounded-tr-2xl @min-[600px]:border-t-0">
          {/* Stacked: Group keeps its small-window width (194px); When takes the rest, since it carries the longer text */}
          <div className="grid h-full grid-cols-[194px_minmax(0,1fr)] gap-x-5 px-4 pt-3.5 pb-4 @min-[600px]:flex @min-[600px]:flex-col">
            <div ref={rGroup} className="min-w-0 @min-[600px]:pr-6">
              <GroupView idea={idea} open={open} me={me} setMine={setMine} />
            </div>

            <div className="flex min-w-0 flex-col @min-[600px]:mt-auto @min-[600px]:block @min-[600px]:pt-6">
              <div ref={rWhen} className="flex h-full flex-col">
              <Cap>When</Cap>
              {idea.best ? (
                <>
                  <p className="text-[13px]">
                    <b>{idea.best.day}</b>
                    <span className="text-muted"> · {idea.best.title}</span>
                  </p>
                  {(dayHours || visit) && (
                    <p className="text-[12px] text-muted">{[dayHours && `Open ${dayHours}`, visit].filter(Boolean).join(" · ")}</p>
                  )}
                </>
              ) : (
                <p className="text-[12.5px] text-muted">{idea.where === "Needs a place" ? "Needs a place first" : "No day stands out yet"}</p>
              )}
              <div className="mt-1 space-y-0.5">{glance.map(vline)}</div>
              <Grow open={open}>
                <div className="space-y-0.5 pt-0.5">{rest.map(vline)}</div>
                {idea.best && <p className="mt-1 text-[12px] text-muted">Also fits: {idea.days.filter((d) => d.state === "good").map((d) => d.d).join(", ") || "no other day"}</p>}
              </Grow>
              <div className="mt-auto pt-4 @min-[600px]:mt-0">
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
      </div>
      <Toggle open={open} toggle={toggle} />
    </div>
  );
}

/* ---------- round 7: evidence | decision ----------
   Left = everything you weigh: what it is, How it fits (a map of the day plus every ✓ / ⚠ / ✕ reason, once),
   then a comment count (the thread lives at the bottom when open). Right = only what you act on: your vote,
   the proposed day, the button. Tapping a day under the map changes the proposal, and the button follows. */

const toRad = (d: number) => (d * Math.PI) / 180;
function kmBetween(a: [number, number], b: [number, number]) {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
const kmText = (k: number) => (k < 1 ? "under 1 km" : `${Math.round(k)} km`);

type Slot = { kind: "start" | "between" | "end"; i: number; detour: number; near: number };
/** The cheapest place to slot a point into a day's route: before the first stop, between two, or after the last */
function bestSlot(at: [number, number], stops: { at: [number, number] }[]): Slot {
  const n = stops.length;
  let best: Slot = { kind: "start", i: 0, detour: kmBetween(at, stops[0].at), near: 0 };
  const end = kmBetween(stops[n - 1].at, at);
  if (end < best.detour) best = { kind: "end", i: n - 1, detour: end, near: n - 1 };
  for (let i = 0; i < n - 1; i++) {
    const d = kmBetween(stops[i].at, at) + kmBetween(at, stops[i + 1].at) - kmBetween(stops[i].at, stops[i + 1].at);
    if (d < best.detour) best = { kind: "between", i, detour: d, near: kmBetween(stops[i].at, at) < kmBetween(stops[i + 1].at, at) ? i : i + 1 };
  }
  return best;
}

type DayFit = { day: string; state: "fits" | "far" | "free" | "closed" | "travel"; slot?: Slot; stops: { name: string; at: [number, number] }[] };
function fitDays(idea: Demo, at: [number, number] | undefined): DayFit[] {
  return DAYS.map((day) => {
    const stops = STAGE === "empty" ? [] : (DAY_STOPS[day] ?? []);
    if (CLOSED_ON[idea.id]?.includes(day)) return { day, state: "closed", stops };
    // A long-distance travel day isn't a day to slot sights into, even if the line passes nearby
    if (TRAVEL_DAYS.includes(day) && stops.length) return { day, state: "travel", stops };
    if (!at || !stops.length) return { day, state: "free", stops };
    const slot = bestSlot(at, stops);
    return { day, state: slot.detour > 40 ? "far" : "fits", slot, stops };
  });
}
function slotText(f: DayFit): string {
  const s = f.slot!;
  const st = f.stops;
  if (f.state === "far") return `Far from ${f.day}'s stops · +${kmText(s.detour)}`;
  if (s.kind === "between") return `Fits between ${s.i + 1} ${st[s.i].name} and ${s.i + 2} ${st[s.i + 1].name} · ${s.detour < 1 ? "barely a detour" : `+${kmText(s.detour)} detour`}`;
  if (s.kind === "start") return `Start ${f.day} here · ${kmText(s.detour)} before ${st[0].name}`;
  return `End ${f.day} here · ${kmText(s.detour)} after ${st[st.length - 1].name}`;
}

/** The fit, drawn: the day's route (numbered), the detour through this idea (dashed amber), other ideas nearby (hollow) */
function FitMap({ f, at, near, tall }: { f: DayFit; at: [number, number]; near: [number, number][]; tall: boolean }) {
  const W = 320;
  const H = tall ? 132 : 76;
  const pad = 14;
  const pts: [number, number][] = [...f.stops.map((x) => x.at), at, ...near];
  const kx = Math.cos(toRad(pts.reduce((a, p) => a + p[0], 0) / pts.length));
  const xs = pts.map((p) => p[1] * kx);
  const ys = pts.map((p) => p[0]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sc = Math.min((W - pad * 2) / (x1 - x0 || 0.01), (H - pad * 2) / (y1 - y0 || 0.01));
  const ox = (W - (x1 - x0) * sc) / 2;
  const oy = (H - (y1 - y0) * sc) / 2;
  const P = (p: [number, number]) => [ox + (p[1] * kx - x0) * sc, H - (oy + (p[0] - y0) * sc)] as const;
  const sp = f.stops.map((x) => P(x.at));
  const ip = P(at);
  const s = f.slot;
  const detour =
    s && f.state === "fits" ? (s.kind === "between" ? [sp[s.i], ip, sp[s.i + 1]] : s.kind === "start" ? [ip, sp[0]] : [sp[sp.length - 1], ip]) : s ? [sp[s.near], ip] : [];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full transition-[height] duration-300" style={{ height: H }} role="img" aria-label={`How it fits on ${f.day}`}>
      {sp.length > 1 && <polyline points={sp.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeOpacity={s?.kind === "between" ? ".14" : ".28"} strokeWidth="2" strokeLinejoin="round" />}
      {detour.length > 1 && <polyline points={detour.map((p) => p.join(",")).join(" ")} fill="none" stroke="#d97706" strokeWidth="1.75" strokeDasharray="4 3" strokeLinejoin="round" />}
      {near.map((n, i) => {
        const [x, y] = P(n);
        return <circle key={i} cx={x} cy={y} r="4" fill="none" stroke="#f59e0b" strokeOpacity=".7" strokeWidth="1.5" />;
      })}
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

/* ---------- Who's going? (adding an idea only some of the group want) ----------
   Opens from the day button when the poll isn't unanimous. Ticks come from the poll (Yes!/Sure and unanswered
   = going). The app splits the day on its own once a stop has a `who` (branches.ts), so this only has to say,
   in plain words, where the group splits, what the others do, and where everyone meets again. */

/** Who drives on each day when the trip is by car (demo) */
const DRIVER: Record<string, string> = { "Wed 16": "Sam" };
/** One of each person's own Yes! ideas nearby, offered to the people sitting out (demo) */
const OWN_IDEA: Record<string, Record<string, string>> = { hakone: { Sam: "Hakone Open-Air Museum" }, ghibli: { Sam: "Kichijoji Harmonica Yokocho" } };

/** "You, Maya and Aditya" at the start of a sentence; "you, Maya and Aditya" inside one (names keep their capitals) */
const listNames = (ps: string[], me: string, mid = false) => {
  const n = ps.map((p) => (p === me ? "you" : p));
  const t = n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n.at(-1)}` : (n[0] ?? "");
  return mid || !t ? t : t[0].toUpperCase() + t.slice(1);
};

function WhoGoing({ idea, day, me, onAdd, onCancel }: { idea: Demo; day: DayFit; me: string; onAdd: (who: string[]) => void; onCancel: () => void }) {
  const people = [me, ...Object.keys(idea.answers).filter((p) => p !== me)];
  const [going, setGoing] = useState<string[]>(people.filter((p) => idea.answers[p] !== -1));
  const [others, setOthers] = useState<"free" | "own">("free");
  const [ride, setRide] = useState<"drop" | "own">("drop");
  const out = people.filter((p) => !going.includes(p));
  const everyone = out.length === 0;
  const st = day.stops;
  const s = day.slot;
  const visit = idea.facts.find((f) => f.startsWith("About "))?.replace("About ", "about ");
  const tag = (a: Answer) => (a === 1 ? POLL[0] : a === 0 ? POLL[1] : a === -1 ? POLL[2] : "hasn't answered");
  const own = out.length === 1 ? OWN_IDEA[idea.id]?.[out[0]] : undefined;
  const driver = DRIVER[day.day];
  const rejoin = s && s.kind === "between" ? st[s.i + 1] : s && s.kind === "start" ? st[0] : undefined;
  const place = PLACE[idea.id];
  const farKm = rejoin && place?.at ? kmBetween(place.at, rejoin.at) : 0;

  const preview = everyone
    ? `Everyone goes to ${idea.name} on ${day.day}. No split.`
    : !st.length || !s
      ? `On ${day.day} (nothing planned yet), ${listNames(going, me, true)} go to ${idea.name}${visit ? ` (${visit})` : ""}. ${listNames(out, me)} ${out.length > 1 || out[0] === me ? "have" : "has"} the day free.`
      : s.kind === "between"
        ? `After ${s.i + 1} ${st[s.i].name}, ${listNames(going, me, true)} go to ${idea.name}${visit ? ` (${visit})` : ""}. ${listNames(out, me)} ${others === "own" && own ? `${out.length > 1 || out[0] === me ? "go" : "goes"} to ${own}` : `${out.length > 1 || out[0] === me ? "have" : "has"} free time`}. Everyone meets again at ${s.i + 2} ${st[s.i + 1].name}.`
        : s.kind === "start"
          ? `${listNames(going, me)} start ${day.day} at ${idea.name}. ${listNames(out, me)} ${out.length > 1 || out[0] === me ? "join" : "joins"} you at 1 ${st[0].name}.`
          : `After ${st.length} ${st[st.length - 1].name}, ${listNames(going, me, true)} go to ${idea.name}. ${listNames(out, me)} ${out.length > 1 || out[0] === me ? "are" : "is"} done for the day.`;

  const notes: { warn: boolean; text: string }[] = [];
  if (!going.length) notes.push({ warn: true, text: "Pick at least one person" });
  if (going.length && !going.includes(me)) notes.push({ warn: false, text: "You're not going: it'll show on your day as their plan" });
  const unanswered = going.filter((p) => idea.answers[p] === null && p !== me);
  if (unanswered.length) notes.push({ warn: false, text: `${listNames(unanswered, me)} hasn't answered yet. You can change who's going later.` });
  if (!everyone && farKm > 5) notes.push({ warn: true, text: `${idea.name} is ${kmText(farKm)} from ${rejoin!.name}, where you meet again` });

  return (
    <div className="absolute right-2 bottom-11 z-30 w-[min(360px,calc(100%-16px))] rounded-2xl border border-line bg-surface p-4 text-[13px] shadow-2xl" role="dialog" aria-label="Who's going?">
      <p className="text-[14px] font-semibold">
        Who's going to {idea.name} on {day.day}?
      </p>
      <ul className="mt-2.5 space-y-1">
        {people.map((p) => {
          const on = going.includes(p);
          const a = idea.answers[p];
          return (
            <li key={p}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2">
                <input type="checkbox" checked={on} onChange={() => setGoing((g) => (on ? g.filter((x) => x !== p) : [...g, p]))} className="accent-[var(--accent)]" />
                <Ava name={p} size={20} />
                <span className={p === me ? "font-semibold" : ""}>{p === me ? "You" : p}</span>
                <span className={`ml-auto text-[11.5px] ${a === -1 ? "" : "text-muted"}`} style={a === -1 ? { color: T.out } : a === 1 ? { color: T.must } : undefined}>
                  {tag(a)}
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
        <div className="mt-3">
          <Cap>What will {listNames(out, me, true)} do?</Cap>
          <div className="space-y-1">
            <label className="flex items-center gap-2">
              <input type="radio" checked={others === "free"} onChange={() => setOthers("free")} /> Free time
            </label>
            {own && (
              <label className="flex items-center gap-2">
                <input type="radio" checked={others === "own"} onChange={() => setOthers("own")} /> One of {out[0]}'s ideas: <b className="font-semibold">{own}</b>
              </label>
            )}
            <button onClick={() => setGoing(people)} className="text-[12.5px] text-accent hover:underline">
              Everyone comes along instead
            </button>
          </div>
        </div>
      )}

      {!everyone && driver && out.includes(driver) && going.length > 0 && (
        <div className="mt-3">
          <Cap>Getting there · {driver} is driving on {day.day}</Cap>
          <div className="space-y-1">
            <label className="flex items-center gap-2">
              <input type="radio" checked={ride === "drop"} onChange={() => setRide("drop")} /> {driver} drops you off and picks you up
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={ride === "own"} onChange={() => setRide("own")} /> You'll get there yourselves
            </label>
          </div>
        </div>
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
        <button
          disabled={!going.length}
          onClick={() => onAdd(going)}
          className="rounded-full bg-accent px-4 py-1.5 font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {everyone ? "Add for everyone" : `Add for ${going.length}`}
        </button>
      </div>
    </div>
  );
}

/* ---------- round 8: the week, then the day ----------
   Folded: a week strip is the one day control. Each day is green (fits), grey (free), red (closed / far) or amber
   (travel), with the detour; tap a day to propose it, and the button follows. Open: where in that day it lands,
   either as the day's stop list with the idea slotted in, or on the day's clock against the place's opening hours. */

function WeekPicker({ fits, sel, bookedDay, onPick }: { fits: DayFit[]; sel?: DayFit; bookedDay: string | null; onPick: (day: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {fits.map((f) => {
        const on = f.day === sel?.day;
        const [wd, dn] = f.day.split(" ");
        const tone =
          f.state === "fits"
            ? "bg-accent/14 text-accent"
            : f.state === "closed" || f.state === "far"
              ? "bg-red-500/10 text-red-600 dark:text-red-400"
              : f.state === "travel"
                ? "bg-amber-400/15 text-amber-700 dark:text-amber-300"
                : "bg-surface-2 text-muted";
        const sub = f.day === bookedDay ? "booked" : f.state === "fits" ? (f.slot!.detour < 1 ? "+<1 km" : `+${Math.round(f.slot!.detour)} km`) : f.state;
        return (
          <button
            key={f.day}
            onClick={() => onPick(f.day)}
            title={`${f.day} · ${DAY_TITLE[f.day]}`}
            className={`flex min-w-0 flex-1 flex-col items-center rounded-lg px-0.5 py-1.5 leading-tight transition ${tone} ${on ? "ring-2 ring-inset ring-accent" : "hover:brightness-95"}`}
          >
            <span className="text-[10px] font-semibold uppercase opacity-80">{wd}</span>
            <span className={`text-[13px] font-semibold ${f.state === "closed" ? "line-through" : ""}`}>{dn}</span>
            <span className="text-[9.5px] opacity-85">{sub}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The chosen day as its stop list, with the idea slotted in where it fits (and anything it pushes back) */
function DayList({ f, idea, mins, openHours, fixed, open = true }: { f: DayFit; idea: Demo; mins: number; openHours?: string; fixed?: string; open?: boolean }) {
  // Folded: only the suggested slot (day and time). Open: the rest of the day grows in around it.
  // Read-only: the day is picked in the week strip, the time on the itinerary.
  const p = placeInDay(f, mins, openHours, fixed);
  const DAY_START = 9 * 60;
  const DAY_END = 21 * 60;
  const dur = (a: number, b: number) => {
    const m = Math.round((b - a) / 30) * 30;
    return m >= 60 ? `${m / 60} h` : `${m} min`;
  };
  const more = (key: string, node: ReactNode) => (
    <Grow key={key} open={open}>
      {node}
    </Grow>
  );
  const at = f.slot?.kind === "start" ? 0 : f.slot?.kind === "between" ? f.slot.i + 1 : f.stops.length;
  // The suggestion is a recommendation, so it takes the accent colour (red only when it lands outside opening hours)
  const here = (
    <div key="here" className={`flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 ${p.outside ? "bg-red-500/8" : "bg-accent/10"}`} style={{ boxShadow: `inset 3px 0 0 ${p.outside ? "#ef4444" : "var(--accent)"}` }}>
      <span className={`w-11 shrink-0 text-[11.5px] font-semibold tabular-nums ${p.outside ? "text-red-600" : "text-accent"}`}>{clock(p.start)}</span>
      <span className="min-w-0 text-[12.5px]">
        <span className="font-semibold">{idea.name}</span>
        <span className="text-muted">
          {" "}
          would go here · until {clock(p.end)}
          {p.cut ? " (closing)" : ""}
        </span>
        {p.outside && <span className="block text-red-600 dark:text-red-400">Outside opening hours ({openHours})</span>}
      </span>
    </div>
  );
  const gap = (key: string, a: number, b: number) =>
    b - a >= 30 &&
    more(
      key,
      <div className="flex items-center gap-2.5 px-2.5 py-0.5 text-[11.5px] text-muted">
        <span className="w-11 shrink-0 tabular-nums">{clock(a)}</span>
        <span className="h-px flex-1 border-t border-dashed border-line" />
        <span>free · {dur(a, b)}</span>
      </div>,
    );
  if (!f.stops.length) return <div>{[here, more("none", <p className="mt-1 px-2.5 text-[12px] text-muted">The rest of {f.day} is free</p>)]}</div>;
  const rows: ReactNode[] = [];
  f.stops.forEach((x, i) => {
    const t = p.times[i];
    const shift = p.nextIndex >= 0 && i >= p.nextIndex ? p.push : 0;
    const prevEnd = i === 0 ? DAY_START : p.times[i - 1] ? p.times[i - 1].end + (p.nextIndex >= 0 && i - 1 >= p.nextIndex ? p.push : 0) : DAY_START;
    if (i === at) rows.push(gap(`gb${i}`, prevEnd, p.start), here);
    else if (t) rows.push(gap(`g${i}`, prevEnd, t.start + shift));
    rows.push(
      more(
        x.name,
        <div className="flex items-start gap-2.5 px-2.5 py-1">
          <span className="w-11 shrink-0 text-[11.5px] text-muted tabular-nums">{t ? clock(t.start + shift) : ""}</span>
          <span className="min-w-0 text-[12.5px] text-fg/85">
            <span className="mr-1.5 text-muted tabular-nums">{i + 1}</span>
            {x.name}
            {shift > 0 && <span className="text-amber-700 dark:text-amber-300"> · {Math.round(shift / 5) * 5} min later</span>}
          </span>
        </div>,
      ),
    );
  });
  const last = p.times[p.times.length - 1];
  if (at >= f.stops.length) rows.push(gap("gb-end", last ? last.end : DAY_START, p.start), here);
  else if (last) rows.push(gap("gend", last.end + (p.push > 0 ? p.push : 0), DAY_END));
  return <div>{rows}</div>;
}

/** The chosen day on a clock (8:00–22:00): stops as blocks, the idea as an amber block, its opening hours behind it */
function DayClock({ f, idea, mins, openHours, fixed }: { f: DayFit; idea: Demo; mins: number; openHours?: string; fixed?: string }) {
  const p = placeInDay(f, mins, openHours, fixed);
  const H0 = 8 * 60;
  const H1 = 22 * 60;
  const x = (m: number) => `${((Math.min(Math.max(m, H0), H1) - H0) / (H1 - H0)) * 100}%`;
  const w = (a: number, b: number) => `${((Math.min(b, H1) - Math.max(a, H0)) / (H1 - H0)) * 100}%`;
  return (
    <div>
      <div className="relative h-[52px] rounded-lg bg-surface-2/50">
        {p.opens !== undefined && p.closes !== undefined && (
          <div className="absolute inset-y-0 rounded-md bg-accent/10" style={{ left: x(p.opens), width: w(p.opens, p.closes) }} title={`${idea.name} is open ${openHours}`} />
        )}
        {p.times.map((t, i) => {
          const shift = p.nextIndex >= 0 && i >= p.nextIndex ? p.push : 0;
          return (
            <div
              key={i}
              className="absolute top-2 grid h-[18px] place-items-center rounded bg-fg/18 text-[10px] font-bold text-fg/70"
              style={{ left: x(t.start + shift), width: w(t.start + shift, t.end + shift) }}
              title={`${i + 1} ${f.stops[i]?.name} · ${clock(t.start + shift)}`}
            >
              {i + 1}
            </div>
          );
        })}
        <div
          className={`absolute bottom-2 grid h-[18px] place-items-center rounded border border-dashed text-[10px] font-bold ${p.outside ? "border-red-500 bg-red-500/15 text-red-700" : "border-accent bg-accent/25 text-accent"}`}
          style={{ left: x(p.start), width: w(p.start, p.end) }}
          title={`${idea.name} · ${clock(p.start)}–${clock(p.end)}`}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-muted tabular-nums">
        {[8, 10, 12, 14, 16, 18, 20, 22].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-fg/80">
        <b className="font-semibold">{clock(p.start)}–{clock(p.end)}</b> {idea.name}
        {openHours && <span className="text-muted"> · open {openHours}</span>}
        {f.stops.length > 0 && <span className="text-muted"> · {f.stops.map((s, i) => `${i + 1} ${s.name}`).join(" · ")}</span>}
      </p>
      {p.push > 0 && <p className="text-[12px] text-amber-700 dark:text-amber-300">Pushes the rest of {f.day} back about {Math.round(p.push / 5) * 5} min</p>}
      {p.outside && <p className="text-[12px] text-red-600 dark:text-red-400">Lands outside its opening hours</p>}
    </div>
  );
}

function FitCard({ idea, open, toggle, me, setMine, view = "map" }: Props & { view?: "map" | "list" | "clock" }) {
  const ex = EXTRA[idea.id];
  const place = PLACE[idea.id] ?? {};
  const solo = Object.keys(idea.answers).length === 1;
  const comments = solo ? ex.comments.filter((c) => c.by === me) : ex.comments;
  const bookings = STAGE === "booked" ? ex.bookings : [];
  const booked = idea.booking?.kind === "booked" ? idea.booking : null;
  const bookedDay = booked ? booked.text.split(", ")[0] : null;
  const bookedTime = booked ? booked.text.split(", ")[1] : null;
  const rough = idea.where === "Needs a place";

  const fits = fitDays(idea, place.at);
  const planned = fits.some((f) => f.stops.length);
  const proposal =
    fits.find((f) => f.day === bookedDay) ??
    [...fits].filter((f) => f.state === "fits").sort((a, b) => a.slot!.detour - b.slot!.detour)[0] ??
    (planned ? fits.find((f) => f.state === "free") : undefined);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => setPick(null), [idea.id, STAGE]);
  let sel = fits.find((f) => f.day === pick) ?? proposal;
  // Booked: it goes where its booked time falls in that day (by the clock), not where it's closest on the map
  if (sel && sel.day === bookedDay && bookedTime && place.at && sel.stops.length) {
    const st = sel.stops;
    const at = place.at;
    const k = (STOP_TIMES[sel.day] ?? []).filter(([t]) => hm(t) < hm(bookedTime)).length;
    const slot: Slot =
      k === 0
        ? { kind: "start", i: 0, detour: kmBetween(at, st[0].at), near: 0 }
        : k >= st.length
          ? { kind: "end", i: st.length - 1, detour: kmBetween(st[st.length - 1].at, at), near: st.length - 1 }
          : { kind: "between", i: k - 1, detour: kmBetween(st[k - 1].at, at) + kmBetween(at, st[k].at) - kmBetween(st[k - 1].at, st[k].at), near: kmBetween(st[k - 1].at, at) < kmBetween(st[k].at, at) ? k - 1 : k };
    sel = { ...sel, slot, state: "fits" };
  }

  // Every reason, once, about the selected day; ✕ for other days that are ruled out
  const bestTime = idea.facts.find((f) => f.startsWith("Best "));
  const clash = bestTime === "Best early" && bookedTime && parseInt(bookedTime) >= 12 && sel?.day === bookedDay ? `Best early · your slot is ${bookedTime}` : null;
  type Line = { kind: "good" | "warn" | "out"; text: string };
  const lines: Line[] = [];
  if (sel) {
    if (sel.state === "fits") lines.push({ kind: "good", text: slotText(sel) });
    if (sel.state === "far") lines.push({ kind: "out", text: slotText(sel) });
    if (sel.state === "free") lines.push({ kind: "good", text: `Nothing planned on ${sel.day} yet: a free day` });
    if (sel.state === "closed") lines.push({ kind: "out", text: `Closed on ${sel.day}` });
    if (sel.state === "travel") lines.push({ kind: "warn", text: `${sel.day} is a travel day (${DAY_TITLE[sel.day]})` });
    if (sel.day === bookedDay && bookedTime) lines.push({ kind: "good", text: `Booked for ${bookedTime}` });
  }
  if (bestTime && !booked) lines.push({ kind: "good", text: bestTime });
  if (idea.booking?.kind === "needed") lines.push({ kind: "warn", text: "Book ahead · not booked yet" });
  if (clash) lines.push({ kind: "warn", text: clash });
  idea.warn.forEach((t) => lines.push({ kind: "warn", text: t }));
  const closedOther = fits.filter((f) => f.state === "closed" && f.day !== sel?.day);
  if (closedOther.length) lines.push({ kind: "out", text: `Closed ${closedOther.map((f) => f.day).join(", ")}` });
  const glance = [lines.find((l) => l.kind === "good"), lines.find((l) => l.kind === "out") ?? lines.find((l) => l.kind === "warn")].filter(Boolean) as Line[];

  const near = Object.entries(CLOSE_AT)
    .filter(([n]) => (CLOSE_IDEAS[idea.id] ?? []).includes(n))
    .map(([, at]) => at)
    .filter((at) => place.at && kmBetween(at, place.at) < 6);

  const line = (l: Line) => (
    <p key={l.text} className={`flex items-start gap-1.5 text-[12.5px] ${l.kind === "good" ? "text-accent" : l.kind === "out" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
      {l.kind === "good" ? <Check className="mt-0.5 size-3.5 shrink-0" /> : l.kind === "out" ? <X className="mt-0.5 size-3.5 shrink-0" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0" />}
      <span className={l.kind === "good" ? "text-fg/85" : ""}>{l.text}</span>
    </p>
  );
  const tag = (f: DayFit) => {
    const on = f.day === sel?.day;
    const sub = f.state === "closed" ? "closed" : f.state === "travel" ? "travel" : f.state === "free" ? "free" : f.state === "far" ? "far" : `+${kmText(f.slot!.detour).replace("under 1 km", "<1 km")}`;
    return (
      <button
        key={f.day}
        onClick={() => setPick(f.day)}
        className={`flex min-w-0 flex-1 flex-col items-center rounded-lg px-1 py-1 text-center leading-tight transition-colors ${
          on ? "bg-accent text-on-accent" : f.state === "closed" ? "bg-red-500/10 text-red-600 dark:text-red-400" : f.state === "fits" ? "bg-accent/12 text-accent hover:bg-accent/20" : "bg-surface-2 text-muted hover:text-fg"
        }`}
      >
        <span className={`text-[11px] font-semibold ${f.state === "closed" ? "line-through" : ""}`}>{f.day.split(" ")[0]}</span>
        <span className="text-[10px] opacity-85">{f.day === bookedDay ? "booked" : sub}</span>
      </button>
    );
  };

  const fitSection = rough ? (
    <p className="text-[12.5px] text-muted">Needs a place first: then it can be fitted into a day</p>
  ) : !planned ? (
    // Nothing planned yet: fall back to what helps early on
    (CLOSE_IDEAS[idea.id]?.length ?? 0) >= 2 ? (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12.5px] text-fg/80">No days planned yet. Close by:</span>
        {CLOSE_IDEAS[idea.id].map((n) => (
          <span key={n} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-fg/80">
            {n}
          </span>
        ))}
        <span className="text-[12px] text-muted">could be one day</span>
      </div>
    ) : (
      <p className="text-[12.5px] text-muted">No days planned yet</p>
    )
  ) : view !== "map" ? (
    // The week is the one day control; open, where in that day it lands
    <>
      <WeekPicker fits={fits} sel={sel} bookedDay={bookedDay} onPick={setPick} />
      {/* Day first, then that day's times (open), then the reasons */}
      {sel && view === "list" && (sel.state === "fits" || sel.state === "free") ? (
        // The suggested slot shows folded; open, the rest of that day grows in around it
        <div className="pt-2.5">
          <DayList f={sel} idea={idea} mins={VISIT_MIN[idea.id] ?? 90} openHours={place.hours?.[sel.day]} fixed={sel.day === bookedDay ? (bookedTime ?? undefined) : undefined} open={open} />
        </div>
      ) : sel && (
        <Grow open={open}>
          <div className="pt-3">
            {sel.state === "closed" ? (
              <p className="text-[12.5px] text-red-600 dark:text-red-400">Closed that day</p>
            ) : sel.state === "far" || sel.state === "travel" ? (
              <p className="text-[12.5px] text-muted">{sel.state === "far" ? `Too far from ${sel.day}'s stops to slot in` : `${sel.day} is a travel day`}</p>
            ) : view === "list" ? null : (
              <DayClock f={sel} idea={idea} mins={VISIT_MIN[idea.id] ?? 90} openHours={place.hours?.[sel.day]} fixed={sel.day === bookedDay ? (bookedTime ?? undefined) : undefined} />
            )}
          </div>
        </Grow>
      )}
      <div className="mt-2.5 space-y-0.5">{(open ? lines : glance).map(line)}</div>
    </>
  ) : (
    <>
      {sel && place.at && sel.stops.length > 0 && (
        // Folded on a narrow card: words only; the map comes with "Show more"
        <div className={open ? "" : "hidden @min-[600px]:block"}>
          <div className="overflow-hidden rounded-xl border border-line bg-surface-2/40">
            <FitMap f={sel} at={place.at} near={open ? near : []} tall={open} />
          </div>
          <p className="mt-1 truncate text-[11.5px] text-muted">
            <b className="font-semibold text-fg/75">{sel.day}:</b> {sel.stops.map((x, i) => `${i + 1} ${x.name}`).join(" · ")}
            {open && near.length > 0 && <span> · ○ other ideas</span>}
          </p>
        </div>
      )}
      <Grow open={open}>
        <div className="flex gap-1 pt-2.5">{fits.map(tag)}</div>
      </Grow>
      <div className="mt-2 space-y-0.5">{(open ? lines : glance).map(line)}</div>
    </>
  );

  const groupTrip = Object.keys(idea.answers).length > 1;
  const sittingOut = Object.keys(idea.answers).filter((p) => idea.answers[p] === -1);
  const goingCount = Object.keys(idea.answers).length - sittingOut.length;
  const label = rough
    ? "Find a place"
    : sel
      ? `Add to ${sel.day}${sel.day === bookedDay && bookedTime ? `, ${bookedTime}` : ""}${groupTrip && sittingOut.length ? ` · ${goingCount} going` : ""}`
      : "Add to a day";
  const [asking, setAsking] = useState(false);
  const [added, setAdded0] = useState<{ day: string; who: string[]; then: Answers } | null>(null);
  const [toast, setToast] = useState(false);
  const setAdded = (a: { day: string; who: string[] } | null) => (setAdded0(a && { ...a, then: { ...idea.answers } }), setToast(!!a));
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => (setAdded0(null), setAsking(false)), [idea.id, STAGE]);
  const press = () => {
    if (rough || !sel || sel.state === "closed") return;
    if (groupTrip && sittingOut.length) setAsking(true);
    else setAdded({ day: sel.day, who: Object.keys(idea.answers) });
  };
  // After adding: someone changed their answer since, and it no longer matches who's going. Say so; never change it silently.
  const drift = added
    ? Object.keys(idea.answers).filter(
        (p) => idea.answers[p] !== added.then[p] && (added.who.includes(p) ? idea.answers[p] === -1 : idea.answers[p] === 1 || idea.answers[p] === 0),
      )
    : [];

  return (
    <div className={`@container relative rounded-2xl border bg-surface ${answeredOf(idea.answers).includes(1) ? "border-amber-400/60" : "border-line"}`}>
      <div className="grid grid-cols-1 @min-[600px]:grid-cols-[minmax(0,1fr)_252px]">
        {/* Evidence */}
        <div className="min-w-0 px-4 pt-3.5 pb-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Title idea={idea} size={16.5} badge={false} />
              {(place.rating || place.costShort) && (
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-fg/80">
                  {place.rating && (
                    <>
                      <Star className="size-3 fill-amber-400 text-amber-400" /> {place.rating} <span className="text-muted">({place.ratingCount})</span>
                    </>
                  )}
                  {place.rating && place.costShort && <span className="text-muted">·</span>}
                  {place.costShort && <span>{place.costShort}</span>}
                </p>
              )}
            </div>
            {place.photo && (
              <div className="grid size-[64px] shrink-0 place-items-center rounded-xl text-white/70" style={{ background: `linear-gradient(135deg,hsl(${hue(idea.name)} 35% 72%),hsl(${hue(idea.name) + 50} 30% 52%))` }} title="Cover photo (demo)">
                <ImageIcon className="size-5" />
              </div>
            )}
          </div>
          {place.desc && <p className={`mt-2.5 text-[13px] leading-snug text-fg/85 ${open ? "" : "line-clamp-2"}`}>{place.desc}</p>}
          {idea.address && (
            <Grow open={open}>
              <p className="mt-2 flex flex-wrap gap-x-3 text-[12.5px] text-accent">
                <span className="flex items-center gap-1">
                  <MapIcon className="size-3.5" /> Map
                </span>
                <span className="flex items-center gap-1">
                  <ExternalLink className="size-3.5" /> Google Maps
                </span>
                {place.website && <span>Website</span>}
              </p>
            </Grow>
          )}

          <div className="pt-6">
            <Cap>How it fits</Cap>
            {fitSection}
          </div>

          {(bookings.length > 0 || idea.booking?.kind === "needed") && (
            <Grow open={open}>
              <div className="pt-6">
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

          {/* Comments: a count while folded, the thread at the bottom when open */}
          {comments.length > 0 && (
            <div className="pt-6">
              <button onClick={toggle} className={`flex items-center gap-2 text-[12.5px] ${open ? "pointer-events-none" : "text-muted hover:text-fg"}`}>
                {open ? (
                  <Cap>{solo ? "Notes" : `Comments · ${comments.length}`}</Cap>
                ) : (
                  <>
                    <span className="flex items-center -space-x-1.5">
                      {[...new Set(comments.map((c) => c.by))].slice(0, 3).map((p) => (
                        <Ava key={p} name={p} size={18} />
                      ))}
                    </span>
                    {comments.length} {solo ? (comments.length === 1 ? "note" : "notes") : comments.length === 1 ? "comment" : "comments"}
                  </>
                )}
              </button>
              <Grow open={open}>
                <ul className="space-y-2.5">
                  {comments.map((c) => (
                    <li key={c.by + c.when} className="flex gap-2">
                      <Ava name={c.by} size={20} />
                      <div className="min-w-0 text-[13px] leading-snug">
                        <p className="text-[12px]">
                          <b className="font-semibold">{c.by === me ? "You" : c.by}</b> <span className="text-muted">· {c.when}</span>
                        </p>
                        <p className="text-fg/85">
                          <Mention text={c.text} />
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-muted">{solo ? "Add a note" : "Add a comment · @ to mention"}</p>
              </Grow>
            </div>
          )}
          {place.source && (
            <Grow open={open}>
              <p className="pt-5 text-[11.5px] text-muted">{place.source}</p>
            </Grow>
          )}
        </div>

        {/* Decision: your vote, the proposed day, the button */}
        <div className="min-w-0 border-t border-line bg-surface-2/60 @min-[600px]:rounded-tr-2xl @min-[600px]:border-t-0">
          <div className="grid h-full grid-cols-[194px_minmax(0,1fr)] gap-x-5 px-4 pt-3.5 pb-4 @min-[600px]:flex @min-[600px]:flex-col">
            <div className="min-w-0">
              <GroupPoll idea={idea} open={open} me={me} setMine={setMine} />
            </div>
            <div className="flex min-w-0 flex-col @min-[600px]:mt-auto @min-[600px]:block @min-[600px]:pt-6">
              <Cap>Proposed day</Cap>
              {sel && !rough ? (
                <>
                  <p className="text-[13px]">
                    <b>{sel.day}</b> <span className="text-muted">· {DAY_TITLE[sel.day]}</span>
                  </p>
                  {(() => {
                    const h = place.hours?.[sel.day];
                    const v = VISIT_MIN[idea.id];
                    const bits = [h === "Closed" ? "Closed that day" : h ? `Open ${h}` : null, v ? `takes about ${Math.round((v / 60) * 2) / 2} h` : null].filter(Boolean) as string[];
                    return bits.length > 0 && <p className="text-[12px] text-muted">{bits.join(" · ").replace(/^takes/, "Takes")}</p>;
                  })()}
                </>
              ) : (
                <p className="text-[12.5px] text-muted">{rough ? "Needs a place first" : "Pick a day"}</p>
              )}
              {drift.length > 0 && added && (
                <p className="mt-2 rounded-lg bg-amber-400/15 px-2 py-1.5 text-[12px] text-amber-800 dark:text-amber-300">
                  {listNames(drift, me)} changed {drift.length === 1 && drift[0] === me ? "your" : "their"} {drift.length > 1 ? "answers" : "answer"} since this was added. <button onClick={() => setAsking(true)} className="font-semibold underline">Update who's going?</button>
                </p>
              )}
              <div className="mt-auto flex items-center gap-1.5 pt-4 @min-[600px]:mt-0">
                <button aria-label="Remove idea" title="Remove idea" className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted hover:border-red-400 hover:text-red-600">
                  <Trash2 className="size-3.5" />
                </button>
                <span className={`flex min-w-0 flex-1 items-center overflow-hidden rounded-full text-[12.5px] font-semibold ${sel && !rough && sel.state !== "closed" ? "bg-accent text-on-accent" : "border border-line bg-surface text-fg"}`}>
                  <button onClick={press} className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-3 py-1.5">
                    <span className="truncate">{label}</span>
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {asking && sel && <WhoGoing key={sel.day} idea={idea} day={sel} me={me} onCancel={() => setAsking(false)} onAdd={(who) => (setAdded({ day: sel.day, who }), setAsking(false))} />}

      {/* Bottom strip: Show more / less; open, a quiet Remove on the left (rare and destructive, so never at the top) */}
      <div className="relative flex items-center border-t border-line">
        {added && toast ? (
          <p className="flex flex-1 items-center justify-center gap-2 py-1.5 text-[12px]">
            <Check className="size-3.5 text-accent" />
            Added to {added.day} {added.who.length === Object.keys(idea.answers).length ? "for everyone" : `for ${listNames(added.who, me, true)}`}
            <button onClick={() => setAdded(null)} className="font-semibold text-accent hover:underline">
              Undo
            </button>
          </p>
        ) : (
          <>
            {added && !open && (
              <span className="absolute left-3 flex items-center gap-1 text-[12px] text-accent">
                <Check className="size-3.5" /> On {added.day}
              </span>
            )}
            <button onClick={toggle} className="flex flex-1 items-center justify-center gap-1 py-1.5 text-[12px] text-muted hover:text-fg">
              {open ? "Show less" : "Show more"}
              <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const VARIANTS: { id: string; name: string; note: string; wideOpen?: boolean; round: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; C: (p: Props) => ReactNode }[] = [
  { id: "W1", round: 8, name: "Week strip → the day's stops", note: "folded: the week is the day control (green fits, red closed/far, grey free); open: the chosen day's stop list with the idea slotted in, and what it pushes back", C: (p) => <FitCard {...p} view="list" /> },
  { id: "W2", round: 8, name: "Week strip → the day's clock", note: "same week strip; open: the day on a clock with the idea as a block against its opening hours", C: (p) => <FitCard {...p} view="clock" /> },
  { id: "H1", round: 7, name: "Evidence | decision", note: "left: what it is, how it fits (map of the day, every reason once), comment count; right: your vote, the proposed day, the button. Tap a day under the map (open) to change the proposal", C: (p) => <FitCard {...p} /> },
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
  const [stage, setStage] = useState<Stage>("booked");
  STAGE = stage;
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
  const [earlier, setEarlier] = useState(0);
  const base = IDEAS.find((i) => i.id === ideaId)!;
  const sizedAnswers = sized(base.answers, ideaId, groupSize);
  const raw: Demo = { ...base, answers: { ...sizedAnswers, ...(ideaId in mine ? { [me]: mine[ideaId] } : {}) } };
  // Trip stage: before bookings, a booked idea is "book ahead" again; before any days are planned, nothing has a best day
  const unbooked: Demo = { ...raw, booking: raw.booking?.kind === "booked" ? { kind: "needed" } : raw.booking, good: raw.good.filter((g) => !g.startsWith("Booked")) };
  const idea: Demo =
    stage === "booked" ? raw : stage === "planned" ? unbooked : { ...unbooked, best: null, good: [], days: unbooked.days.map((d) => ({ ...d, state: d.state === "out" ? "out" : "ok" })) };
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
            Trip stage
            <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className="rounded-lg border border-line bg-bg px-2 py-1">
              <option value="empty">Nothing planned yet</option>
              <option value="planned">Days planned</option>
              <option value="booked">Booked</option>
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
            <select value={earlier} onChange={(e) => setEarlier(+e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1">
              <option value={0}>Hide</option>
              {[7, 6, 5, 4, 3, 2, 1].map((r) => (
                <option key={r} value={r}>
                  {r === 7 ? "Round 7 (H1 map)" : `Back to round ${r}`}
                </option>
              ))}
            </select>
          </label>
          <span className="text-muted">Colours: {PALETTES.teal.name}</span>
        </div>

        <div className="mt-6 space-y-10">
          {VARIANTS.filter((v) => v.round === 8 || (earlier !== 0 && v.round >= earlier)).map((v) => (
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
