import { useState, type ReactNode } from "react";
import { AlertTriangle, BedDouble, CalendarX, Check, ChevronDown, Clock, Copy, Lightbulb, MapPinOff, Plane, Sparkles, Wallet } from "lucide-react";
import type { Item, Reservation, TripState } from "../lib/trips";
import { sortReservations } from "../lib/trips";
import { daysBetween, formatShort, parseISODate, todayISO } from "../lib/dates";
import { formatMoney } from "../lib/fx";
import { formatDuration, type LegState } from "../lib/routing";
import { RES_ICON } from "./Reservations";
import { fmtTime } from "./TimeField";
import type { SectionInfo } from "./Section";

/*
 * Trip overview at the top of the itinerary. What it shows depends on where the trip is:
 *  - before: countdown, what's still missing, budget so far, first day
 *  - during: today's next stop with how long it takes to get there, tonight's hotel
 *  - after:  a short recap (days, stops, spent)
 * Readiness, budget, key bookings and nudges are worked out from the trip itself.
 */

type Phase = "before" | "during" | "after";

interface Props {
  state: TripState;
  sections: SectionInfo[];
  spent: number;
  legs: Map<string, Map<string, { state?: LegState }>>;
  onSelect: (itemId: string) => void;
  onOpenRes: (r: Partial<Reservation>) => void;
  onGo: (target: "bookings" | "budget" | { section: string }) => void;
  readOnly?: boolean;
  /** For testing: pretend today is this date (and time). */
  now?: Date;
}

const readOpen = () => {
  try {
    return localStorage.getItem("tp-overview") !== "closed";
  } catch {
    return true;
  }
};

