import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudDownload, CircleCheck, RefreshCw, X } from "lucide-react";
import { db } from "../lib/db";
import type { TripState } from "../lib/trips";
import { formatBytes, planDownload, regionCovers, saveRegion, tripBBox, type Progress } from "../lib/offlineMap";
import { PROTOMAPS_KEY } from "../lib/mapKeys";

export function OfflineMapButton({ tripId, state }: { tripId: string; state: TripState }) {
  const region = useLiveQuery(() => db.regions.get(tripId), [tripId]);
  const bbox = useMemo(() => tripBBox(state), [state]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  if (!PROTOMAPS_KEY || !bbox) return null;

  const stale = region && !regionCovers(region, bbox);
  const plan = planDownload(bbox);

  async function start() {
    setError(null);
    ctrl.current = new AbortController();
    try {
      await saveRegion(tripId, bbox!, setProgress, ctrl.current.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  const pill = "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors";

  if (progress) {
    const pct = Math.round((progress.done / Math.max(1, progress.total)) * 100);
    return (
      // One line, fixed shape: a ring that fills, the percent, and (on wider screens) the size
      <div className={`${pill} shrink-0 whitespace-nowrap bg-surface-2 text-muted tabular-nums`} title={`Saving map · ${formatBytes(progress.bytes)}`}>
        <svg viewBox="0 0 20 20" className="size-4 -rotate-90">
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.5" />
          <circle cx="10" cy="10" r="8" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 50.3} 50.3`} />
        </svg>
        {pct}%<span className="max-sm:hidden"> · {formatBytes(progress.bytes)}</span>
        <button onClick={() => ctrl.current?.abort()} className="ml-1 hover:text-fg" aria-label="Cancel">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {region && !stale ? (
        <button onClick={start} className={`${pill} bg-accent/15 text-accent hover:bg-accent/25`} title="Re-download">
          <CircleCheck className="size-3.5" /> <span className="max-sm:hidden">Map saved offline</span>
        </button>
      ) : (
        <button
          onClick={start}
          disabled={!navigator.onLine}
          className={`${pill} border border-line text-muted hover:border-accent hover:text-fg disabled:opacity-50`}
          title={`${stale ? "Update offline map" : "Save map offline"}: ~${plan.tiles.toLocaleString()} tiles, street detail to zoom ${plan.maxZoom}`}
          aria-label={stale ? "Update offline map" : "Save map offline"}
        >
          {stale ? <RefreshCw className="size-3.5" /> : <CloudDownload className="size-3.5" />}
          <span className="max-sm:hidden">{stale ? "Update offline map" : "Save map offline"}</span>
        </button>
      )}
      {error && <span className="max-w-40 truncate text-xs text-danger" title={error}>{error}</span>}
    </div>
  );
}
