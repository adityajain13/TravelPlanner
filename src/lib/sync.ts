import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { db } from "./db";
import { api, type ServerTrip } from "./api";
import { openTrip } from "./trips";

/*
 * Live sync: the trip's local Y.Doc (already persisted offline) is attached to its Durable
 * Object over a WebSocket. Edits made offline merge automatically on reconnect.
 * Owners authenticate with the session cookie; collaborators with ?share=<token>.
 */

const wsBase = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/travelplanner/api/sync`;

export type SyncStatus = "connecting" | "online" | "offline";

function connect(id: string, doc: Y.Doc, shareToken?: string) {
  return new WebsocketProvider(wsBase(), id, doc, {
    params: shareToken ? { share: shareToken } : {},
    maxBackoffTime: 10000,
  });
}

export function useSync(id: string | undefined, doc: Y.Doc | null, opts: { shareToken?: string; enabled: boolean }) {
  const [status, setStatus] = useState<SyncStatus>(navigator.onLine ? "connecting" : "offline");
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!id || !doc || !opts.enabled) return;
    const p = connect(id, doc, opts.shareToken);
    const onStatus = ({ status: s }: { status: string }) =>
      setStatus(s === "connected" ? "online" : navigator.onLine ? "connecting" : "offline");
    const onSync = (v: boolean) => setSynced(v);
    const net = () => setStatus((s) => (navigator.onLine ? (s === "offline" ? "connecting" : s) : "offline"));
    p.on("status", onStatus);
    p.on("sync", onSync);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    return () => {
      p.off("status", onStatus);
      p.off("sync", onSync);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
      p.destroy();
    };
  }, [id, doc, opts.shareToken, opts.enabled]);

  return { status, synced };
}

/**
 * Called on the home screen when logged in and online:
 *  - trips that exist on the server but not on this device get listed (contents sync on open)
 *  - trips created on this device but not yet on the server get pushed up
 */
export async function reconcileTrips() {
  const { trips: remote } = await api<{ trips: ServerTrip[] }>("/trips");
  const local = await db.trips.toArray();
  const localIds = new Set(local.map((t) => t.id));
  const remoteIds = new Set(remote.map((t) => t.id));

  const row = (t: ServerTrip) => ({
        id: t.id,
        title: t.title,
        destination: t.destination ?? "",
        startDate: t.start_date ?? "",
        endDate: t.end_date ?? "",
        updatedAt: t.updated_at,
        ...(t.owner ? { owner: t.owner, role: t.role } : {}),
      });
  await db.trips.bulkPut(remote.filter((t) => !localIds.has(t.id)).map(row));
  // Shared-with-me trips: keep role/owner current; drop ones you were removed from
  for (const t of remote.filter((t) => t.owner && localIds.has(t.id))) await db.trips.update(t.id, { owner: t.owner, role: t.role });
  for (const t of local.filter((t) => t.owner && !remoteIds.has(t.id))) await db.trips.delete(t.id);

  const toPush = local.filter((t) => !t.shareToken && !t.owner && !remoteIds.has(t.id));
  for (const t of toPush) {
    const { doc, ready } = openTrip(t.id);
    await ready;
    await new Promise<void>((resolve) => {
      const p = connect(t.id, doc);
      const done = () => (p.destroy(), resolve());
      p.on("sync", (s: boolean) => s && setTimeout(done, 300));
      setTimeout(done, 8000);
    });
  }
}
