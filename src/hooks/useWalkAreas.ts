import { useEffect, useMemo, useState } from "react";
import { walkCircle, walkIsochrone, type Ring } from "../lib/walkArea";
import type { WalkTarget } from "../lib/walkTargets";

export interface WalkArea {
  id: string;
  color: string;
  ring: Ring;
}

/**
 * The area for each target: a circle at once, then the real walking area as each one arrives.
 * `key` covers what the areas depend on, so the effect only reruns when they change.
 */
export function useWalkAreas(targets: WalkTarget[], minutes: number): WalkArea[] {
  const key = `${minutes}#` + targets.map((t) => `${t.id}:${t.center[0]},${t.center[1]}`).join("|");
  const [done, setDone] = useState<{ key: string; rings: Record<string, Ring> }>({ key: "", rings: {} });
  useEffect(() => {
    let alive = true;
    // Each area lands as its own request resolves
    for (const t of targets)
      walkIsochrone(t.center, minutes).then((ring) => {
        if (!ring || !alive) return;
        setDone((d) => ({ key, rings: { ...(d.key === key ? d.rings : {}), [t.id]: ring } }));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(() => {
    const rings = done.key === key ? done.rings : {};
    return targets.map((t) => ({ id: t.id, color: t.color, ring: rings[t.id] ?? walkCircle(t.center, minutes) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, done]);
}

/** Per-trip, per-device eye toggles: `tp-walk-<tripId>` holds { id: on }. Unset means off. */
export function useWalkToggles(tripId?: string) {
  const storageKey = `tp-walk-${tripId}`;
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => readToggles(storageKey));
  useEffect(() => setToggles(readToggles(storageKey)), [storageKey]);
  const setMany = (ids: string[], on: boolean) => {
    const next = { ...toggles };
    for (const id of ids) next[id] = on;
    setToggles(next);
    writeToggles(storageKey, next);
  };
  return { toggles, setMany };
}

function readToggles(key: string): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
}

function writeToggles(key: string, v: Record<string, boolean>) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable: the toggle still works until reload */
  }
}
