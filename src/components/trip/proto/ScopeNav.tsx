// PROTOTYPE (proto/trip-focus): variant A's sidebar. Instead of a table of contents that scrolls the
// plan, each row picks what the plan and the map show: the whole trip, one day, one list, bookings or budget.
import { ChevronsLeft, LayoutDashboard, Map as MapIcon, PiggyBank, Ticket } from "lucide-react";
import type { ReactNode } from "react";
import type { Reservation } from "../../../lib/trips";
import type { SectionInfo } from "../../Section";
import type { Tab } from "../../Contents";
import { dtf } from "../../../lib/intl";
import { parseISODate } from "../../../lib/dates";
import { formatMoney } from "../../../lib/fx";

const dayLabel = (d: string) => dtf(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(parseISODate(d));

export type Scope = { tab: "plan"; key: string | null } | { tab: Exclude<Tab, "plan"> };

export function ScopeNav({
  sections,
  reservations,
  tab,
  focus,
  today,
  subtitles,
  budgetTotal,
  header,
  onPick,
  onOverview,
  onHide,
}: {
  sections: SectionInfo[];
  reservations: Reservation[];
  tab: Tab;
  focus: string | null;
  today: string;
  subtitles?: Record<string, string>;
  budgetTotal?: { amount: number; currency: string };
  header?: ReactNode;
  onPick: (s: Scope) => void;
  onOverview: () => void;
  onHide: () => void;
}) {
  const days = sections.filter((s) => s.kind === "day");
  const lists = sections.filter((s) => s.kind === "list");
  const places = (s: SectionInfo) => s.items.filter((i) => i.kind === "place" && !i.waypoint);

  const row = (key: string, on: boolean, onClick: () => void, label: ReactNode, opts: { sub?: string; icon?: ReactNode; aside?: ReactNode } = {}) => (
    <button
      key={key}
      onClick={onClick}
      aria-current={on || undefined}
      className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg"}`}
    >
      {opts.icon && <span className="mt-0.5 shrink-0 [&>svg]:size-4">{opts.icon}</span>}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] ${on ? "font-semibold" : ""}`}>{label}</span>
        {opts.sub && <span className="mt-0.5 block truncate text-[12.5px] text-muted/80">{opts.sub}</span>}
      </span>
      {opts.aside != null && <span className="mt-0.5 shrink-0 text-[12.5px] text-muted tabular-nums">{opts.aside}</span>}
    </button>
  );
  const heading = (t: string) => <p className="mt-5 mb-1 px-3 text-[11px] font-semibold tracking-wider text-muted/80 uppercase">{t}</p>;

  return (
    <nav className="flex h-full flex-col" aria-label="Trip">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-4 [scrollbar-width:thin]">
        {row("all", tab === "plan" && !focus, () => onPick({ tab: "plan", key: null }), "Whole trip", { icon: <MapIcon />, sub: "Every day and list at once" })}
        {row("overview", false, onOverview, "Overview", { icon: <LayoutDashboard /> })}

        {days.length > 0 && heading("Days")}
        {days.map((s) =>
          row(
            s.key,
            tab === "plan" && focus === s.key,
            () => onPick({ tab: "plan", key: s.key }),
            <>
              <span className="mr-2 inline-block size-2 rounded-full align-middle" style={{ background: s.color }} />
              {dayLabel(s.date!)}
              {s.date === today && <span className="ml-2 rounded-full bg-accent px-1.5 py-px align-middle text-[10px] font-bold text-on-accent uppercase">Today</span>}
            </>,
            {
              sub:
                subtitles?.[s.key] ||
                places(s)
                  .map((i) => i.name)
                  .join(" · ") ||
                "Nothing planned",
            },
          ),
        )}

        {lists.length > 0 && heading("Lists")}
        {lists.map((s) => row(s.key, tab === "plan" && focus === s.key, () => onPick({ tab: "plan", key: s.key }), s.title ?? "List", { aside: places(s).length || s.items.length || undefined }))}

        {heading("Trip")}
        {row("bookings", tab === "bookings", () => onPick({ tab: "bookings" }), "Bookings", { icon: <Ticket />, aside: reservations.length || undefined })}
        {row("budget", tab === "budget", () => onPick({ tab: "budget" }), "Budget", {
          icon: <PiggyBank />,
          aside: budgetTotal ? formatMoney(budgetTotal.amount, budgetTotal.currency) : undefined,
        })}
      </div>
      <button onClick={onHide} className="flex items-center gap-3 border-t border-line px-6 py-3.5 text-[15px] text-muted hover:text-fg">
        <ChevronsLeft className="size-5" /> Hide sidebar
      </button>
    </nav>
  );
}
