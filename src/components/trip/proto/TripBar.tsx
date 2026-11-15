// PROTOTYPE (proto/trip-focus): variant B's trip bar, across the top of the rail and the plan pane. The trip's
// identity and everything that acts on the whole trip live here, so the rail below reads as this trip's sections.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Cloud, CloudOff, History as HistoryIcon, ImagePlus, Loader2, Redo2, Settings as SettingsIcon, Share2, SlidersHorizontal, Undo2 } from "lucide-react";
import type * as Y from "yjs";
import { updateMeta, type TripMeta } from "../../../lib/trips";
import type { SyncStatus } from "../../../lib/sync";
import { DateRangeField } from "../../DatePicker";
import { Photo } from "../../Photo";
import { modKey } from "../UndoBars";
import type { UndoHistory } from "../types";

const btn = "grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent [&>svg]:size-[18px]";

export function TripBar(p: {
  doc: Y.Doc;
  meta: TripMeta;
  countdown: string;
  readOnly: boolean;
  history: UndoHistory;
  canSync: boolean;
  syncStatus: SyncStatus;
  isOwner: boolean;
  onShare: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onPickCover: () => void;
  /** Trip-wide defaults: travel mode, photos, offline map, forwarded bookings */
  defaults: ReactNode;
}) {
  const { meta } = p;
  const mod = modKey();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", off);
    window.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", off), window.removeEventListener("keydown", esc));
  }, [open]);

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line bg-bg px-3 py-2.5">
      <Link to="/" title="All trips" className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
        <ArrowLeft className="size-4" /> Trips
      </Link>
      <span className="h-6 w-px shrink-0 bg-line" />
      <button
        onClick={p.readOnly ? undefined : p.onPickCover}
        title={p.readOnly ? undefined : "Change cover"}
        className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2"
      >
        {meta.cover ? <Photo srcs={[meta.cover.thumb, meta.cover.url]} className="size-full object-cover" /> : <ImagePlus className="size-4 text-muted" />}
      </button>
      <div className="min-w-0 flex-1">
        <input
          disabled={p.readOnly}
          key={meta.title}
          defaultValue={meta.title}
          onBlur={(e) => e.target.value.trim() && e.target.value !== meta.title && updateMeta(p.doc, { title: e.target.value.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-full truncate bg-transparent font-display text-[20px] leading-tight outline-none"
        />
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <DateRangeField
            disabled={p.readOnly}
            start={meta.startDate}
            end={meta.endDate}
            onChange={(startDate, endDate) => updateMeta(p.doc, { startDate, endDate })}
            className="font-semibold text-fg/80 hover:text-accent [&_svg]:hidden"
          />
          <span className="truncate font-semibold text-accent">{p.countdown}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {!p.readOnly && (
          <>
            <button className={btn} onClick={p.history.undo} disabled={!p.history.canUndo} title={`Undo (${mod}Z)`} aria-label="Undo">
              <Undo2 />
            </button>
            <button className={btn} onClick={p.history.redo} disabled={!p.history.canRedo} title={`Redo (${mod}⇧Z)`} aria-label="Redo">
              <Redo2 />
            </button>
            <span className="mx-1 h-6 w-px bg-line" />
          </>
        )}
        {p.canSync && (
          <span className={btn} title={p.syncStatus === "online" ? "Synced" : p.syncStatus === "offline" ? "Offline · saved on device" : "Connecting"}>
            {p.syncStatus === "online" ? <Cloud className="text-accent" /> : p.syncStatus === "offline" ? <CloudOff /> : <Loader2 className="animate-spin" />}
          </span>
        )}
        {p.isOwner && (
          <button className={btn} onClick={p.onShare} title="Share" aria-label="Share">
            <Share2 />
          </button>
        )}
        <button className={btn} onClick={p.onHistory} title="History" aria-label="History">
          <HistoryIcon />
        </button>
        <div ref={box} className="relative">
          <button className={`${btn} ${open ? "bg-surface-2 text-fg" : ""}`} onClick={() => setOpen((o) => !o)} title="Trip defaults" aria-label="Trip defaults" aria-expanded={open}>
            <SlidersHorizontal />
          </button>
          {open && (
            <div className="absolute top-full right-0 z-50 mt-2 w-[440px] rounded-2xl border border-line bg-bg p-3 shadow-2xl">
              <p className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted/80 uppercase">Trip defaults</p>
              {p.defaults}
            </div>
          )}
        </div>
        <button className={btn} onClick={p.onSettings} title="Settings" aria-label="Settings">
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
