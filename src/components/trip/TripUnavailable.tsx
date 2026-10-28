import { Link } from "react-router-dom";
import type { SyncStatus } from "../../lib/sync";

/** Shown instead of the trip while it hasn't arrived: syncing it in, offline, or not found. */
export function TripUnavailable({ canSync, syncStatus, synced, waited }: { canSync: boolean; syncStatus: SyncStatus; synced: boolean; waited: boolean }) {
  // A trip from another device (or a share link) arrives over sync on first open
  if (canSync && syncStatus !== "offline" && !synced && !waited) return <div className="grid h-full place-items-center text-muted">Syncing trip…</div>;
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="space-y-3">
        <p className="font-display text-2xl">{canSync && syncStatus === "offline" ? "Connect once to download this trip" : "Trip not found"}</p>
        <Link to="/" className="text-accent">
          Back to trips
        </Link>
      </div>
    </div>
  );
}
