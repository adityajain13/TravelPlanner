import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BedDouble, ChevronLeft, ChevronRight, Copy, Globe, Map as MapIcon, Navigation, Phone, X } from "lucide-react";
import type { Item, Reservation } from "../lib/trips";
import type { LegState, TravelMode } from "../lib/routing";
import { formatDistance, formatDuration } from "../lib/routing";
import { formatDayHeading } from "../lib/dates";
import { inkOn } from "../lib/colors";
import type { SectionInfo } from "./Section";
import { dayChips, RES_ICON } from "./Reservations";
import { fmtTime } from "./TimeField";
import { RichText, RichLine } from "./RichText";
import { GMAPS_MODE } from "./LegChip";
import type { Theme } from "../lib/theme";
import type { Pin, Route } from "./TripMap";

const TripMap = lazy(() => import("./TripMap").then((m) => ({ default: m.TripMap })));

type Leg = { mode: TravelMode; state?: LegState; from: [number, number]; to: [number, number]; label?: string; who?: string[] };

interface Props {
  title: string;
  days: SectionInfo[];
  legsFor: (day: SectionInfo) => Map<string, Leg> | undefined;
  reservations: Reservation[];
  theme: Theme;
  mapFor: (day: SectionInfo) => { pins: Pin[]; routes: Route[] };
  onToggleCheck?: (itemId: string, checkId: string) => void;
  onExit: () => void;
}

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toMin = (t?: string) => (t && /^\d{1,2}:\d{2}/.test(t) ? +t.slice(0, t.indexOf(":")) * 60 + +t.slice(t.indexOf(":") + 1, t.indexOf(":") + 3) : null);
const dirUrl = (lat: number, lng: number, mode?: TravelMode, placeId?: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}${placeId ? `&destination_place_id=${placeId}` : ""}${mode ? `&travelmode=${GMAPS_MODE[mode]}` : ""}`;

/**
 * Travel mode (phones): one day at a time, the next thing first, big tap targets, no photos and
 * no map unless asked (battery and data). Directions open Google Maps from where you are.
 */
export function TravelView(p: Props) {
  const today = localDate();
  const start = p.days[0]?.date ?? today;
  const end = p.days.at(-1)?.date ?? today;
  const todayIdx = p.days.findIndex((d) => d.date === today);
  const [idx, setIdx] = useState(todayIdx >= 0 ? todayIdx : today > end ? p.days.length - 1 : 0);
  const [open, setOpen] = useState<string | null>(null);
  const [map, setMap] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // A clock that ticks once a minute is all "now / next" needs
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const day = p.days[Math.min(idx, p.days.length - 1)];
  const legs = day ? p.legsFor(day) : undefined;
  const isToday = day?.date === localDate(now);
  const chips = useMemo(() => (day ? dayChips(p.reservations, day.date!) : []), [day, p.reservations]);

  if (!day) return <div className="grid h-full place-items-center p-6 text-muted">No days in this trip yet.</div>;

  const places = day.items.filter((i) => i.kind === "place");
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const current = isToday ? places.find((i) => (toMin(i.startTime) ?? 1e9) <= nowMin && nowMin < (toMin(i.endTime) ?? (toMin(i.startTime) ?? 0) + 60)) : undefined;
  const next = isToday ? places.find((i) => (toMin(i.startTime) ?? -1) > nowMin) : undefined;
  const tonight = p.reservations.find((r) => r.type === "lodging" && r.startDate && r.startDate <= day.date! && (r.endDate ?? r.startDate) > day.date!);
  let n = 0;
  const numberOf = new Map(places.map((i) => [i.id, ++n]));

  const legLine = (id: string) => {
    const keys = legs ? [...legs.keys()].filter((k) => k === id || k.startsWith(`${id}#`)) : [];
    return keys.map((k) => {
      const l = legs!.get(k)!;
      const r = typeof l.state === "object" ? l.state : null;
      if (!r || r.mode === "flight") return null;
      return (
        <p key={k} className="ml-[4.25rem] flex items-center gap-1.5 py-1 text-[13px] text-muted">
          <span className="h-4 w-px bg-line" />
          {l.who?.length ? `${l.who.join(" & ")} · ` : ""}
          {r.duration ? formatDuration(r.duration) : ""} · {formatDistance(r.distance)} {l.mode === "walk" ? "walk" : l.mode === "transit" ? "transit" : l.mode === "bike" ? "bike" : "drive"}
        </p>
      );
    });
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Header: back to the full app, the trip, the map on demand */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
        <button onClick={p.onExit} className="flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[13px] font-semibold text-muted active:bg-surface-2" aria-label="Leave travel mode">
          <ArrowLeft className="size-4" /> Full view
        </button>
        <p className="min-w-0 flex-1 truncate text-center font-display text-[17px]">{p.title}</p>
        <button onClick={() => setMap(true)} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-[13px] font-semibold active:bg-surface-2">
          <MapIcon className="size-4" /> Map
        </button>
      </header>

      {/* Day switcher */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1.5">
        <button disabled={idx === 0} onClick={() => (setIdx((i) => i - 1), setOpen(null))} className="grid size-11 place-items-center rounded-full text-muted active:bg-surface-2 disabled:opacity-30" aria-label="Previous day">
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="flex items-center justify-center gap-2 text-[16px] font-bold">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: day.color }} />
            <span className="truncate">Day {day.dayNumber} · {formatDayHeading(day.date!)}</span>
          </p>
          {!isToday && todayIdx >= 0 && (
            <button onClick={() => setIdx(todayIdx)} className="text-[12px] font-semibold text-accent">
              Back to today
            </button>
          )}
          {!isToday && todayIdx < 0 && <p className="text-[12px] text-muted">{today < start ? "Trip hasn't started" : "Trip is over"}</p>}
        </div>
        <button disabled={idx >= p.days.length - 1} onClick={() => (setIdx((i) => i + 1), setOpen(null))} className="grid size-11 place-items-center rounded-full text-muted active:bg-surface-2 disabled:opacity-30" aria-label="Next day">
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        {/* Now / next */}
        {isToday && (current || next) && (
          <div className="m-3 space-y-3 rounded-2xl border border-accent/40 bg-accent/10 p-4">
            {current && (
              <div>
                <p className="text-[11px] font-bold tracking-wider text-accent uppercase">Now</p>
                <p className="truncate text-[18px] font-bold">{current.name}</p>
                {current.endTime && <p className="text-[13px] text-muted">until {fmtTime(current.endTime)}</p>}
              </div>
            )}
            {next && (
              <div>
                <p className="text-[11px] font-bold tracking-wider text-accent uppercase">Next · {fmtTime(next.startTime)}</p>
                <p className="truncate text-[18px] font-bold">{next.name}</p>
                {(() => {
                  const l = legs?.get(next.id);
                  const r = l && typeof l.state === "object" ? l.state : null;
                  return r?.duration ? <p className="text-[13px] text-muted">{formatDuration(r.duration)} from the stop before</p> : null;
                })()}
                {next.lat != null && next.lng != null && (
                  <a href={dirUrl(next.lat, next.lng, legs?.get(next.id)?.mode, next.googlePlaceId)} target="_blank" rel="noreferrer" className="mt-2.5 flex items-center justify-center gap-2 rounded-xl bg-accent py-3 text-[15px] font-bold text-on-accent active:opacity-90">
                    <Navigation className="size-4" /> Directions
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Today's bookings: what you'll be asked for at the counter */}
        {chips.length > 0 && (
          <div className="space-y-2 px-3 pt-3">
            {chips.map((c, i) => (
              <div key={`${c.r.id}-${i}`} className="rounded-2xl border border-line bg-surface p-3.5">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted [&>svg]:size-4">{RES_ICON[c.r.type]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">{c.r.title}</p>
                    <p className="truncate text-[13px] text-muted">
                      {c.verb}
                      {c.clock ? ` · ${fmtTime(c.clock)}` : ""}
                      {c.people ? ` · ${c.people} people` : ""}
                    </p>
                  </div>
                </div>
                {[...new Set((c.copies ?? [c.r]).map((x) => x.confirmation).filter(Boolean))].map((conf) => (
                  <CopyRow key={conf} label="Confirmation" value={conf!} />
                ))}
                {c.verb !== "Staying" &&
                  (c.copies ?? [c.r])
                    .filter((x) => x.notes?.trim())
                    .map((x) => (
                      <div key={x.id} className="mt-2.5 text-[14px] leading-snug text-muted">
                        {(c.copies?.length ?? 1) > 1 && x.traveler && <p className="mb-0.5 text-[11px] font-bold tracking-wide text-fg/80 uppercase">{x.traveler}</p>}
                        <RichText text={x.notes!} />
                      </div>
                    ))}
                {c.r.lat != null && c.r.lng != null && c.r.type !== "flight" && (
                  <a href={dirUrl(c.r.lat, c.r.lng)} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-[14px] font-semibold active:bg-surface-2">
                    <Navigation className="size-4" /> Directions
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* The day's stops */}
        <ol className="mt-3">
          {day.items.length === 0 && <li className="px-6 py-10 text-center text-muted">Nothing planned this day.</li>}
          {day.items.map((it) => (
            <li key={it.id}>
              {it.kind === "place" && legLine(it.id)}
              {it.kind === "place" ? (
                <StopRow it={it} n={numberOf.get(it.id)!} color={day.color} open={open === it.id} onToggle={() => setOpen((o) => (o === it.id ? null : it.id))} mode={legs?.get(it.id)?.mode} current={current?.id === it.id} weekday={new Date(`${day.date}T12:00`).getDay()} />
              ) : it.kind === "checklist" ? (
                <div className="mx-3 my-2 rounded-2xl bg-surface px-4 py-3">
                  {it.name && <p className="mb-1.5 text-[15px] font-bold">{it.name}</p>}
                  {(it.checks ?? []).map((c) => (
                    <label key={c.id} className="flex min-h-11 items-center gap-3 text-[15px]">
                      <input type="checkbox" checked={!!c.done} disabled={!p.onToggleCheck} onChange={() => p.onToggleCheck?.(it.id, c.id)} className="size-5 accent-[var(--accent)]" />
                      <RichLine text={c.text} className={c.done ? "text-muted line-through" : ""} />
                    </label>
                  ))}
                </div>
              ) : (
                <div className="mx-3 my-2 rounded-2xl bg-surface px-4 py-3 text-[15px] text-muted">
                  <RichText text={it.name} />
                </div>
              )}
            </li>
          ))}
          {legLine("end")}
        </ol>

        {/* Where you sleep tonight */}
        {tonight && (
          <div className="m-3 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
            <BedDouble className="size-5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Tonight</p>
              <p className="truncate text-[15px] font-bold">{tonight.title}</p>
              {tonight.address && <p className="truncate text-[13px] text-muted">{tonight.address}</p>}
            </div>
            {tonight.lat != null && tonight.lng != null && (
              <a href={dirUrl(tonight.lat, tonight.lng)} target="_blank" rel="noreferrer" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent" aria-label="Directions to the hotel">
                <Navigation className="size-4" />
              </a>
            )}
          </div>
        )}
      </div>

      {map && (
        <div className="fixed inset-0 z-[95] bg-bg">
          <Suspense fallback={null}>
            <TripMap mini {...p.mapFor(day)} selectedId={null} onSelect={() => undefined} theme={p.theme} fitKey={day.key} />
          </Suspense>
          <button onClick={() => setMap(false)} className="absolute top-[max(env(safe-area-inset-top),0.75rem)] left-3 grid size-11 place-items-center rounded-full border border-line bg-surface shadow-lg" aria-label="Close map">
            <X className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function StopRow({ it, n, color, open, onToggle, mode, current, weekday }: { it: Item; n: number; color: string; open: boolean; onToggle: () => void; mode?: TravelMode; current: boolean; weekday: number }) {
  const g = it.google;
  // Google lists hours Monday-first; getDay() is Sunday-first
  const hoursToday = g?.hours?.[(weekday + 6) % 7];
  return (
    <div className={`mx-3 my-1 rounded-2xl border ${current ? "border-accent/50 bg-accent/5" : "border-line bg-surface"}`}>
      <div className="flex items-center gap-3 p-3">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <span className="w-12 shrink-0 text-right text-[13px] leading-tight font-semibold tabular-nums">{it.startTime ? fmtTime(it.startTime) : "—"}</span>
          <span className="grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold" style={{ background: color, color: inkOn(color) }}>
            {n}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-bold">{it.name}</span>
            {it.address && <span className="block truncate text-[13px] text-muted">{it.address}</span>}
          </span>
        </button>
        {it.lat != null && it.lng != null && (
          <a href={dirUrl(it.lat, it.lng, mode, it.googlePlaceId)} target="_blank" rel="noreferrer" className="grid size-11 shrink-0 place-items-center rounded-full border border-line active:bg-surface-2" aria-label={`Directions to ${it.name}`}>
            <Navigation className="size-4" />
          </a>
        )}
      </div>
      {open && (
        <div className="space-y-2.5 border-t border-line px-4 py-3 text-[14px]">
          {it.endTime && <p className="text-muted">Until {fmtTime(it.endTime)}</p>}
          {hoursToday && <p className="text-muted">{hoursToday}</p>}
          {it.notes && <RichText text={it.notes} className="leading-snug" />}
          <div className="flex flex-wrap gap-2">
            {g?.phone && (
              <a href={`tel:${g.phone.replace(/\s+/g, "")}`} className="flex min-h-11 items-center gap-2 rounded-full border border-line px-4 font-semibold active:bg-surface-2">
                <Phone className="size-4" /> Call
              </a>
            )}
            {g?.website && (
              <a href={g.website} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 rounded-full border border-line px-4 font-semibold active:bg-surface-2">
                <Globe className="size-4" /> Website
              </a>
            )}
            {it.address && <CopyButton value={it.address} label="Copy address" />}
          </div>
          {!it.endTime && !hoursToday && !it.notes && !g?.phone && !g?.website && !it.address && <p className="text-muted">No details saved for this stop.</p>}
        </div>
      )}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl bg-surface-2/70 px-3 py-2">
      <span className="min-w-0">
        <span className="block text-[11px] font-bold tracking-wider text-muted uppercase">{label}</span>
        <span className="block truncate font-mono text-[16px] font-semibold tracking-wide">{value}</span>
      </span>
      <CopyButton value={value} />
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)));
      }}
      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-line px-4 font-semibold active:bg-surface-2 ${done ? "text-accent" : ""}`}
      aria-label={label ?? "Copy"}
    >
      <Copy className="size-4" /> {done ? "Copied" : (label ?? "Copy")}
    </button>
  );
}
