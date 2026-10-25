import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudDownload, CircleCheck, Loader2, RefreshCw, X } from "lucide-react";
import { db } from "../lib/db";
import type { TripState } from "../lib/trips";
import { formatBytes, planDownload, regionCovers, saveRegion, tripBBox, type Progress } from "../lib/offlineMap";
import { PROTOMAPS_KEY } from "../lib/mapStyle";

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
      <div className={`${pill} bg-surface-2 text-muted`}>
        <Loader2 className="size-3.5 animate-spin" />
        Saving map {pct}% · {formatBytes(progress.bytes)}
        <button onClick={() => ctrl.current?.abort()} className="ml-1 hover:text-fg" aria-label="Cancel">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {region && !stale ? (
        <button onClick={start} className={`${pill} bg-accent/15 text-accent hover:bg-accent/25`} title="Re-download">
          <CircleCheck className="size-3.5" /> Map saved offline
        </button>
      ) : (
        <button
          onClick={start}
          disabled={!navigator.onLine}
          className={`${pill} border border-line text-muted hover:border-accent hover:text-fg disabled:opacity-50`}
          title={`~${plan.tiles.toLocaleString()} tiles, street detail to zoom ${plan.maxZoom}`}
        >
          {stale ? <RefreshCw className="size-3.5" /> : <CloudDownload className="size-3.5" />}
          {stale ? "Update offline map" : "Save map offline"}
        </button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
