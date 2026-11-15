// PROTOTYPE (proto/trip-focus): variant B's Itinerary and Prep areas (the rail picks the area). Itinerary:
// compact trip header, overview, one row per day. Prep: notes and checklists. A row drills in.
import { ChevronRight, ImagePlus, LayoutDashboard, ListChecks, Ticket } from "lucide-react";
import type { ReactNode } from "react";
import type * as Y from "yjs";
import type { SectionInfo } from "../../Section";
import { updateMeta, type TripState } from "../../../lib/trips";
import { DateRangeField } from "../../DatePicker";
import { Photo } from "../../Photo";
import { OfflineMapButton } from "../../OfflineMapButton";
import { dtf } from "../../../lib/intl";
import { parseISODate } from "../../../lib/dates";
import { inkOn } from "../../../lib/colors";
import { isPrep, placesIn } from "./kinds";
import type { Scope } from "./ScopeNav";

export function TripLevel({
  area,
  doc,
  state,
  tripId,
  readOnly,
  sections,
  today,
  countdown,
  attention,
  bookingsByDay,
  onPick,
  onOverview,
  onPickCover,
  tools,
}: {
  area: "itinerary" | "prep";
  doc: Y.Doc;
  state: TripState;
  tripId: string;
  readOnly: boolean;
  sections: SectionInfo[];
  today: string;
  countdown: string;
  attention: number;
  bookingsByDay: Map<string, number>;
  onPick: (s: Scope) => void;
  onOverview: () => void;
  onPickCover: () => void;
  /** Travel mode, photos, forwarded bookings */
  tools: ReactNode;
}) {
  const { meta } = state;
  const days = sections.filter((s) => s.kind === "day");
  const prep = sections.filter((s) => s.kind === "list" && isPrep(s));
  const heading = (t: string, aside?: string) => (
    <div className="mt-7 mb-2 flex items-baseline px-2">
      <h2 className="font-display text-[20px]">{t}</h2>
      {aside && <span className="ml-auto text-[12.5px] text-muted">{aside}</span>}
    </div>
  );
  const row = (key: string, onClick: () => void, children: ReactNode, aside?: ReactNode) => (
    <button key={key} onClick={onClick} className="group flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-surface-2/70">
      {children}
      <span className="ml-auto flex shrink-0 items-center gap-2 text-[12.5px] text-muted tabular-nums">
        {aside}
        <ChevronRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
    </button>
  );

  if (area === "prep")
    return (
      <div className="px-4 pt-6 pb-10">
        <h1 className="px-2 font-display text-[28px] leading-tight">Prep</h1>
        <p className="mt-1 mb-4 px-2 text-[14px] text-muted">Notes and checklists for before you go</p>
        {!prep.length && <p className="px-2 text-[14px] text-muted">No notes or checklists yet.</p>}
        {prep.map((s) =>
          row(
            s.key,
            () => onPick({ tab: "plan", key: s.key }),
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
                <ListChecks className="size-[18px]" />
              </span>
              <span className="truncate font-semibold">{s.title}</span>
            </>,
            s.items.length > 0 && <span>{s.items.length}</span>,
          ),
        )}
      </div>
    );

  return (
    <div className="px-4 pt-5 pb-10">
      {/* Compact trip header: small cover, title, dates */}
      <header className="flex items-center gap-4 px-2">
        <button
          onClick={readOnly ? undefined : onPickCover}
          title={readOnly ? undefined : "Change cover"}
          className="group relative size-[72px] shrink-0 overflow-hidden rounded-2xl bg-surface-2"
        >
          {meta.cover ? <Photo srcs={[meta.cover.thumb, meta.cover.url]} className="size-full object-cover" /> : <ImagePlus className="m-auto size-5 text-muted" />}
        </button>
        <div className="min-w-0 flex-1">
          <input
            disabled={readOnly}
            key={meta.title}
            defaultValue={meta.title}
            onBlur={(e) => e.target.value.trim() && e.target.value !== meta.title && updateMeta(doc, { title: e.target.value.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-full bg-transparent font-display text-[28px] leading-tight outline-none"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-muted">
            <DateRangeField
              disabled={readOnly}
              start={meta.startDate}
              end={meta.endDate}
              onChange={(startDate, endDate) => updateMeta(doc, { startDate, endDate })}
              className="rounded-full px-0 py-0.5 font-semibold text-fg hover:text-accent"
            />
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[12px] font-semibold text-accent">{countdown}</span>
          </div>
        </div>
      </header>

      <button onClick={onOverview} className="mt-5 flex w-full items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left hover:border-accent">
        <LayoutDashboard className="size-5 shrink-0 text-accent" />
        <span className="font-semibold">Overview</span>
        <span className="ml-auto flex items-center gap-1 text-[12.5px] text-muted">
          {attention > 0 ? `${attention} to look at` : "All set"}
          <ChevronRight className="size-4" />
        </span>
      </button>

      {days.length > 0 && heading("Days", `${days.length} days`)}
      {days.map((s) => {
        const d = parseISODate(s.date!);
        const stops = placesIn(s);
        const bookings = bookingsByDay.get(s.date!) ?? 0;
        return row(
          s.key,
          () => onPick({ tab: "plan", key: s.key }),
          <>
            <span className="flex w-10 shrink-0 flex-col items-center">
              <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">{dtf(undefined, { weekday: "short", timeZone: "UTC" }).format(d)}</span>
              <span className="mt-0.5 grid size-8 place-items-center rounded-full text-[14px] font-bold tabular-nums" style={s.date === today ? { background: s.color, color: inkOn(s.color) } : { boxShadow: `inset 0 0 0 2px ${s.color}` }}>
                {d.getUTCDate()}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {meta.subtitles?.[s.key] || `Day ${s.dayNumber}`}
                {s.date === today && <span className="ml-2 rounded-full bg-accent px-1.5 py-px align-middle text-[10px] font-bold text-on-accent uppercase">Today</span>}
              </span>
              <span className="block truncate text-[13px] text-muted">{stops.length ? stops.map((i) => i.name).join(" · ") : "Nothing planned yet"}</span>
            </span>
          </>,
          <>
            {bookings > 0 && (
              <span className="flex items-center gap-1" title={`${bookings} bookings`}>
                <Ticket className="size-3.5" /> {bookings}
              </span>
            )}
            {stops.length > 0 && <span>{stops.length} stops</span>}
          </>,
        );
      })}

      <div className="mt-8 border-t border-line pt-4">
        <div className="mb-2 flex items-center px-2">
          <span className="text-[11px] font-semibold tracking-wider text-muted/80 uppercase">Tools</span>
          <span className="ml-auto">
            <OfflineMapButton tripId={tripId} state={state} />
          </span>
        </div>
        {tools}
      </div>
    </div>
  );
}