export function TripOverview(p: Props) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem("tp-overview", o ? "closed" : "open");
      } catch {
        /* ignore */
      }
      return !o;
    });
  };
  const { meta, reservations, items } = p.state;
  const now = p.now ?? new Date();
  const today = p.now ? `${p.now.getFullYear()}-${String(p.now.getMonth() + 1).padStart(2, "0")}-${String(p.now.getDate()).padStart(2, "0")}` : todayISO();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const days = daysBetween(meta.startDate, meta.endDate);
  const phase: Phase = today < meta.startDate ? "before" : today > meta.endDate ? "after" : "during";
  const dayIdx = days.indexOf(today);
  const daySections = p.sections.filter((s) => s.kind === "day");
  const places = (s: SectionInfo) => s.items.filter((i) => i.kind === "place");
  const currency = meta.currency ?? "CAD";

  // ── Snapshot ────────────────────────────────────────────────────────────
  const until = Math.round((parseISODate(meta.startDate).getTime() - parseISODate(today).getTime()) / 86400000);
  const countdown =
    phase === "before" ? (until === 1 ? "Tomorrow" : `In ${until} days`) : phase === "during" ? `Day ${dayIdx + 1} of ${days.length}` : `Ended ${formatShort(meta.endDate)}`;

  // ── Readiness ───────────────────────────────────────────────────────────
  const nights = days.slice(0, -1);
  const lodging = reservations.filter((r) => r.type === "lodging" && r.startDate);
  // A night spent on an overnight flight or train counts as covered
  const overnight = (d: string) => reservations.some((r) => (r.type === "flight" || r.type === "train") && r.startDate === d && (r.endDate ?? r.startDate) > d);
  const unbookedNights = nights.filter((d) => !overnight(d) && !lodging.some((h) => h.startDate! <= d && (h.endDate ?? h.startDate!) > d));
  const flights = reservations.filter((r) => r.type === "flight");
  const flightCount = new Set(flights.map((f) => `${f.title}|${f.startDate}`)).size;

  // ── Budget ──────────────────────────────────────────────────────────────
  const budget = meta.budget;
  const elapsed = phase === "before" ? 0 : phase === "after" ? 1 : (dayIdx + 1) / days.length;
  const pct = budget ? p.spent / budget : 0;
  // During the trip: compare spending with how far through the trip you are (bookings are paid
  // up front, so only warn once you're clearly ahead of pace)
  const trendingOver = !!budget && (pct > 1 || (phase === "during" && pct > Math.min(1, elapsed + 0.25)));

  // ── Key bookings (upcoming first) ───────────────────────────────────────
  const seen = new Set<string>();
  const keyBookings = sortReservations(reservations.filter((r) => r.type === "flight" || r.type === "lodging" || r.type === "train"))
    .filter((r) => (phase === "after" ? true : (r.endDate ?? r.startDate ?? "9999") >= today))
    .filter((r) => (seen.has(`${r.title}|${r.startDate}`) ? false : (seen.add(`${r.title}|${r.startDate}`), true)))
    .slice(0, 4);

  // ── Nudges ──────────────────────────────────────────────────────────────
  const emptyDays = daySections.filter((s) => s.items.length === 0 && !reservations.some((r) => (r.type === "flight" || r.type === "train") && (r.startDate === s.date || r.endDate === s.date)));
  const unscheduled = p.sections.filter((s) => s.kind === "list").reduce((n, s) => n + places(s).length, 0);
  const conflicts: { day: SectionInfo; a: Item; b: Item }[] = [];
  for (const s of daySections) {
    const timed = places(s)
      .filter((i) => i.startTime && i.endTime)
      .sort((x, y) => x.startTime!.localeCompare(y.startTime!));
    for (let i = 1; i < timed.length; i++) if (timed[i].startTime! < timed[i - 1].endTime!) conflicts.push({ day: s, a: timed[i - 1], b: timed[i] });
  }
  const unpinned = items.filter((i) => i.kind === "place" && (i.lat == null || i.lng == null)).length;

  // ── Today (during) / first day (before) ─────────────────────────────────
  const todaySec = daySections.find((s) => s.date === today);
  const upcoming = todaySec ? places(todaySec).filter((i) => !i.endTime || i.endTime > nowTime) : [];
  const next = upcoming.find((i) => (i.startTime ?? "99") >= nowTime) ?? upcoming[0];
  const nextLeg = next && todaySec ? p.legs.get(todaySec.key)?.get(next.id)?.state : undefined;
  const tonight = phase === "during" ? lodging.find((h) => h.startDate! <= today && (h.endDate ?? h.startDate!) > today) : undefined;
  const firstDay = daySections[0];

  const readiness: { ok: boolean; icon: ReactNode; text: ReactNode; action?: () => void; actionLabel?: string }[] = [
    nights.length > 0 && {
      ok: unbookedNights.length === 0,
      icon: <BedDouble />,
      text:
        unbookedNights.length === 0
          ? `Every night has a place to stay`
          : unbookedNights.length === nights.length
            ? "No accommodation booked yet"
            : `No accommodation for ${unbookedNights.length === 1 ? "the night of " : ""}${listDates(unbookedNights)}`,
      action: unbookedNights.length && !p.readOnly ? () => p.onOpenRes({ type: "lodging", startDate: unbookedNights[0] }) : undefined,
      actionLabel: "Add",
    },
    {
      ok: flightCount > 0,
      icon: <Plane />,
      text: flightCount ? `${flightCount} flight${flightCount > 1 ? "s" : ""} booked` : "No flights added",
      action: !flightCount && !p.readOnly ? () => p.onOpenRes({ type: "flight", startDate: meta.startDate }) : undefined,
      actionLabel: "Add",
    },
  ].filter(Boolean) as never;

  const nudges: { icon: ReactNode; text: ReactNode; onClick?: () => void }[] = [
    emptyDays.length > 0 && {
      icon: <CalendarX />,
      text: `${emptyDays.length === 1 ? "1 day has" : `${emptyDays.length} days have`} nothing planned: ${listDates(emptyDays.map((s) => s.date!))}`,
      onClick: () => p.onGo({ section: emptyDays[0].key }),
    },
    unscheduled > 0 && {
      icon: <Lightbulb />,
      text: `${unscheduled} saved place${unscheduled > 1 ? "s" : ""} not on a day yet`,
      onClick: () => p.onGo({ section: p.sections.find((s) => s.kind === "list" && places(s).length)!.key }),
    },
    ...conflicts.slice(0, 2).map((c) => ({
      icon: <AlertTriangle />,
      text: `${formatShort(c.day.date!)}: ${c.a.name} (until ${fmtTime(c.a.endTime)}) overlaps ${c.b.name} (${fmtTime(c.b.startTime)})`,
      onClick: () => p.onSelect(c.b.id),
    })),
    unpinned > 0 && { icon: <MapPinOff />, text: `${unpinned} stop${unpinned > 1 ? "s aren't" : " isn't"} on the map yet` },
  ].filter(Boolean) as never;

  const card = "rounded-xl border border-line bg-surface p-3";
  const label = "mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-muted uppercase [&>svg]:size-3.5";

  return (
    <section className="mx-2 mt-4" aria-label="Trip overview">
      <button onClick={toggle} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left">
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="font-display text-[19px]">Overview</span>
        <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[12px] font-semibold text-accent">{countdown}</span>
        {!open && (readiness.some((r) => !r.ok) || nudges.length > 0) && (
          <span className="ml-auto text-[12px] text-muted">
            {readiness.filter((r) => !r.ok).length + nudges.length} to look at
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
          {/* Now / next */}
          {phase === "during" && (
            <div className={`${card} sm:col-span-2`}>
              <p className={label}>
                <Clock /> {next ? "Next up" : "Today"}
              </p>
              {next ? (
                <button onClick={() => p.onSelect(next.id)} className="flex w-full items-center gap-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold">{next.name}</span>
                    <span className="block text-[13px] text-muted">
                      {[next.startTime && fmtTime(next.startTime), typeof nextLeg === "object" && nextLeg.duration ? `${formatDuration(nextLeg.duration)} to get there` : null].filter(Boolean).join(" · ") ||
                        "No time set"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] text-muted">{upcoming.length > 1 ? `+${upcoming.length - 1} more today` : ""}</span>
                </button>
              ) : (
                <p className="text-[14px] text-muted">{todaySec && places(todaySec).length ? "That's everything planned for today." : "Nothing planned today."}</p>
              )}
              {tonight && (
                <p className="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-[13px] text-muted">
                  <BedDouble className="size-3.5" /> Tonight: <span className="truncate text-fg">{tonight.title}</span>
                </p>
              )}
            </div>
          )}
          {phase === "before" && firstDay && (
            <button onClick={() => p.onGo({ section: firstDay.key })} className={`${card} text-left sm:col-span-2`}>
              <p className={label}>
                <Sparkles /> First day · {formatShort(firstDay.date!)}
              </p>
              <p className="truncate text-[14px]">
                {meta.subtitles?.[firstDay.key] ??
                  (places(firstDay).map((i) => i.name).join(" • ") ||
                    reservations
                      .filter((r) => r.startDate === firstDay.date)
                      .map((r) => `${r.title}${r.startTime ? ` ${fmtTime(r.startTime)}` : ""}`)
                      .filter((t, i, a) => a.indexOf(t) === i)
                      .join(" • ") || <span className="text-muted">Nothing planned yet</span>)}
              </p>
            </button>
          )}
          {phase === "after" && (
            <div className={`${card} sm:col-span-2`}>
              <p className={label}>
                <Sparkles /> Recap
              </p>
              <p className="text-[14px]">
                {days.length} days · {items.filter((i) => i.kind === "place").length} stops{p.spent > 0 ? ` · ${formatMoney(p.spent, currency)} spent` : ""}
              </p>
            </div>
          )}

          {/* Readiness */}
          {phase !== "after" && (
            <div className={card}>
              <p className={label}>
                <Check /> Readiness
              </p>
              <ul className="space-y-1.5 text-[13.5px]">
                {readiness.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 [&>svg]:size-4 ${r.ok ? "text-accent" : "text-amber-400"}`}>{r.ok ? <Check /> : r.icon}</span>
                    <span className={`min-w-0 flex-1 ${r.ok ? "text-muted" : ""}`}>{r.text}</span>
                    {r.action && (
                      <button onClick={r.action} className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold text-accent hover:bg-accent/10">
                        {r.actionLabel}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Budget (after the trip only if there was one to compare with; the recap has the total) */}
          {(phase !== "after" || !!budget) && (
          <button onClick={() => p.onGo("budget")} className={`${card} text-left`}>
            <p className={label}>
              <Wallet /> Budget
            </p>
            {budget ? (
              <>
                <p className="text-[14px]">
                  <span className="font-bold tabular-nums">{formatMoney(p.spent, currency)}</span>
                  <span className="text-muted"> of {formatMoney(budget, currency)}</span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={`h-full rounded-full ${trendingOver ? "bg-amber-400" : "bg-accent"}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
                </div>
                <p className={`mt-1.5 text-[12px] ${trendingOver ? "text-amber-400" : "text-muted"}`}>
                  {pct > 1
                    ? `${formatMoney(p.spent - budget, currency)} over budget`
                    : trendingOver
                      ? "Spending ahead of pace for this point in the trip"
                      : `${formatMoney(budget - p.spent, currency)} left`}
                </p>
              </>
            ) : (
              <p className="text-[14px]">
                <span className="font-bold tabular-nums">{formatMoney(p.spent, currency)}</span>
                <span className="text-muted"> spent · set a budget</span>
              </p>
            )}
          </button>
          )}

          {/* Key bookings */}
          {keyBookings.length > 0 && phase !== "after" && (
            <div className={`${card} sm:col-span-2`}>
              <div className="flex items-center justify-between">
                <p className={label}>{phase === "after" ? "Bookings" : "Coming up"}</p>
                <button onClick={() => p.onGo("bookings")} className="-mt-2 text-[12px] font-semibold text-muted hover:text-fg">
                  All reservations →
                </button>
              </div>
              <ul className="divide-y divide-line">
                {keyBookings.map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5 py-1.5 text-[13.5px]">
                    <span className="shrink-0 text-muted [&>svg]:size-4">{RES_ICON[r.type]}</span>
                    <button onClick={() => p.onOpenRes(r)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate">{r.title}</span>
                      <span className="block text-[12px] text-muted">
                        {r.startDate && formatShort(r.startDate)}
                        {r.startTime ? ` · ${fmtTime(r.startTime)}` : ""}
                        {r.type === "lodging" && r.endDate ? ` → ${formatShort(r.endDate)}` : ""}
                      </span>
                    </button>
                    {r.confirmation && <CopyCode code={r.confirmation} />}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Gaps and nudges */}
          {nudges.length > 0 && phase !== "after" && (
            <div className={`${card} sm:col-span-2`}>
              <p className={label}>
                <Lightbulb /> Worth a look
              </p>
              <ul className="space-y-1">
                {nudges.map((n, i) => (
                  <li key={i}>
                    <button
                      onClick={n.onClick}
                      disabled={!n.onClick}
                      className="flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left text-[13.5px] enabled:hover:bg-surface-2"
                    >
                      <span className="mt-0.5 shrink-0 text-muted [&>svg]:size-4">{n.icon}</span>
                      <span className="min-w-0 flex-1">{n.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** "Nov 30, Dec 2 and Dec 5" (first four, then "+N more"). */
function listDates(ds: string[]) {
  const f = ds.slice(0, 4).map(formatShort);
  const more = ds.length > 4 ? ` +${ds.length - 4} more` : "";
  return f.length > 1 ? `${f.slice(0, -1).join(", ")} and ${f.at(-1)}${more}` : `${f[0]}${more}`;
}

function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(code).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      title="Copy confirmation number"
      className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[12px] text-muted hover:text-fg"
    >
      {code}
      {done ? <Check className="size-3 text-accent" /> : <Copy className="size-3" />}
    </button>
  );
}
