import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { Env } from "./util";
import type { Role } from "./trips";
import { applyOp, snapshot, type Item, type Op, type Snapshot } from "./tripOps";
import { watchHistory } from "../src/lib/history";

/*
 * One Durable Object per trip. Speaks the y-websocket protocol (0 = sync, 1 = awareness),
 * holds the canonical Y.Doc, persists it to DO storage on every change, and mirrors the
 * trip's title/dates into D1 (debounced via an alarm) so the trip list works on new devices.
 * Uses the WebSocket Hibernation API, so an idle trip costs nothing.
 * View-only sockets get the doc but their writes are dropped.
 */

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

interface Attachment {
  role: Role;
}

export class TripRoom extends DurableObject<Env> {
  private doc = new Y.Doc();
  private tripId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<Uint8Array>("doc");
      if (saved) Y.applyUpdate(this.doc, saved);
      this.tripId = (await ctx.storage.get<string>("tripId")) ?? null;
    });

    this.watch(this.doc);
    watchHistory(this.doc);
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("X-Action") === "destroy") {
      for (const ws of this.ctx.getWebSockets()) ws.close(4404, "Trip deleted");
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      this.doc = new Y.Doc();
      this.watch(this.doc);
      watchHistory(this.doc);
      return new Response(null, { status: 204 });
    }
    const role = (req.headers.get("X-Role") as Role) ?? "view";
    const tripId = req.headers.get("X-Trip-Id");
    if (tripId && tripId !== this.tripId) {
      this.tripId = tripId;
      await this.ctx.storage.put("tripId", tripId);
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role } satisfies Attachment);

    // Start the handshake: send our state vector; the client replies with what we're missing
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_SYNC);
    syncProtocol.writeSyncStep1(e, this.doc);
    this.send(server, encoding.toUint8Array(e));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message === "string") return;
    const data = new Uint8Array(message);
    const role = (ws.deserializeAttachment() as Attachment | null)?.role ?? "view";
    try {
      const d = decoding.createDecoder(data);
      const type = decoding.readVarUint(d);
      if (type === MSG_SYNC) {
        const e = encoding.createEncoder();
        encoding.writeVarUint(e, MSG_SYNC);
        if (role === "edit") {
          syncProtocol.readSyncMessage(d, e, this.doc, ws);
        } else {
          // View-only: answer their state request, ignore anything they try to write
          const sub = decoding.readVarUint(d);
          if (sub === syncProtocol.messageYjsSyncStep1) syncProtocol.readSyncStep1(d, e, this.doc);
        }
        if (encoding.length(e) > 1) this.send(ws, encoding.toUint8Array(e));
      } else if (type === MSG_AWARENESS) {
        // Presence (who's looking at the trip) — relay as-is, never stored
        for (const other of this.ctx.getWebSockets()) if (other !== ws) this.send(other, data);
      }
    } catch (err) {
      console.error("bad sync message", err);
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, "closing");
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, "error");
    } catch {
      /* ignore */
    }
  }

  private watch(doc: Y.Doc) {
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      // Fan out to every other socket
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      syncProtocol.writeUpdate(e, update);
      const msg = encoding.toUint8Array(e);
      for (const ws of this.ctx.getWebSockets()) if (ws !== origin) this.send(ws, msg);
      // Persist (writes are coalesced by the runtime; output gates make them durable before replies)
      void this.ctx.storage.put("doc", Y.encodeStateAsUpdate(doc));
      void this.scheduleIndex();
    });
  }

  // ---- RPC for the Claude connector (called via the DO stub) ----

  async read(): Promise<Snapshot> {
    return snapshot(this.doc);
  }

  /** Runs an edit as origin "claude"; connected app clients receive it live like any other change. */
  async mutate(op: Op): Promise<{ ok: true; item: Item | null } | { ok: false; error: string }> {
    try {
      let item: Item | null = null;
      this.doc.transact(() => {
        item = applyOp(this.doc, op);
      }, "claude");
      return { ok: true, item };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  private send(ws: WebSocket, msg: Uint8Array) {
    try {
      ws.send(msg);
    } catch {
      /* socket gone */
    }
  }

  private async scheduleIndex() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + 5000);
  }

  /** Mirror trip metadata into D1 for the trip list. */
  async alarm() {
    if (!this.tripId) return;
    const m = this.doc.getMap("meta").toJSON() as Record<string, string | undefined>;
    await this.env.DB.prepare("UPDATE trips SET title = ?, destination = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?")
      .bind(m.title ?? null, m.destination ?? null, m.startDate ?? null, m.endDate ?? null, Date.now(), this.tripId)
      .run();
  }
}
