// PROTOTYPE (proto/trip-focus): variant B's trip banner, across the top of the rail and the plan pane: his cover
// photo with the trip's name and dates, plus everything that acts on the whole trip. Full height on the area
// pages; a slim strip of the same photo once you're inside a day or list.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Cloud, CloudOff, History as HistoryIcon, ImagePlus, Loader2, Redo2, Settings as SettingsIcon, Share2, SlidersHorizontal, Undo2 } from "lucide-react";
import type * as Y from "yjs";
import { updateMeta, type TripMeta } from "../../../lib/trips";
import type { SyncStatus } from "../../../lib/sync";
import { DateRangeField } from "../../DatePicker";
import { HeroPill } from "../../HeroPill";
import { Photo } from "../../Photo";
import { PhotoCredit } from "../../PhotoCredit";
import { modKey } from "../UndoBars";
import type { UndoHistory } from "../types";

// Same look as his HeroPill, for the buttons that need a disabled state
const pill =
  "grid size-9 shrink-0 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition-colors hover:bg-black/55 disabled:opacity-40 disabled:hover:bg-black/35 [&>svg]:size-4";

export function TripBar(p: {
  doc: Y.Doc;
  meta: TripMeta;
  countdown: string;
  readOnly: boolean;
  history: UndoHistory;
  canSync: boolean;
  syncStatus: SyncStatus;
  isOwner: boolean;
  /** Inside a day or list: a slim strip instead of the full banner */
  compact: boolean;
  onShare: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onPickCover: () => void;
  /** Trip-wide defaults: travel mode, photos, offline map, forwarded bookings */
  defaults: ReactNode;
}) {
  const { meta, compact } = p;
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

  const syncIcon = p.syncStatus === "online" ? <Cloud /> : p.syncStatus === "offline" ? <CloudOff /> : <Loader2 className="animate-spin" />;
  const actions = (
    <div className="flex shrink-0 items-center gap-1.5">
      {!p.readOnly && (
        <>
          <button className={pill} onClick={p.history.undo} disabled={!p.history.canUndo} title={`Undo (${mod}Z)`} aria-label="Undo">
            <Undo2 />
          </button>
          <button className={pill} onClick={p.history.redo} disabled={!p.history.canRedo} title={`Redo (${mod}⇧Z)`} aria-label="Redo">
            <Redo2 />
          </button>
          <span className="mx-0.5 h-5 w-px bg-white/30" />
        </>
      )}
      {p.canSync && (
        <HeroPill icon={syncIcon} label={p.syncStatus === "online" ? "Synced" : p.syncStatus === "offline" ? "Offline · saved on device" : "Connecting"} className={p.syncStatus === "online" ? "text-accent" : ""} />
      )}
      {p.isOwner && <HeroPill icon={<Share2 />} label="Share" onClick={p.onShare} />}
      <HeroPill icon={<HistoryIcon />} label="History" onClick={p.onHistory} />
      <div ref={box} className="relative">
        <HeroPill icon={<SlidersHorizontal />} label="Trip defaults" onClick={() => setOpen((o) => !o)} className={open ? "bg-black/55" : ""} />
        {open && (
          <div className="absolute top-full right-0 z-50 mt-2 w-[440px] rounded-2xl border border-line bg-bg p-3 text-fg shadow-2xl">
            <p className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted/80 uppercase">Trip defaults</p>
            {p.defaults}
          </div>
        )}
      </div>
      <HeroPill icon={<SettingsIcon />} label="Settings" onClick={p.onSettings} />
    </div>
  );
  const dates = (
    <div className="flex flex-wrap items-center gap-1.5 text-white/90">
      <DateRangeField
        disabled={p.readOnly}
        start={meta.startDate}
        end={meta.endDate}
        onChange={(startDate, endDate) => updateMeta(p.doc, { startDate, endDate })}
        className={`rounded-full bg-black/35 font-semibold backdrop-blur transition-colors hover:bg-black/55 disabled:hover:bg-black/35 ${compact ? "px-2.5 py-1 text-[12.5px]" : "px-3.5 py-1.5 text-[14px]"}`}
      />
      <span className={`rounded-full bg-accent font-semibold text-on-accent ${compact ? "px-2 py-0.5 text-[11.5px]" : "px-2.5 py-1 text-[12.5px]"}`}>{p.countdown}</span>
    </div>
  );
  const title = (
    <input
      disabled={p.readOnly}
      key={meta.title}
      defaultValue={meta.title}
      onBlur={(e) => e.target.value.trim() && e.target.value !== meta.title && updateMeta(p.doc, { title: e.target.value.trim() })}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`w-full min-w-0 truncate bg-transparent font-display leading-tight text-white outline-none [text-shadow:0_1px_12px_rgb(0_0_0/.5)] ${compact ? "text-[21px]" : "text-[2.25rem]"}`}
    />
  );

  return (
    <header className={`relative z-20 shrink-0 text-white transition-[height] duration-300 ease-out ${compact ? "h-[72px]" : "h-[200px]"}`}>
      {/* His cover photo (or his gradient when there's none), darkened top and bottom for the text */}
      <div className="absolute inset-0 overflow-hidden bg-surface-2">
        {meta.cover ? (
          <Photo srcs={[meta.cover.url, meta.cover.thumb]} className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_10%,rgb(95_214_139/.35),transparent_60%),radial-gradient(90%_80%_at_90%_30%,rgb(106_168_255/.3),transparent_60%)]" />
        )}
        <div className={`absolute inset-0 ${compact ? "bg-black/50" : "bg-gradient-to-b from-black/55 via-black/10 to-black/80"}`} />
        {meta.cover && !compact && (
          <PhotoCredit img={meta.cover} className="absolute right-2 bottom-0.5 max-w-[50%] truncate text-right text-[10px] leading-tight text-white/70 [text-shadow:0_1px_3px_rgb(0_0_0/.7)]" />
        )}
      </div>
      {/* The left cell is the rail's width, so "Trips" sits in the rail's column; the text lines up with the pane's content */}
      <div className="relative flex h-full">
        <div className={`flex w-[76px] shrink-0 justify-center ${compact ? "items-center" : "pt-3"}`}>
          <Link to="/" title="All trips" className="flex w-[60px] flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold text-white/85 hover:bg-black/30 hover:text-white">
            <ArrowLeft className="size-5" /> Trips
          </Link>
        </div>
        {compact ? (
          <div className="flex min-w-0 flex-1 items-center gap-3 pr-3 pl-6">
            <div className="min-w-0 flex-1">{title}</div>
            {dates}
            {actions}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col pt-3 pr-3 pb-4 pl-6">
            <div className="flex justify-end">{actions}</div>
            <div className="mt-auto flex items-end gap-3">
              <div className="min-w-0 flex-1">
                {title}
                <div className="mt-2">{dates}</div>
              </div>
              {!p.readOnly && <HeroPill icon={<ImagePlus />} label="Change cover" onClick={p.onPickCover} />}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
