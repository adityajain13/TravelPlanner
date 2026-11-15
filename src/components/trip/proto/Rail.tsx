// PROTOTYPE (proto/trip-focus): variant B's thin rail. Anchors the page in the corner and holds the
// trip's areas in funnel order (ideas → itinerary → prep → bookings → budget), plus undo and the trip's buttons.
import { Link } from "react-router-dom";
import { CalendarDays, Cloud, CloudOff, History as HistoryIcon, Lightbulb, ListChecks, Loader2, PiggyBank, Redo2, Settings as SettingsIcon, Share2, Ticket, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark } from "../../Logo";
import { modKey } from "../UndoBars";
import type { UndoHistory } from "../types";
import type { SyncStatus } from "../../../lib/sync";

export type Area = "ideas" | "itinerary" | "prep" | "bookings" | "budget";
export const AREA_LABEL: Record<Area, string> = { ideas: "Ideas", itinerary: "Itinerary", prep: "Prep", bookings: "Bookings", budget: "Budget" };
const AREA_ICON: Record<Area, ReactNode> = { ideas: <Lightbulb />, itinerary: <CalendarDays />, prep: <ListChecks />, bookings: <Ticket />, budget: <PiggyBank /> };
const ORDER: Area[] = ["ideas", "itinerary", "prep", "bookings", "budget"];

const small = "grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent [&>svg]:size-[18px]";

export function Rail(p: {
  area: Area;
  onArea: (a: Area) => void;
  /** Small count per area (ideas not on a day, bookings…) */
  counts: Partial<Record<Area, number>>;
  history: UndoHistory;
  readOnly: boolean;
  canSync: boolean;
  syncStatus: SyncStatus;
  isOwner: boolean;
  onShare: () => void;
  onHistory: () => void;
  onSettings: () => void;
}) {
  const mod = modKey();
  return (
    <nav aria-label="Trip" className="hidden w-[76px] shrink-0 flex-col items-center border-r border-line bg-bg py-3 md:flex">
      <Link to="/" title="All trips" className="mb-3">
        <LogoMark size={30} />
      </Link>
      <div className="flex w-full flex-col gap-1 px-2">
        {ORDER.map((a) => {
          const on = p.area === a;
          const n = p.counts[a];
          return (
            <button
              key={a}
              onClick={() => p.onArea(a)}
              aria-current={on || undefined}
              className={`relative flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition-colors [&>svg]:size-5 ${
                on ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2/60 hover:text-fg"
              }`}
            >
              {AREA_ICON[a]}
              {AREA_LABEL[a]}
              {!!n && <span className="absolute top-1 right-2 min-w-4 rounded-full bg-amber-400 px-1 text-[9.5px] leading-4 font-bold text-black tabular-nums">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-auto flex flex-col items-center gap-0.5">
        {!p.readOnly && (
          <>
            <button className={small} onClick={p.history.undo} disabled={!p.history.canUndo} title={`Undo (${mod}Z)`} aria-label="Undo">
              <Undo2 />
            </button>
            <button className={small} onClick={p.history.redo} disabled={!p.history.canRedo} title={`Redo (${mod}⇧Z)`} aria-label="Redo">
              <Redo2 />
            </button>
            <span className="my-1.5 h-px w-6 bg-line" />
          </>
        )}
        {p.isOwner && (
          <button className={small} onClick={p.onShare} title="Share" aria-label="Share">
            <Share2 />
          </button>
        )}
        <button className={small} onClick={p.onHistory} title="History" aria-label="History">
          <HistoryIcon />
        </button>
        <button className={small} onClick={p.onSettings} title="Settings" aria-label="Settings">
          <SettingsIcon />
        </button>
        {p.canSync && (
          <span className={small} title={p.syncStatus === "online" ? "Synced" : p.syncStatus === "offline" ? "Offline · saved on device" : "Connecting"}>
            {p.syncStatus === "online" ? <Cloud className="text-accent" /> : p.syncStatus === "offline" ? <CloudOff /> : <Loader2 className="animate-spin" />}
          </span>
        )}
      </div>
    </nav>
  );
}
