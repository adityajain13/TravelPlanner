import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { openTrip, readTrip, type TripState } from "./trips";

/** Opens a trip's Yjs doc (offline copy first) and re-renders on every change, local or remote. */
export function useTrip(id: string | undefined): { doc: Y.Doc | null; state: TripState | null; ready: boolean } {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [state, setState] = useState<TripState | null>(null);

  useEffect(() => {
    if (!id) return;
    const t = openTrip(id);
    let alive = true;
    const update = () => alive && setState(readTrip(t.doc));
    t.ready.then(() => {
      if (!alive) return;
      setDoc(t.doc);
      update();
    });
    t.doc.on("update", update);
    return () => {
      alive = false;
      t.doc.off("update", update);
    };
  }, [id]);

  const ready = !!state?.meta?.title;
  return { doc, state: ready ? state : null, ready: !!doc };
}
