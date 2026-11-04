import { useEffect, useState } from "react";
import { snapshotDay, type MiniMap } from "../../lib/miniMaps";
import type { Theme } from "../../lib/theme";

type DayInput = { key: string; points: [number, number][] };

/**
 * Map snapshots for each day, keyed by the day's key. Each one shows up as it resolves. Results
 * for an earlier set of days or theme are dropped, so a changed day never shows its old picture.
 */
export function useMiniMaps(days: DayInput[], theme: Theme): Map<string, MiniMap> {
  // The serialized input is the effect's only dependency, so it reruns exactly when a day or the theme changes
  const sig = JSON.stringify({ theme, days: days.map((d) => [d.key, d.points]) });
  const [state, setState] = useState<{ sig: string; maps: Map<string, MiniMap> }>({ sig: "", maps: new Map() });

  useEffect(() => {
    let alive = true;
    const input = JSON.parse(sig) as { theme: Theme; days: [string, [number, number][]][] };
    const found = new Map<string, MiniMap>();
    void (async () => {
      // One at a time: snapshotDay queues them on the shared map anyway
      for (const [key, points] of input.days) {
        const m = await snapshotDay(points, input.theme);
        if (!alive) return;
        if (m) {
          found.set(key, m);
          setState({ sig, maps: new Map(found) });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [sig]);

  return state.sig === sig ? state.maps : new Map();
}
