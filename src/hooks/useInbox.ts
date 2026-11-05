import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type * as Y from "yjs";
import { fetchInbox, type InboxItem } from "../lib/inbox";

/**
 * Forwarded bookings for one trip. Refetches when the Worker signals new ones (the trip doc's
 * "signals" map), when the tab comes back, and when the browser goes online again.
 */
export function useInbox(tripId: string | undefined, canReview: boolean, doc: Y.Doc | null): [InboxItem[], Dispatch<SetStateAction<InboxItem[]>>] {
  const [items, setItems] = useState<InboxItem[]>([]);

  useEffect(() => {
    if (!canReview || !tripId) return;
    let alive = true;
    // Responses can arrive out of order; only the latest request counts
    let latest = 0;
    const load = () => {
      if (!navigator.onLine) return;
      const seq = ++latest;
      fetchInbox()
        .then((all) => alive && seq === latest && setItems(all.filter((i) => i.trip_id === tripId)))
        .catch(() => undefined);
    };
    const onSignal = (e: Y.YMapEvent<unknown>) => {
      if (e.keysChanged.has("inbox")) load();
    };
    const onVisible = () => document.visibilityState === "visible" && load();
    const signals = doc?.getMap("signals");
    signals?.observe(onSignal);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);
    load();
    return () => {
      alive = false;
      signals?.unobserve(onSignal);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
    };
  }, [tripId, canReview, doc]);

  return [items, setItems];
}
