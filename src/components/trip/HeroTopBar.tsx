import { ArrowLeft, Cloud, CloudOff, Loader2, Share2, Settings as SettingsIcon } from "lucide-react";
import { HeroPill } from "../HeroPill";
import type { SyncStatus } from "../../lib/sync";

/** The row of pills over the top of the cover photo: back to trips, sync state, share, settings. */
export function HeroTopBar({
  canSync,
  syncStatus,
  isOwner,
  onShare,
  onSettings,
}: {
  canSync: boolean;
  syncStatus: SyncStatus;
  isOwner: boolean;
  onShare: () => void;
  onSettings: () => void;
}) {
  const syncIcon = syncStatus === "online" ? <Cloud /> : syncStatus === "offline" ? <CloudOff /> : <Loader2 className="animate-spin" />;
  const syncLabel = syncStatus === "online" ? "Synced" : syncStatus === "offline" ? "Offline · saved on device" : "Connecting";
  return (
    <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.75rem)] text-white">
      <HeroPill to="/" icon={<ArrowLeft />} label="Trips" />
      <div className="flex items-center gap-1.5">
        {canSync && (
          <HeroPill
            icon={syncIcon}
            label={syncLabel}
            className={syncStatus === "online" ? "text-accent" : ""}
            title={syncStatus === "offline" ? "Changes sync when you're back online" : undefined}
          />
        )}
        {isOwner && <HeroPill icon={<Share2 />} label="Share" onClick={onShare} />}
        <HeroPill icon={<SettingsIcon />} label="Settings" onClick={onSettings} />
      </div>
    </div>
  );
}
