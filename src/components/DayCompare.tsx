import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BedDouble, Check, Clock, Plane, GitBranch, Pencil, Route as RouteIcon, Trash2, Wallet, X } from "lucide-react";
import type { Item } from "../lib/trips";
import type { LegState } from "../lib/routing";
import { formatDistance, formatDuration } from "../lib/routing";
import { formatMoney } from "../lib/fx";
import { formatDayHeading } from "../lib/dates";
import { PinMarker } from "./ItemCard";
import { fmtTime } from "./TimeField";
import { askConfirm } from "./ConfirmDialog";
import { inkOn } from "../lib/colors";
import { PROTOMAPS_KEY } from "../lib/mapStyle";
import type { Theme } from "../lib/theme";
import type { Pin, Route } from "./TripMap";

const TripMap = lazy(() => import("./TripMap").then((m) => ({ default: m.TripMap })));

export interface Version {
  /** Draft id; undefined = the day's plan ("main"). */
  id?: string;
  name: string;
  items: Item[];
  legs: LegState[];
  /** For the column's map: numbered stops (plus the hotel/airport its legs start or end at) and routes. */
  pins: Pin[];
  routes: Route[];
  /** Where the day starts and ends: last night's / tonight's hotel, or the airport on a flight day. */
  start?: Bookend;
  end?: Bookend;
}

export interface Bookend {
  name: string;
  kind: "hotel" | "airport";
  /** Landing / take-off time (airports). */
  time?: string;
}

interface Props {
  date: string;
  color: string;
  versions: Version[];
  /** The version shown in the itinerary right now. */
  shown?: string;
  currency: string;
  theme: Theme;
  convert: (amount: number, from: string) => number | null;
  readOnly?: boolean;
  onEdit: (id: string | undefined) => void;
  onUse: (id: string) => void;
  /** id undefined: renames the day's plan. */
  onRename: (id: string | undefined, name: string) => void;
  onDelete: (id: string) => void;
  onFork: (from: string | undefined) => void;
  onClose: () => void;
}

