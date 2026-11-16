// PROTOTYPE (proto/trip-focus): playground for "how the group feels about an idea" on a folded card.
// Dev only, at /travelplanner/proto/interest. Every variant reads the same fake answers, so changing your
// answer in one shows up in all of them. To try another idea, add a component to VARIANTS.
//
// Answers per person: null = hasn't weighed in · 0 = happy to tag along · 1 = must do · -1 = sitting out
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CalendarPlus, Check, ChevronDown, Star, Trash2, X } from "lucide-react";

export type Answer = -1 | 0 | 1 | null;
export type Answers = Record<string, Answer>;
type VariantProps = { people: string[]; me: string; answers: Answers; set: (a: Answer) => void };

const ALL_PEOPLE = ["Vishal", "Maya", "Sam", "Aditya", "Priya", "Leo"];
export const LABEL: Record<string, string> = { "1": "Must do", "0": "Tag along", "-1": "Sitting out", null: "Hasn't weighed in" };
const ORDER: Answer[] = [1, 0, -1, null];
export const key = (a: Answer) => String(a);
const sorted = (people: string[], ans: Answers) => [...people].sort((a, b) => ORDER.indexOf(ans[a] ?? null) - ORDER.indexOf(ans[b] ?? null));

/* ---------- shared bits ---------- */

const HUES = [150, 210, 25, 280, 340, 45, 190];
export const hue = (name: string) => HUES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];

/** An avatar that carries the person's answer: ★ badge, ✕ badge + faded, dashed grey when unanswered */
function AnswerAvatar({ name, a, size = 22, me }: { name: string; a: Answer; size?: number; me?: boolean }) {
  const none = a === null;
  return (
    <span className="relative inline-grid shrink-0" title={`${me ? "You" : name}: ${LABEL[key(a)]}`}>
      <span
        className={`grid place-items-center rounded-full font-bold ring-2 ring-surface ${none ? "border border-dashed border-muted/70 bg-surface-2 text-muted" : "text-white"} ${a === -1 ? "opacity-45" : ""}`}
        style={{ width: size, height: size, fontSize: size * 0.46, ...(none ? {} : { background: `hsl(${hue(name)} 55% 45%)` }) }}
      >
        {name[0]}
      </span>
      {a === 1 && (
        <span className="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full bg-amber-400 ring-2 ring-surface">
          <Star className="size-2 fill-black text-black" />
        </span>
      )}
      {a === -1 && (
        <span className="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full bg-red-500 ring-2 ring-surface">
          <X className="size-2 text-white" strokeWidth={4} />
        </span>
      )}
    </span>
  );
}

