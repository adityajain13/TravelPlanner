import type { RefObject } from "react";
import type * as Y from "yjs";
import { Eye, ImagePlus } from "lucide-react";
import { DateRangeField } from "../DatePicker";
import { HeroPill } from "../HeroPill";
import { HeroTopBar } from "./HeroTopBar";
import { Photo } from "../Photo";
import { PhotoCredit } from "../PhotoCredit";
import { updateMeta, type TripMeta } from "../../lib/trips";
import type { SyncStatus } from "../../lib/sync";

/** The cover photo block at the top of the plan: title, dates, and the trip's header buttons. */
export function TripHero({
  headerRef,
  doc,
  meta,
  readOnly,
  canSync,
  syncStatus,
  isOwner,
  onShare,
  onHistory,
  onSettings,
  onPickCover,
}: {
  headerRef: RefObject<HTMLElement | null>;
  doc: Y.Doc;
  meta: TripMeta;
  readOnly: boolean;
  canSync: boolean;
  syncStatus: SyncStatus;
  isOwner: boolean;
  onShare: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onPickCover: () => void;
}) {
  return (
    <header ref={headerRef} className="relative">
      <div className="relative h-80 overflow-hidden bg-surface-2">
        {meta.cover ? (
          <Photo srcs={[meta.cover.url, meta.cover.thumb]} className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_10%,rgb(95_214_139/.35),transparent_60%),radial-gradient(90%_80%_at_90%_30%,rgb(106_168_255/.3),transparent_60%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/5 to-black/85" />
        <HeroTopBar canSync={canSync} syncStatus={syncStatus} isOwner={isOwner} onShare={onShare} onHistory={onHistory} onSettings={onSettings} />
        {/* Same bottom inset as the dates row, so the cover button lines up with it */}
        {!readOnly && (
          <div className="absolute right-4 bottom-4 z-10">
            <HeroPill icon={<ImagePlus />} label="Change cover" onClick={onPickCover} />
          </div>
        )}
        {/* Credit hugs the very bottom edge of the photo */}
        {meta.cover && (
          <PhotoCredit img={meta.cover} className="absolute right-2 bottom-0.5 z-10 max-w-[60%] truncate text-right text-[10px] leading-tight text-white/70 [text-shadow:0_1px_3px_rgb(0_0_0/.7)]" />
        )}
        <div className="absolute inset-x-0 bottom-0 px-5 pr-16 pb-4 text-white">
          {readOnly && (
            <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1 text-xs text-white/85">
              <Eye className="size-3.5" /> View only
            </p>
          )}
          <input
            disabled={readOnly}
            key={meta.title}
            defaultValue={meta.title}
            onBlur={(e) => e.target.value.trim() && e.target.value !== meta.title && updateMeta(doc, { title: e.target.value.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-full bg-transparent font-display text-[2.25rem] leading-tight text-white outline-none [text-shadow:0_1px_12px_rgb(0_0_0/.5)]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[15px] text-white/90">
            <DateRangeField
              disabled={readOnly}
              start={meta.startDate}
              end={meta.endDate}
              onChange={(startDate, endDate) => updateMeta(doc, { startDate, endDate })}
              className="rounded-full bg-black/35 px-3.5 py-1.5 font-semibold backdrop-blur transition-colors hover:bg-black/55 disabled:hover:bg-black/35"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