/** Every plan for one day side by side: route sketch, travel, cost and stops, then pick one. */
export function DayCompare(p: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[role=alertdialog]") && p.onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [p]);

  // One frame for every sketch, so the routes compare at the same scale
  const pts = p.versions.flatMap((v) => v.items.filter((i) => i.kind === "place" && i.lat != null && i.lng != null).map((i) => [i.lng!, i.lat!] as const));
  const box = pts.length
    ? {
        minX: Math.min(...pts.map((q) => q[0])),
        maxX: Math.max(...pts.map((q) => q[0])),
        minY: Math.min(...pts.map((q) => q[1])),
        maxY: Math.max(...pts.map((q) => q[1])),
      }
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm max-sm:p-0" onClick={p.onClose}>
      <div
        role="dialog"
        aria-label="Compare plans"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[min(96vw,1240px)] flex-col rounded-3xl border border-line bg-surface shadow-2xl max-sm:h-full max-sm:max-h-none max-sm:rounded-none"
      >
        <div className="flex items-center gap-3 border-b border-line px-6 py-4 max-sm:px-4">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[22px] leading-tight">Compare plans</h2>
            <p className="truncate text-[13px] text-muted">
              {formatDayHeading(p.date)} · {p.versions.length} {p.versions.length === 1 ? "plan" : "plans"}
            </p>
          </div>
          <button onClick={p.onClose} className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-muted hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-5 max-sm:snap-x max-sm:snap-mandatory max-sm:p-4">
          {p.versions.map((v) => (
            <Column key={v.id ?? "main"} v={v} {...p} box={box} />
          ))}
          {!p.readOnly && (
            <button
              onClick={() => p.onFork(p.shown)}
              className="flex w-[200px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-[14px] font-semibold text-muted hover:border-accent/60 hover:text-accent"
            >
              <GitBranch className="size-5" />
              New draft
              <span className="px-6 text-center text-[12px] font-normal">Copies the plan you're viewing</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

type Box = { minX: number; maxX: number; minY: number; maxY: number } | null;

function Column({ v, box, ...p }: Props & { v: Version; box: Box }) {
  const [name, setName] = useState(v.name);
  useEffect(() => setName(v.name), [v.name]);
  const places = v.items.filter((i) => i.kind === "place");
  let secs = 0;
  let metres = 0;
  for (const l of v.legs) if (typeof l === "object" && l.mode !== "flight") (secs += l.duration ?? 0), (metres += l.distance);
  let cost = 0;
  let costKnown = false;
  for (const i of v.items)
    if (i.cost != null) {
      const c = p.convert(i.cost, i.costCurrency ?? p.currency);
      if (c != null) (cost += c), (costKnown = true);
    }
  const first = places.find((i) => i.startTime)?.startTime;
  const last = [...places].reverse().find((i) => i.endTime ?? i.startTime);
  const span = first && last ? `${fmtTime(first)} – ${fmtTime(last.endTime ?? last.startTime)}` : null;
  const isShown = p.shown === v.id;
  let n = 0;

  return (
    <div className={`flex w-[300px] shrink-0 snap-center flex-col rounded-2xl border bg-bg/60 max-sm:w-[86vw] ${isShown ? "border-accent/50" : "border-line"}`}>
      <div className="flex items-center gap-2 px-4 pt-4">
        {!p.readOnly ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => (name.trim() ? name !== v.name && p.onRename(v.id, name) : setName(v.name))}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="min-w-0 flex-1 rounded-md bg-transparent font-display text-[19px] outline-none focus:bg-surface-2 focus:px-1.5"
            aria-label="Plan name"
          />
        ) : (
          <h3 className="min-w-0 flex-1 truncate font-display text-[19px]">{v.name}</h3>
        )}
        {!v.id && <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold tracking-wide text-accent uppercase">Day's plan</span>}
        {isShown && v.id && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold tracking-wide text-muted uppercase">Viewing</span>}
      </div>

      {PROTOMAPS_KEY && v.pins.length ? (
        <div className="mx-4 my-3 h-[190px] overflow-hidden rounded-xl bg-surface-2/40 [&_.maplibregl-ctrl-attrib]:text-[9px]">
          <Suspense fallback={null}>
            <TripMap mini pins={v.pins} routes={v.routes} selectedId={null} onSelect={() => undefined} theme={p.theme} fitKey={v.id ?? "main"} />
          </Suspense>
        </div>
      ) : (
        <Sketch items={places} box={box} color={p.color} />
      )}

      <div className="grid grid-cols-3 gap-1.5 px-4 text-[12px]">
        <Stat icon={<RouteIcon />} value={secs ? formatDuration(secs) : "—"} sub={metres ? formatDistance(metres) : "travel"} />
        <Stat icon={<Clock />} value={`${places.length} ${places.length === 1 ? "stop" : "stops"}`} sub={span ?? "no times"} />
        <Stat icon={<Wallet />} value={costKnown ? formatMoney(cost, p.currency) : "—"} sub="cost" />
      </div>

      <ol className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-2 [scrollbar-width:thin]">
        {v.start && <End e={v.start} label="Start" />}
        {places.length === 0 && <li className="px-1 py-6 text-center text-[13px] text-muted">Nothing planned yet</li>}
        {places.map((i) => (
          <li key={i.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
            <PinMarker color={p.color} label={++n} size={20} />
            <span className="min-w-0 flex-1 truncate text-[14px]">{i.name}</span>
            {i.startTime && <span className="shrink-0 text-[12px] text-muted tabular-nums">{fmtTime(i.startTime)}</span>}
          </li>
        ))}
        {v.end && <End e={v.end} label="End" />}
      </ol>

      <div className="flex gap-2 border-t border-line p-3">
        <button
          onClick={() => p.onEdit(v.id)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line py-2 text-[13px] font-semibold text-muted hover:text-fg"
        >
          <Pencil className="size-3.5" /> {isShown ? "Back to it" : p.readOnly ? "View" : "Edit"}
        </button>
        {v.id && !p.readOnly && (
          <>
            <button
              onClick={async () => {
                if (
                  await askConfirm({
                    title: `Make “${v.name}” the day's plan?`,
                    body: `“${p.versions.find((x) => !x.id)?.name}” moves to the drafts with its name, so you can swap back any time.`,
                    confirmLabel: "Use this plan",
                    danger: false,
                    icon: <Check />,
                  })
                )
                  p.onUse(v.id!);
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent py-2 text-[13px] font-bold text-on-accent"
            >
              <Check className="size-3.5" /> Use this
            </button>
            <button
              onClick={async () => {
                if (await askConfirm({ title: `Delete “${v.name}”?`, body: "This draft and its stops are removed. The day's plan isn't touched.", icon: <Trash2 /> })) p.onDelete(v.id!);
              }}
              className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-muted hover:border-danger/50 hover:text-danger"
              title="Delete draft"
              aria-label="Delete draft"
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** The hotel / airport the day starts or ends at, set apart from the numbered stops. */
function End({ e, label }: { e: Bookend; label: string }) {
  return (
    <li className="flex items-center gap-2 rounded-lg bg-surface-2/50 px-1 py-1.5">
      <span className="grid w-5 shrink-0 place-items-center text-muted [&>svg]:size-4">{e.kind === "hotel" ? <BedDouble /> : <Plane />}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
        <span className="font-semibold text-fg">{label}</span> · {e.name}
      </span>
      {e.time && <span className="shrink-0 pr-1 text-[12px] text-muted tabular-nums">{fmtTime(e.time)}</span>}
    </li>
  );
}

function Stat({ icon, value, sub }: { icon: React.ReactNode; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2/60 px-2.5 py-2">
      <span className="mb-1 block text-muted [&>svg]:size-3.5">{icon}</span>
      <span className="block truncate text-[13px] font-semibold text-fg tabular-nums">{value}</span>
      <span className="block truncate text-muted">{sub}</span>
    </div>
  );
}

/** The stops as a numbered dot-and-line sketch, all plans drawn in the same frame. */
function Sketch({ items, box, color }: { items: Item[]; box: Box; color: string }) {
  const W = 268;
  const H = 150;
  const pinned = items.filter((i) => i.lat != null && i.lng != null);
  if (!box || !pinned.length)
    return <div className="mx-4 my-3 grid h-[150px] place-items-center rounded-xl bg-surface-2/40 text-[12px] text-muted">No pins</div>;
  const pad = 16;
  const midLat = ((box.minY + box.maxY) / 2) * (Math.PI / 180);
  const spanX = Math.max((box.maxX - box.minX) * Math.cos(midLat), 1e-4);
  const spanY = Math.max(box.maxY - box.minY, 1e-4);
  const k = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const ox = (W - spanX * k) / 2;
  const oy = (H - spanY * k) / 2;
  const xy = (i: Item) => [ox + (i.lng! - box.minX) * Math.cos(midLat) * k, H - oy - (i.lat! - box.minY) * k] as const;
  const order = items.filter((i) => i.kind === "place");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-4 my-3 h-[150px] w-[calc(100%-2rem)] rounded-xl bg-surface-2/40" aria-hidden>
      <polyline points={pinned.map((i) => xy(i).join(",")).join(" ")} fill="none" stroke={color} strokeOpacity=".7" strokeWidth="2" strokeLinejoin="round" strokeDasharray="5 4" />
      {pinned.map((i) => {
        const [x, y] = xy(i);
        return (
          <g key={i.id}>
            <circle cx={x} cy={y} r="8" fill={color} stroke="rgb(0 0 0 / .4)" />
            <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={inkOn(color)}>
              {order.indexOf(i) + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