/** Your three choices (also used by the pop-ups) */
function Choices({ value, set, size = "sm" }: { value: Answer; set: (a: Answer) => void; size?: "sm" | "md" }) {
  const opts: { a: Answer; label: string; icon: ReactNode; on: string }[] = [
    { a: -1, label: "Sit out", icon: <X className="size-3.5" />, on: "bg-red-500/15 text-red-600 dark:text-red-400" },
    { a: 0, label: "Tag along", icon: <Check className="size-3.5" />, on: "bg-surface text-fg shadow-sm" },
    { a: 1, label: "Must do", icon: <Star className="size-3.5" />, on: "bg-amber-400/25 text-amber-800 dark:text-amber-300" },
  ];
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-0.5">
      {opts.map((o) => (
        <button
          key={o.label}
          onClick={() => set(value === o.a ? null : o.a)}
          className={`flex items-center gap-1 rounded-full font-semibold whitespace-nowrap transition-colors ${size === "md" ? "px-3 py-1 text-[12.5px]" : "px-2 py-0.5 text-[11.5px]"} ${value === o.a ? o.on : "text-muted hover:text-fg"}`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Popover({ trigger, children }: { trigger: (toggle: () => void, open: boolean) => ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex">
      {trigger(() => setOpen((o) => !o), open)}
      {open && (
        <span className="absolute top-full right-0 z-30 mt-1.5 rounded-2xl border border-line bg-surface p-2 shadow-xl" onClick={() => setOpen(false)}>
          {children}
        </span>
      )}
    </span>
  );
}

/* ---------- variants (folded card) ---------- */

/** A: avatar strip, each avatar shows its answer; your own avatar opens your choices */
function AvatarStrip({ people, me, answers, set }: VariantProps) {
  const list = sorted(people, answers);
  const shown = list.slice(0, 5);
  return (
    <span className="flex items-center -space-x-1">
      {shown.map((p) =>
        p === me ? (
          <Popover key={p} trigger={(t) => <button onClick={t} className="rounded-full hover:ring-2 hover:ring-accent"><AnswerAvatar name={p} a={answers[p] ?? null} me /></button>}>
            <Choices value={answers[me] ?? null} set={set} />
          </Popover>
        ) : (
          <AnswerAvatar key={p} name={p} a={answers[p] ?? null} />
        ),
      )}
      {list.length > shown.length && <span className="pl-2 text-[11.5px] text-muted">+{list.length - shown.length}</span>}
    </span>
  );
}

/** B: counts only (★ 1 · ✕ 1 · 2 ?); click to set yours */
function Counts({ people, me, answers, set }: VariantProps) {
  const n = (a: Answer) => people.filter((p) => (answers[p] ?? null) === a).length;
  return (
    <Popover
      trigger={(t) => (
        <button onClick={t} className="flex items-center gap-2 rounded-full px-2 py-0.5 text-[12px] font-semibold text-muted hover:bg-surface-2">
          {n(1) > 0 && <span className="flex items-center gap-0.5 text-amber-700 dark:text-amber-300"><Star className="size-3 fill-current" />{n(1)}</span>}
          {n(-1) > 0 && <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400"><X className="size-3" />{n(-1)}</span>}
          {n(null) > 0 && <span className="font-normal">{n(null)} ?</span>}
          <ChevronDown className="size-3" />
        </button>
      )}
    >
      <span className="block px-1 pb-1.5 text-[11px] text-muted">You ({me})</span>
      <Choices value={answers[me] ?? null} set={set} />
    </Popover>
  );
}

/** C: a tiny mood bar (one segment per person, coloured by answer) + your choice as icon toggles */
function MoodBar({ people, me, answers, set }: VariantProps) {
  const tone = (a: Answer) => (a === 1 ? "bg-amber-400" : a === 0 ? "bg-accent/60" : a === -1 ? "bg-red-500/70" : "bg-surface-2 border border-dashed border-muted/50");
  const mine = answers[me] ?? null;
  const icon = (a: Answer, el: ReactNode, on: string, title: string) => (
    <button title={title} onClick={() => set(mine === a ? null : a)} className={`grid size-6 place-items-center rounded-full ${mine === a ? on : "text-muted hover:bg-surface-2 hover:text-fg"}`}>
      {el}
    </button>
  );
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-0.5" title={sorted(people, answers).map((p) => `${p}: ${LABEL[key(answers[p] ?? null)]}`).join("\n")}>
        {sorted(people, answers).map((p) => (
          <span key={p} className={`h-2 w-3 rounded-sm ${tone(answers[p] ?? null)}`} />
        ))}
      </span>
      <span className="flex">
        {icon(-1, <X className="size-3.5" />, "bg-red-500/15 text-red-600", "Sit out")}
        {icon(1, <Star className="size-3.5" />, "bg-amber-400/25 text-amber-700", "Must do")}
      </span>
    </span>
  );
}

/** D: only the exceptions, in words ("★ Maya · ✕ Sam"), plus your ☆ */
function Exceptions({ people, me, answers, set }: VariantProps) {
  const must = people.filter((p) => answers[p] === 1);
  const out = people.filter((p) => answers[p] === -1);
  const you = (p: string) => (p === me ? "you" : p);
  return (
    <span className="flex min-w-0 items-center gap-2 text-[12px]">
      {must.length > 0 && <span className="flex items-center gap-1 truncate font-semibold text-amber-700 dark:text-amber-300"><Star className="size-3 shrink-0 fill-current" />{must.map(you).join(", ")}</span>}
      {out.length > 0 && <span className="flex items-center gap-1 truncate text-red-600 dark:text-red-400"><X className="size-3 shrink-0" />{out.map(you).join(", ")}</span>}
      {!must.length && !out.length && <span className="text-muted">Everyone's fine with it</span>}
      <Popover trigger={(t) => <button onClick={t} className="shrink-0 rounded-full px-1.5 text-muted hover:bg-surface-2 hover:text-fg">you ▾</button>}>
        <Choices value={answers[me] ?? null} set={set} />
      </Popover>
    </span>
  );
}


/* ---------- the scale as a track (variants E–G): ✕ sit out · tag along · ★ must do ---------- */

const TRACK_W = 112;
const posX = (v: number) => ((v + 1) / 2) * TRACK_W; // −1 → 0, 0 → middle, +1 → end
const answered = (people: string[], ans: Answers): number[] => people.map((p) => ans[p] ?? null).filter((a): a is -1 | 0 | 1 => a !== null);
const DOT = (a: Answer | number) => (a === 1 ? "#f59e0b" : a === -1 ? "#ef4444" : a === 0 ? "#8a918d" : "transparent");

/** The bare track: a red → grey → green line with ✕ and ★ at its ends (not colour alone) */
function Track({ children, w = TRACK_W, faint }: { children?: ReactNode; w?: number; faint?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <X className="size-3 shrink-0 text-red-500" />
      <span className="relative h-4 shrink-0" style={{ width: w }}>
        <span
          className={`absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full ${faint ? "opacity-35" : "opacity-70"}`}
          style={{ background: "linear-gradient(90deg,#ef4444,#9ca3a0 50%,#22a35a)" }}
        />
        {children}
      </span>
      <Star className="size-3 shrink-0 text-amber-500" />
    </span>
  );
}

/** Opens your choices when the summary is clicked (the folded track is a read-out, not a slider) */
function TrackButton({ props, children, extra }: { props: VariantProps; children: ReactNode; extra?: ReactNode }) {
  const { people, me, answers, set } = props;
  const unanswered = people.filter((p) => (answers[p] ?? null) === null).length;
  return (
    <Popover
      trigger={(t) => (
        <button onClick={t} title={sorted(people, answers).map((p) => `${p === me ? "You" : p}: ${LABEL[key(answers[p] ?? null)]}`).join("\n")} className="flex items-center gap-2 rounded-full px-1.5 py-0.5 hover:bg-surface-2">
          {children}
          {extra}
          {unanswered > 0 && <span className="text-[11.5px] text-muted">{unanswered} ?</span>}
        </button>
      )}
    >
      <span className="block px-1 pb-1.5 text-[11px] text-muted">You ({me})</span>
      <Choices value={answers[me] ?? null} set={set} />
    </Popover>
  );
}

/** E: one knob at the group's average (as drafted in Figma) */
function MeanKnob(props: VariantProps) {
  const a = answered(props.people, props.answers);
  const mean = a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return (
    <TrackButton props={props}>
      <Track faint={mean === null}>
        {mean !== null && (
          <span
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
            style={{ left: posX(mean), background: mean > 0.15 ? "#22a35a" : mean < -0.15 ? "#ef4444" : "#8a918d" }}
          />
        )}
      </Track>
    </TrackButton>
  );
}

/** F: a dot per person at their answer, side by side where several share a stop */
function DotPlot(props: VariantProps) {
  const { people, me, answers } = props;
  const byStop = new Map<number, string[]>();
  for (const p of sorted(people, answers)) {
    const a = answers[p] ?? null;
    if (a !== null) byStop.set(a, [...(byStop.get(a) ?? []), p]);
  }
  return (
    <TrackButton props={props}>
      <Track>
        {[...byStop].flatMap(([a, ps]) =>
          ps.map((p, i) => (
            <span
              key={p}
              title={`${p === me ? "You" : p}: ${LABEL[key(a as Answer)]}`}
              className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ${p === me ? "ring-fg" : "ring-surface"}`}
              style={{ left: Math.min(TRACK_W, Math.max(0, posX(a) + (i - (ps.length - 1) / 2) * 8)), background: DOT(a as Answer) }}
            />
          )),
        )}
      </Track>
    </TrackButton>
  );
}

/** G: the stretch from the lowest to the highest answer, with a tick at the average */
function RangeBar(props: VariantProps) {
  const a = answered(props.people, props.answers);
  if (!a.length)
    return (
      <TrackButton props={props}>
        <Track faint />
      </TrackButton>
    );
  const lo = Math.min(...a);
  const hi = Math.max(...a);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const contested = lo === -1 && hi === 1;
  return (
    <TrackButton props={props} extra={contested ? <span className="text-[11.5px] font-semibold text-red-600 dark:text-red-400">split?</span> : undefined}>
      <Track faint>
        <span
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full"
          style={{
            left: posX(lo) - 5,
            width: posX(hi) - posX(lo) + 10,
            background: lo === hi ? DOT(lo) : `linear-gradient(90deg,${DOT(lo)},${DOT(hi)})`,
          }}
        />
        <span className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg" style={{ left: posX(mean) }} />
      </Track>
    </TrackButton>
  );
}


/* ---------- more ways to show direction + agreement ---------- */

const counts = (people: string[], ans: Answers) => {
  const c = { out: 0, along: 0, must: 0, none: 0 };
  for (const p of people) {
    const a = ans[p] ?? null;
    if (a === -1) c.out++;
    else if (a === 0) c.along++;
    else if (a === 1) c.must++;
    else c.none++;
  }
  return c;
};
/** Mixed = the answers reach both ends of the scale */
const isMixed = (people: string[], ans: Answers) => {
  const a = answered(people, ans);
  return a.includes(-1) && a.includes(1);
};
const Mixed = () => <span className="text-[11.5px] font-semibold text-red-600 dark:text-red-400">Mixed</span>;

/** H: your average knob, plus a soft band from the lowest to the highest answer (wide band = scattered) */
function KnobBand(props: VariantProps) {
  const a = answered(props.people, props.answers);
  if (!a.length)
    return (
      <TrackButton props={props}>
        <Track faint />
      </TrackButton>
    );
  const lo = Math.min(...a);
  const hi = Math.max(...a);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  return (
    <TrackButton props={props} extra={isMixed(props.people, props.answers) ? <Mixed /> : undefined}>
      <Track faint>
        <span className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-fg/12" style={{ left: posX(lo) - 7, width: posX(hi) - posX(lo) + 14 }} />
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
          style={{ left: posX(mean), background: mean > 0.15 ? "#22a35a" : mean < -0.15 ? "#ef4444" : "#8a918d" }}
        />
      </Track>
    </TrackButton>
  );
}

/** I: everyone's answers melted into one blob at the average: round = agreed, peanut = two camps, lumpy = scattered */
function GooBlob(props: VariantProps) {
  const id = useId().replace(/:/g, "");
  const c = counts(props.people, props.answers);
  const a = answered(props.people, props.answers);
  const mean = a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const lobes = (
    [
      [-1, c.out],
      [0, c.along],
      [1, c.must],
    ] as const
  ).filter(([, n]) => n > 0);
  const SPREAD = 11; // px between lobes: close enough to melt together
  return (
    <TrackButton props={props} extra={isMixed(props.people, props.answers) ? <Mixed /> : undefined}>
      <Track faint={!a.length}>
        {a.length > 0 && (
          <svg className="absolute top-1/2 -translate-y-1/2 overflow-visible" width={TRACK_W} height={28} style={{ left: 0 }}>
            <defs>
              <filter id={`goo${id}`}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="b" />
                <feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
              </filter>
            </defs>
            <g filter={`url(#goo${id})`}>
              {lobes.map(([v, n]) => (
                <circle key={v} cx={posX(mean) + (v - mean) * SPREAD} cy={14} r={4.2 + 2.3 * Math.sqrt(n)} fill={DOT(v)} />
              ))}
            </g>
          </svg>
        )}
      </Track>
    </TrackButton>
  );
}

/** J: the standard survey chart (a diverging/stacked Likert bar): one segment per answer, sized by how many */
function StackedBar(props: VariantProps) {
  const c = counts(props.people, props.answers);
  const total = props.people.length;
  const seg = (n: number, bg: string, title: string) =>
    n > 0 && <span title={`${n} ${title}`} className="h-full" style={{ width: `${(n / total) * 100}%`, background: bg }} />;
  return (
    <TrackButton props={props} extra={isMixed(props.people, props.answers) ? <Mixed /> : undefined}>
      <span className="flex items-center gap-1.5">
        <X className="size-3 text-red-500" />
        <span className="flex h-2.5 w-24 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
          {seg(c.out, "#ef4444", "sitting out")}
          {seg(c.along, "#a3aaa6", "tagging along")}
          {seg(c.must, "#f59e0b", "must do")}
          {c.none > 0 && <span className="h-full" style={{ width: `${(c.none / total) * 100}%`, background: "repeating-linear-gradient(45deg,transparent 0 3px,rgb(0 0 0/.12) 3px 4px)" }} />}
        </span>
        <Star className="size-3 text-amber-500" />
      </span>
    </TrackButton>
  );
}

/** K: a small donut, as consensus tools (e.g. Loomio's proposal results) show votes */
function Donut(props: VariantProps) {
  const c = counts(props.people, props.answers);
  const total = props.people.length;
  let at = 0;
  const stop = (n: number, col: string) => {
    const from = at;
    at += (n / total) * 360;
    return n ? `${col} ${from}deg ${at}deg` : "";
  };
  const bg = [stop(c.must, "#f59e0b"), stop(c.along, "#a3aaa6"), stop(c.out, "#ef4444"), stop(c.none, "rgb(0 0 0/.08)")].filter(Boolean).join(",");
  return (
    <TrackButton props={props} extra={isMixed(props.people, props.answers) ? <Mixed /> : undefined}>
      <span className="relative grid size-6 place-items-center rounded-full" style={{ background: `conic-gradient(${bg})` }}>
        <span className="grid size-3.5 place-items-center rounded-full bg-surface">
          {c.must > 0 && <Star className="size-2 fill-amber-500 text-amber-500" />}
        </span>
      </span>
      <span className="text-[11.5px] text-muted">
        {c.must > 0 && <>★{c.must} </>}
        {c.out > 0 && <>✕{c.out}</>}
      </span>
    </TrackButton>
  );
}

/* ---------- palettes for the shortlist (switchable on the page) ----------
   sit out · tag along · must do. The neutral middle is never mixed straight from the two ends (that gave a
   muddy brown-grey); colours only meet through the neutral. ✕ and ★ at the ends keep it readable without colour. */
type Palette = { name: string; out: string; along: string; must: string; line: string };
export const PALETTES: Record<string, Palette> = {
  coral: { name: "Coral / green", out: "#e07a5f", along: "#d3d9d5", must: "#2a9d63", line: "#dfe3e0" },
  blue: { name: "Orange / blue (colour-blind safe)", out: "#e69a3a", along: "#d5d8dc", must: "#3a78c2", line: "#e0e3e6" },
  teal: { name: "Brick / teal", out: "#c8604a", along: "#d5dbd8", must: "#178a7c", line: "#dfe4e2" },
  mono: { name: "One green, by strength", out: "#b9bfbb", along: "#a7d7b8", must: "#1f9d55", line: "#e2e6e3" },
};
let P: Palette = PALETTES.teal; // set by the page's palette picker on each render
/** For other playgrounds that reuse the track */
export const usePalette = (k: string) => void (P = PALETTES[k] ?? P);
const pcol = (v: number) => (v === -1 ? P.out : v === 1 ? P.must : P.along);
const meanCol = (m: number) => (m > 0.33 ? P.must : m < -0.33 ? P.out : "#8c938f");
/** Colours from lo to hi on the scale, meeting only through the neutral middle */
export const stopsBetween = (lo: number, hi: number, alpha = "") =>
  lo === hi ? `${pcol(lo)}${alpha}` : lo === -1 && hi === 1 ? `${P.out}${alpha},${P.along}${alpha} 50%,${P.must}${alpha}` : `${pcol(lo)}${alpha},${pcol(hi)}${alpha}`;

/** Filled end marks that sit on the line's ends: ✕ in a disc, a solid ★ */
const EndOut = ({ size = 13 }: { size?: number }) => (
  <span className="grid place-items-center rounded-full" style={{ width: size, height: size, background: P.out }}>
    <X className="text-white" style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={3.5} />
  </span>
);
const EndMust = ({ size = 14 }: { size?: number }) => <Star style={{ width: size, height: size, color: P.must, fill: P.must }} />;

export function SoftTrack({ children, faint, w = TRACK_W, chosen }: { children?: ReactNode; faint?: boolean; w?: number; /** One person's answer: the other ends go quiet and the line fills towards it */ chosen?: Answer }) {
  const single = chosen !== undefined;
  const quiet = (end: -1 | 1) => single && chosen !== end;
  return (
    <span className="relative mx-2 inline-block h-5 shrink-0" style={{ width: w }}>
      <span
        className={`absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full ${faint ? "opacity-70" : ""}`}
        style={{ background: single ? P.line : `linear-gradient(90deg,${P.out}99,${P.line} 22%,${P.line} 78%,${P.must}99)` }}
      />
      {/* filled from the middle to the chosen end, like a slider's fill */}
      {single && chosen !== null && chosen !== 0 && (
        <span
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
          style={chosen === 1 ? { left: "50%", right: 0, background: P.must } : { left: 0, right: "50%", background: P.out }}
        />
      )}
      <span className={`absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 transition-opacity ${quiet(-1) ? "opacity-30 grayscale" : ""}`}>
        <EndOut />
      </span>
      <span className={`absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 transition-opacity ${quiet(1) ? "opacity-30 grayscale" : ""}`}>
        <EndMust />
      </span>
      {children}
    </span>
  );
}

/** The knob: at an end it takes over that end's mark (✕ or ★ inside it) */
export function Knob({ value, x, big }: { value: number; x: number; big?: boolean }) {
  const col = meanCol(value);
  return (
    <span
      className={`absolute top-1/2 z-10 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ring-2 ring-surface shadow-sm ${big ? "size-5" : "size-4"}`}
      style={{ left: x, background: col, ...(big ? { boxShadow: `0 0 0 5px ${col}33` } : {}) }}
    >
      {value <= -0.99 && <X className={`${big ? "size-3" : "size-2.5"} text-white`} strokeWidth={3.5} />}
      {value >= 0.99 && <Star className={`${big ? "size-3" : "size-2.5"} fill-white text-white`} />}
    </span>
  );
}

/** J2: the stacked bar in the calm palette, ordered sit out → tag along → must do */
function StackedClean(props: VariantProps) {
  const c = counts(props.people, props.answers);
  const total = props.people.length;
  const seg = (n: number, bg: string, title: string) => n > 0 && <span title={`${n} ${title}`} style={{ width: `${(n / total) * 100}%`, background: bg }} />;
  return (
    <TrackButton props={props} extra={isMixed(props.people, props.answers) ? <Mixed /> : undefined}>
      <span className="flex items-center gap-1.5">
        <X className="size-3" style={{ color: P.out }} />
        <span className="flex h-2 w-24 gap-px overflow-hidden rounded-full bg-surface-2">
          {seg(c.out, P.out, "sitting out")}
          {seg(c.along, P.along, "tagging along")}
          {seg(c.must, P.must, "must do")}
          {c.none > 0 && <span title={`${c.none} haven't weighed in`} style={{ width: `${(c.none / total) * 100}%`, background: "repeating-linear-gradient(45deg,transparent 0 2px,rgb(0 0 0/.1) 2px 3px)" }} />}
        </span>
        <Star className="size-3" style={{ color: P.must }} />
      </span>
    </TrackButton>
  );
}

/** J3: diverging stacked bar (the survey-report standard): sit-outs grow left of the centre line, must-dos
    grow right, tag-alongs straddle it. Direction and agreement in one bar. */
function StackedDiverging(props: VariantProps) {
  const c = counts(props.people, props.answers);
  const answeredN = c.out + c.along + c.must || 1;
  const HALF = 48;
  const w = (n: number) => (n / answeredN) * HALF;
  return (
    <TrackButton props={props}>
      <span className="flex items-center gap-1.5">
        <X className="size-3" style={{ color: P.out }} />
        <span className="relative h-2.5" style={{ width: HALF * 2 }}>
          <span className="absolute inset-y-0 left-0 right-0 rounded-full" style={{ background: P.line }} />
          {/* left of centre: sit-outs, then half the tag-alongs */}
          <span className="absolute inset-y-0 flex" style={{ right: HALF }}>
            {c.out > 0 && <span className="rounded-l-full" style={{ width: w(c.out), background: P.out }} />}
            {c.along > 0 && <span style={{ width: w(c.along) / 2, background: P.along }} />}
          </span>
          <span className="absolute inset-y-0 flex" style={{ left: HALF }}>
            {c.along > 0 && <span style={{ width: w(c.along) / 2, background: P.along }} />}
            {c.must > 0 && <span className="rounded-r-full" style={{ width: w(c.must), background: P.must }} />}
          </span>
          <span className="absolute -inset-y-0.5 w-px bg-fg/50" style={{ left: HALF }} />
        </span>
        <Star className="size-3" style={{ color: P.must }} />
      </span>
    </TrackButton>
  );
}

/** H2: knob + agreement band, in the calm palette; the band fades out at its ends instead of a hard pill */
function KnobBand2(props: VariantProps) {
  const a = answered(props.people, props.answers);
  if (!a.length)
    return (
      <TrackButton props={props}>
        <SoftTrack faint />
      </TrackButton>
    );
  const lo = Math.min(...a);
  const hi = Math.max(...a);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const wide = hi - lo;
  return (
    <TrackButton props={props}>
      <SoftTrack faint>
        {wide > 0 && (
          <span
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full"
            style={{ left: posX(lo) - 6, width: posX(hi) - posX(lo) + 12, background: `linear-gradient(90deg,${stopsBetween(lo, hi, "66")})`, maskImage: "linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent)" }}
          />
        )}
        <Knob value={mean} x={posX(mean)} />
      </SoftTrack>
    </TrackButton>
  );
}

/** One person's row in the expanded view: the same track and knob as the summary. Yours is clickable at the three stops. */
export function PersonTrack({ a, editable, onSet, w = 132 }: { a: Answer; editable: boolean; onSet: (a: Answer) => void; w?: number }) {
  const W = w;
  const x = (v: number) => ((v + 1) / 2) * W;
  return (
    <SoftTrack w={W} faint={a === null} chosen={a}>
      {a !== null && <Knob value={a} x={x(a)} big />}
      {a === null && <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-muted/60 bg-surface" style={{ left: x(0) }} />}
      {editable &&
        ([-1, 0, 1] as const).map((v) => (
          <button
            key={v}
            onClick={() => onSet(a === v ? null : v)}
            title={LABEL[key(v)]}
            aria-label={LABEL[key(v)]}
            className="absolute top-1/2 z-20 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full hover:bg-fg/8"
            style={{ left: x(v) }}
          />
        ))}
    </SoftTrack>
  );
}

/** I2: liquid line. The track itself is part of the blob: answers swell out of the line and melt back into it.
    One clear answer = a round drop on the line; disagreement = the swelling stretches along the line. */
function LiquidLine(props: VariantProps) {
  const id = useId().replace(/:/g, "");
  const c = counts(props.people, props.answers);
  const a = answered(props.people, props.answers);
  const mean = a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const lobes = ([[-1, c.out], [0, c.along], [1, c.must]] as const).filter(([, n]) => n > 0);
  const SPREAD = 13;
  const H = 30;
  return (
    <TrackButton props={props} extra={isMixed(props.people, props.answers) ? <Mixed /> : undefined}>
      <span className="flex items-center gap-1.5">
        <X className="size-3 shrink-0" style={{ color: P.out }} />
        <svg width={TRACK_W} height={H} className="overflow-visible">
          <defs>
            <linearGradient id={`lg${id}`} x1="0" x2="1">
              <stop offset="0" stopColor={P.out} />
              <stop offset="0.5" stopColor={P.along} />
              <stop offset="1" stopColor={P.must} />
            </linearGradient>
            <filter id={`liq${id}`} x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
              <feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" />
            </filter>
          </defs>
          <g filter={`url(#liq${id})`}>
            {/* the line, thick enough to take part in the melt */}
            <rect x={0} y={H / 2 - 2.5} width={TRACK_W} height={5} rx={2.5} fill={`url(#lg${id})`} opacity={a.length ? 1 : 0.4} />
            {lobes.map(([v, n]) => (
              <circle key={v} cx={posX(mean) + (v - mean) * SPREAD} cy={H / 2} r={3.8 + 2.4 * Math.sqrt(n)} fill={pcol(v)} />
            ))}
          </g>
        </svg>
        <Star className="size-3 shrink-0" style={{ color: P.must }} />
      </span>
    </TrackButton>
  );
}

/** H3: H2 with the band as a soft glow radiating from the knob: a feathered oval (above and below the line too)
    that stretches over the answers it covers. Agreed = a small round halo; scattered = a long, wide glow. */
function KnobGlow(props: VariantProps) {
  const a = answered(props.people, props.answers);
  if (!a.length)
    return (
      <TrackButton props={props}>
        <SoftTrack faint />
      </TrackButton>
    );
  const lo = Math.min(...a);
  const hi = Math.max(...a);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const PAD = 12; // how far the glow reaches past the outermost answers
  const left = posX(lo) - PAD;
  const width = posX(hi) - posX(lo) + PAD * 2;
  return (
    <TrackButton props={props} extra={isMixed(props.people, props.answers) ? <Mixed /> : undefined}>
      <SoftTrack faint>
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 -translate-y-1/2"
          style={{
            left,
            width,
            height: Math.min(28, width), // a round halo when everyone agrees
            background: lo === hi ? pcol(lo) : `linear-gradient(90deg,${pcol(lo)},${P.along} 50%,${pcol(hi)})`,
            opacity: 0.6,
            // feathered on every edge, not just along the line
            maskImage: "radial-gradient(ellipse closest-side, #000 25%, rgb(0 0 0/.45) 60%, transparent)",
            WebkitMaskImage: "radial-gradient(ellipse closest-side, #000 25%, rgb(0 0 0/.45) 60%, transparent)",
            filter: "blur(1.5px)",
          }}
        />
        <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface shadow-sm" style={{ left: posX(mean), background: meanCol(mean) }} />
      </SoftTrack>
    </TrackButton>
  );
}

const VARIANTS: { id: string; name: string; note: string; where: "top" | "bottom"; sliders?: boolean; C: (p: VariantProps) => ReactNode }[] = [
  { id: "A", name: "Avatar strip", note: "Who and what at once. Click your own avatar to answer.", where: "top", C: AvatarStrip },
  { id: "B", name: "Counts", note: "Smallest. Says how many, not who (hover/expand for names).", where: "top", C: Counts },
  { id: "C", name: "Mood bar", note: "One block per person, coloured by answer. Your ✕ / ★ are always one tap.", where: "bottom", C: MoodBar },
  { id: "D", name: "Exceptions in words", note: "Only must-dos and sit-outs, by name. Quiet when everyone's fine.", where: "bottom", C: Exceptions },
  { id: "E", name: "Average knob", note: "Your Figma draft: one knob at the group's average. Click it to answer.", where: "bottom", sliders: true, C: MeanKnob },
  { id: "F", name: "Dot plot", note: "One dot per person at their answer, so a split shows as dots at both ends. Yours has a dark ring.", where: "bottom", sliders: true, C: DotPlot },
  { id: "G", name: "Range", note: "Highlights lowest → highest answer, tick at the average; says “split?” when it spans the whole scale.", where: "bottom", sliders: true, C: RangeBar },
  { id: "H", name: "Knob + agreement band", note: "Your knob = direction; the soft band behind it = how spread out people are. “Mixed” when it spans both ends.", where: "bottom", sliders: true, C: KnobBand },
  { id: "I", name: "Gooey blob", note: "Answers melt into one blob at the average: round = agreed, peanut = two camps, lumpy = scattered.", where: "bottom", sliders: true, C: GooBlob },
  { id: "J", name: "Stacked bar (survey standard)", note: "The usual Likert chart: red / grey / amber segments sized by count; hatched = not answered.", where: "bottom", sliders: true, C: StackedBar },
  { id: "J2", name: "Stacked bar, calm colours", note: "J in one palette: terracotta = sit out, light grey = tag along, green = must do; hatched = not answered.", where: "bottom", sliders: true, C: StackedClean },
  { id: "J3", name: "Diverging stacked bar", note: "Survey-report standard: sit-outs grow left of the centre line, must-dos right. Shows direction and agreement.", where: "bottom", sliders: true, C: StackedDiverging },
  { id: "H3", name: "Knob + glow", note: "H2 with the band as a feathered glow radiating from the knob, above and below the line. Agreed = small halo; scattered = long, wide glow.", where: "bottom", sliders: true, C: KnobGlow },
  { id: "H2", name: "Knob + band, calm colours", note: "H in the same palette; the band fades at its ends and takes the colours of the answers it spans.", where: "bottom", sliders: true, C: KnobBand2 },
  { id: "I2", name: "Liquid line", note: "The line is part of the blob: answers swell out of it. Clear-cut = a round drop; disagreement = a long swelling.", where: "bottom", sliders: true, C: LiquidLine },
  { id: "K", name: "Donut (consensus tools)", note: "How decision tools like Loomio show a vote: a small ring split by answer, ★ in the middle if anyone must-dos it.", where: "bottom", sliders: true, C: Donut },
];

/* ---------- the card shell around a variant ---------- */

function Card({ v, props, expanded }: { v: (typeof VARIANTS)[number]; props: VariantProps; expanded: boolean }) {
  const { people, me, answers, set } = props;
  const must = people.filter((p) => answers[p] === 1);
  const solo = people.length === 1;
  const interest = solo ? (
    <button onClick={() => set(answers[me] === 1 ? null : 1)} title="Must do" className={answers[me] === 1 ? "text-amber-500" : "text-muted hover:text-fg"}>
      <Star className={`size-4 ${answers[me] === 1 ? "fill-current" : ""}`} />
    </button>
  ) : (
    <v.C {...props} />
  );
  return (
    <div className={`rounded-2xl border bg-surface ${must.length ? "border-amber-400/70" : "border-line"}`}>
      <div className="p-3.5">
        <div className="flex items-start gap-2">
          {solo && <span className="pt-0.5">{interest}</span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[16px] font-semibold">Nara Park</p>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/25 px-2 py-0.5 text-[11.5px] font-semibold text-amber-800 dark:text-amber-300">🎫 Not booked</span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted">Nara, Japan · Nature ▾</p>
          </div>
          {!solo && v.where === "top" && <span className="pt-0.5">{interest}</span>}
          <Trash2 className="mt-1 size-4 shrink-0 text-muted" />
        </div>
        <p className="mt-2 text-[13.5px] text-fg/85 italic">“feed the deer, early before the tour buses”</p>
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-accent">
          <Check className="size-3.5" /> Sun 20 · day trip from Kyoto (45 min)
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          {!solo && v.where === "bottom" && interest}
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent">
            <CalendarPlus className="size-3.5" /> Add to Sun 20 <ChevronDown className="size-3.5" />
          </span>
        </div>
      </div>
      {expanded && !solo && (
        <div className="border-t border-line px-3.5 py-3">
          <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">How the group feels</p>
          <ul className="space-y-1.5">
            {(v.sliders ? [me, ...people.filter((x) => x !== me)] : sorted(people, answers)).map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-[13px]">
                {v.sliders ? (
                  <span
                    className="grid size-5 shrink-0 place-items-center rounded-full text-[9.5px] font-bold text-white"
                    style={{ background: `hsl(${hue(p)} 55% 45%)` }}
                  >
                    {p[0]}
                  </span>
                ) : (
                  <AnswerAvatar name={p} a={answers[p] ?? null} size={20} />
                )}
                <span className="w-16 truncate font-semibold">{p === me ? "You" : p}</span>
                {v.sliders ? (
                  <span className="flex items-center gap-2.5">
                    <PersonTrack a={answers[p] ?? null} editable={p === me} onSet={set} />
                    <span
                      className={`text-[12px] ${(answers[p] ?? null) === null ? "text-muted italic" : answers[p] === 0 ? "text-muted" : "font-semibold"}`}
                      style={answers[p] === 1 ? { color: P.must } : answers[p] === -1 ? { color: P.out } : undefined}
                    >
                      {LABEL[key(answers[p] ?? null)]}
                    </span>
                  </span>
                ) : p === me ? (
                  <Choices value={answers[p] ?? null} set={set} />
                ) : (
                  <span className={answers[p] === 1 ? "text-amber-700 dark:text-amber-300" : answers[p] === -1 ? "text-red-600 dark:text-red-400" : answers[p] === null || answers[p] === undefined ? "text-muted italic" : ""}>
                    {LABEL[key(answers[p] ?? null)]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center justify-center gap-1 border-t border-line py-1.5 text-[12px] text-muted">
        Details <ChevronDown className="size-3.5" />
      </div>
    </div>
  );
}

/* ---------- page ---------- */

const START: Answers = { Vishal: null, Maya: 1, Sam: -1, Aditya: 0, Priya: null, Leo: 0 };

export function ProtoInterest() {
  const [count, setCount] = useState(4);
  const [me, setMe] = useState("Vishal");
  const [answers, setAnswers] = useState<Answers>(START);
  const [expanded, setExpanded] = useState(false);
  const [shortlist, setShortlist] = useState(true);
  const SHORTLIST = ["H2"];
  const [palette, setPalette] = useState("teal");
  P = PALETTES[palette];
  const people = ALL_PEOPLE.slice(0, count);
  const props: VariantProps = { people, me, answers, set: (a) => setAnswers((x) => ({ ...x, [me]: a })) };

  return (
    <div className="min-h-full bg-bg px-6 py-8 text-fg">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-[28px]">Group interest on an idea card</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-muted">
          Prototype playground. Each person: <b>★ Must do</b>, <b>tag along</b>, <b>✕ sit out</b>, or hasn't weighed in. All variants share the same answers, so change yours in one and
          watch the others. Solo trips (1 person) collapse to a ☆ by the name.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px]">
          <label className="flex items-center gap-2">
            People
            <select value={count} onChange={(e) => setCount(+e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1">
              {[1, 2, 3, 4, 6].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 (solo)" : n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            You are
            <select value={me} onChange={(e) => setMe(e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1">
              {people.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={expanded} onChange={(e) => setExpanded(e.target.checked)} /> Show expanded
          </label>
          <label className="flex items-center gap-2">
            Colours
            <select value={palette} onChange={(e) => setPalette(e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1">
              {Object.entries(PALETTES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={shortlist} onChange={(e) => setShortlist(e.target.checked)} /> Shortlist only
          </label>
          <span className="flex flex-wrap items-center gap-1.5">
            Everyone else:
            {people
              .filter((p) => p !== me)
              .map((p) => (
                <select
                  key={p}
                  value={key(answers[p] ?? null)}
                  onChange={(e) => setAnswers((x) => ({ ...x, [p]: (e.target.value === "null" ? null : +e.target.value) as Answer }))}
                  className="rounded-lg border border-line bg-bg px-1.5 py-0.5 text-[12px]"
                  title={p}
                >
                  {ORDER.map((a) => (
                    <option key={key(a)} value={key(a)}>
                      {p}: {LABEL[key(a)]}
                    </option>
                  ))}
                </select>
              ))}
          </span>
          <button onClick={() => setAnswers(START)} className="ml-auto text-muted hover:text-fg">
            Reset
          </button>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {VARIANTS.filter((v) => !shortlist || SHORTLIST.includes(v.id)).map((v) => (
            <section key={v.id}>
              <p className="mb-2 text-[14px]">
                <b>
                  {v.id}. {v.name}
                </b>{" "}
                <span className="text-muted">· {v.note}</span>
              </p>
              <Card v={v} props={props} expanded={expanded} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
