// PROTOTYPE (proto/trip-focus): variant B's slim bar over the plan pane (no sidebar): trips, undo, redo,
// and the trip's own buttons that used to sit on the cover photo.
import { Link } from "react-router-dom";
import { Cloud, CloudOff, History as HistoryIcon, Loader2, Redo2, Settings as SettingsIcon, Share2, Undo2 } from "lucide-react";
import { LogoMark } from "../../Logo";
import { modKey } from "../UndoBars";
import type { UndoHistory } from "../types";
import type { SyncStatus } from "../../../lib/sync";

const btn = "grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent [&>svg]:size-[18px]";

export function AppBar(p: {
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
  const sync = p.syncStatus === "online" ? <Cloud className="text-accent" /> : p.syncStatus === "offline" ? <CloudOff /> : <Loader2 className="animate-spin" />;
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-2">
      <Link to="/" title="All trips" className="mr-1 shrink-0">
        <LogoMark size={26} />
      </Link>
      {!p.readOnly && (
        <>
          <button className={btn} onClick={p.history.undo} disabled={!p.history.canUndo} title={`Undo (${mod}Z)`} aria-label="Undo">
            <Undo2 />
          </button>
          <button className={btn} onClick={p.history.redo} disabled={!p.history.canRedo} title={`Redo (${mod}⇧Z)`} aria-label="Redo">
            <Redo2 />
          </button>
        </>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        {p.canSync && (
          <span className={btn} title={p.syncStatus === "online" ? "Synced" : p.syncStatus === "offline" ? "Offline · saved on device" : "Connecting"}>
            {sync}
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
        <button className={btn} onClick={p.onSettings} title="Settings" aria-label="Settings">
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
}
