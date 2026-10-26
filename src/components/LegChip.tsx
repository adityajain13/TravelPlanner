import { useState } from "react";
import { BedDouble, Bike, Car, Footprints, Loader2, Plane, TrainFront } from "lucide-react";
import { formatDistance, formatDuration, MODES, transitIssue, type LegState, type TravelMode } from "../lib/routing";

export const MODE_ICON: Record<TravelMode | "flight", React.ReactNode> = {
  drive: <Car className="size-3.5" />,
  walk: <Footprints className="size-3.5" />,
  bike: <Bike className="size-3.5" />,
  transit: <TrainFront className="size-3.5" />,
  flight: <Plane className="size-3.5" />,
};
export const MODE_LABEL: Record<TravelMode, string> = { drive: "Drive", walk: "Walk", bike: "Bike", transit: "Transit" };

/** The travel row between two stops: "🚗 21 min · 8.7 km". Tap to change how you get there. */
const GMAPS_MODE: Record<TravelMode, string> = { drive: "driving", walk: "walking", bike: "bicycling", transit: "transit" };

export function LegChip({ mode, state, readOnly, onMode, from, to, label }: { mode: TravelMode; state?: LegState; readOnly?: boolean; onMode: (m: TravelMode) => void; from?: [number, number]; to?: [number, number]; /** "From Hotel X" / "To Hotel X" */ label?: string }) {
  const [open, setOpen] = useState(false);
  const res = typeof state === "object" ? state : null;
  const shownMode = res?.mode ?? mode;

  let text: string;
  if (state === "loading" || state === undefined) text = "Finding route…";
  else if (state === "failed") text = !navigator.onLine ? "Route unavailable offline" : mode === "transit" ? "No transit data here" : "No route found";
  else if (res!.mode === "flight") text = `${formatDistance(res!.distance)} · too far to route`;
  else
    text = [(res!.estimated ? "≈ " : "") + formatDuration(res!.duration ?? 0) + (res!.rough ? " (rough estimate)" : ""), formatDistance(res!.distance), res!.mode === "transit" && res!.transfers ? `${res!.transfers} transfer${res!.transfers > 1 ? "s" : ""}` : ""]
      .filter(Boolean)
      .join(" · ");

  const steps = res?.steps?.filter((s) => s.mode !== "WALK" || s.minutes >= 2);

  return (
    <div className="relative my-0.5 ml-9 flex flex-wrap items-center gap-x-2 text-[13px] text-muted" onClick={(e) => e.stopPropagation()}>
      <button
        disabled={readOnly || shownMode === "flight"}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full px-2 py-0.5 hover:bg-surface-2 hover:text-fg disabled:hover:bg-transparent"
        title={res?.rough ? `No timetable available here${transitIssue ? ` (${transitIssue})` : ""}: estimated from distance` : res?.estimated ? "Timed on the same weekday next week: timetables for your dates aren't published yet" : readOnly ? undefined : "Change how you get here"}
      >
        {label && (
          <span className="flex items-center gap-1 font-semibold text-fg/80">
            <BedDouble className="size-3.5" /> {label} ·
          </span>
        )}
        {state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : MODE_ICON[shownMode]}
        {text}
      </button>
      {from && to && shownMode !== "flight" && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&origin=${from[1]},${from[0]}&destination=${to[1]},${to[0]}&travelmode=${GMAPS_MODE[mode]}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-muted/80 underline-offset-2 hover:text-fg hover:underline"
        >
          Directions
        </a>
      )}
      {steps && steps.length > 0 && (
        <span className="truncate text-muted/80">
          {steps.map((s) => (s.mode === "WALK" ? `walk ${s.minutes}m` : `${s.name ?? s.mode.toLowerCase()} ${s.minutes}m`)).join(" → ")}
        </span>
      )}
      {open && (
        <div data-popover className="absolute top-full left-0 z-30 mt-1 flex gap-1 rounded-full border border-line bg-surface p-1 shadow-xl">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => (onMode(m), setOpen(false))}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${m === mode ? "bg-accent text-on-accent" : "hover:bg-surface-2 hover:text-fg"}`}
            >
              {MODE_ICON[m]} {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
