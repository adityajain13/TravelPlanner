import { dtf } from "../lib/intl";
import { useEffect, useState, type RefObject } from "react";
import { CalendarDays, ChevronDown, ChevronsLeft, ChevronsRight, PiggyBank, Ticket, X } from "lucide-react";
import type { Reservation, ReservationType } from "../lib/trips";
import type { SectionInfo } from "./Section";
import { RES_ICON, RES_LABEL } from "./Reservations";
import { parseISODate } from "../lib/dates";
import { formatMoney } from "../lib/fx";

export type Tab = "plan" | "bookings" | "budget";

const dayLabel = (d: string) =>
  dtf(undefined, { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" }).format(parseISODate(d));

const RES_ORDER: ReservationType[] = ["flight", "lodging", "car", "train", "restaurant", "other"];

interface Props {
  sections: SectionInfo[];
  reservations: Reservation[];
  tab: Tab;
  budgetTotal?: { amount: number; currency: string };
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Switch tab, then scroll the plan panel to an element id (or the top). */
  go: (tab: Tab, targetId?: string) => void;
  /** Desktop: collapse to a thin rail. Drawer: close. */
  onHide: () => void;
  variant: "column" | "drawer";
  /** Shown above the contents (undo / redo). */
  header?: React.ReactNode;
  /** Day/list subheadings ("Osaka"), keyed by section key. */
  subtitles?: Record<string, string>;
}

/** Wanderlog-style table of contents: overview (lists + bookings), every day with its stops, budget. */
export function Contents(p: Props) {
  const [open, setOpen] = useState({ overview: true, itinerary: true, budget: true });
  const active = useScrollSpy(p.scrollRef, p.tab);
  const lists = p.sections.filter((s) => s.kind === "list");
  const days = p.sections.filter((s) => s.kind === "day");
  const resTypes = RES_ORDER.filter((t) => p.reservations.some((r) => r.type === t));

  const row = (id: string, tab: Tab, label: React.ReactNode, sub?: string, icon?: React.ReactNode, count?: number) => {
    const isActive = p.tab === tab && active === id;
    return (
      <button
        key={id}
        onClick={() => p.go(tab, id)}
        className={`group flex w-full items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-colors ${
          isActive ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg"
        }`}
      >
        {icon && <span className="mt-1 shrink-0 [&>svg]:size-4">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[17px] ${isActive ? "font-semibold" : ""}`}>{label}</span>
          {sub && <span className="mt-0.5 block truncate text-[13px] text-muted/80">{sub}</span>}
        </span>
        {count != null && <span className="mt-1 text-[13px] text-muted tabular-nums">{count}</span>}
      </button>
    );
  };

  const group = (key: keyof typeof open, title: string, children: React.ReactNode) => (
    <div className="mb-5">
      <button
        onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 font-display text-[20px] text-fg hover:bg-surface-2/50"
      >
        <ChevronDown className={`size-4 text-muted transition-transform ${open[key] ? "" : "-rotate-90"}`} />
        {title}
      </button>
      {open[key] && <div className="mt-1 space-y-1 pl-2">{children}</div>}
    </div>
  );

  return (
    <nav className="flex h-full flex-col" aria-label="Trip contents">
      {p.header}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-5 pb-4 [scrollbar-width:thin]">
        {group(
          "overview",
          "Overview",
          <>
            {lists.map((s) => row(`sec-${s.key}`, "plan", s.title, undefined, undefined, s.items.filter((i) => i.kind === "place").length || undefined))}
            {resTypes.length === 0
              ? row("res-top", "bookings", "Reservations")
              : resTypes.map((t) => row(`res-${t}`, "bookings", RES_LABEL[t], undefined, RES_ICON[t], p.reservations.filter((r) => r.type === t).length))}
          </>,
        )}
        {days.length > 0 &&
          group(
            "itinerary",
            "Itinerary",
            days.map((s) =>
              row(
                `sec-${s.key}`,
                "plan",
                <>
                  <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: s.color }} />
                  {dayLabel(s.date!)}
                </>,
                // The day's subheading ("Land in Osaka") when it has one, else its stops
                p.subtitles?.[s.key] ||
                  s.items
                    .filter((i) => i.kind === "place")
                    .map((i) => i.name)
                    .join(" • ") ||
                  undefined,
              ),
            ),
          )}
        {group(
          "budget",
          "Budget",
          row("budget-top", "budget", p.budgetTotal ? formatMoney(p.budgetTotal.amount, p.budgetTotal.currency) : "View", p.budgetTotal ? "Spent so far" : undefined, <PiggyBank />),
        )}
      </div>
      <button onClick={p.onHide} className="flex items-center gap-3 border-t border-line px-6 py-4 text-[16px] text-muted hover:text-fg">
        {p.variant === "drawer" ? <X className="size-5" /> : <ChevronsLeft className="size-5" />}
        {p.variant === "drawer" ? "Close" : "Hide sidebar"}
      </button>
    </nav>
  );
}

/**
 * Thin contents column (Settings → Contents column: Thin): the three tabs as icon buttons,
 * then one dot per day (day-of-month, in the day's colour) that jumps to that day.
 */
export function ContentsThin(p: Omit<Props, "variant" | "subtitles">) {
  const active = useScrollSpy(p.scrollRef, p.tab);
  const days = p.sections.filter((s) => s.kind === "day");
  const tabBtn = (tab: Tab, label: string, icon: React.ReactNode, targetId?: string) => {
    const on = p.tab === tab;
    return (
      <button
        key={tab}
        onClick={() => p.go(tab, targetId)}
        title={label}
        className={`flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition-colors [&>svg]:size-5 ${
          on ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2/60 hover:text-fg"
        }`}
      >
        {icon}
        {label}
      </button>
    );
  };
  return (
    <nav className="flex h-full w-[76px] flex-col items-center" aria-label="Trip contents">
      {p.header}
      <div className="flex w-full flex-col gap-1 px-2 pt-3">
        {tabBtn("plan", "Plan", <CalendarDays />)}
        {tabBtn("bookings", "Bookings", <Ticket />)}
        {tabBtn("budget", "Budget", <PiggyBank />, "budget-top")}
      </div>
      {days.length > 0 && <div className="mx-auto my-3 h-px w-8 bg-line" />}
      {/* Days: scrolls on its own when the trip is long */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 pb-3 [scrollbar-width:none]">
        {days.map((s) => {
          const id = `sec-${s.key}`;
          const on = p.tab === "plan" && active === id;
          const d = parseISODate(s.date!);
          return (
            <button
              key={s.key}
              onClick={() => p.go("plan", id)}
              title={`${dayLabel(s.date!)}${s.items.length ? ` · ${s.items.filter((i) => i.kind === "place").map((i) => i.name).join(" • ")}` : ""}`}
              className={`flex w-full shrink-0 flex-col items-center rounded-xl py-1.5 transition-colors ${on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg"}`}
            >
              <span className="text-[10px] font-semibold tracking-wide uppercase">{dtf(undefined, { weekday: "short", timeZone: "UTC" }).format(d)}</span>
              <span
                className={`mt-0.5 grid size-8 place-items-center rounded-full text-[14px] font-bold tabular-nums ${on ? "text-on-accent" : "text-fg"}`}
                style={on ? { background: s.color } : { boxShadow: `inset 0 0 0 2px ${s.color}` }}
              >
                {d.getUTCDate()}
              </span>
            </button>
          );
        })}
      </div>
      <button onClick={p.onHide} title="Hide sidebar" aria-label="Hide sidebar" className="grid h-14 w-full shrink-0 place-items-center border-t border-line text-muted hover:text-fg">
        <ChevronsLeft className="size-5" />
      </button>
    </nav>
  );
}

/** Thin rail shown when the contents column is hidden. */
export function ContentsRail({ onShow }: { onShow: () => void }) {
  return (
    <button onClick={onShow} title="Show contents" className="flex h-full w-9 items-start justify-center border-r border-line pt-4 text-muted hover:bg-surface hover:text-fg">
      <ChevronsRight className="size-4" />
    </button>
  );
}

/** Id of the last section/booking group whose top has scrolled past the top of the plan panel. */
function useScrollSpy(ref: RefObject<HTMLDivElement | null>, tab: Tab) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const top = el.getBoundingClientRect().top + 140;
      let cur: string | null = null;
      for (const t of el.querySelectorAll<HTMLElement>("[id^='sec-'], [id^='res-']")) {
        if (t.getBoundingClientRect().top <= top) cur = t.id;
        else break;
      }
      setActive(cur ?? (tab === "budget" ? "budget-top" : null));
    };
    const onScroll = () => (raf ||= requestAnimationFrame(update));
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => (el.removeEventListener("scroll", onScroll), cancelAnimationFrame(raf));
  }, [ref, tab]);
  return active;
}
