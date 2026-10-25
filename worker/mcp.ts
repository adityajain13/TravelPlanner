import { verifyShareToken, type Role } from "./trips";
import { EXPENSE_CATEGORIES, render, RES_TYPES, type Item, type ItemInput, type Op, type Rec } from "./tripOps";
import { json, type Env } from "./util";

/*
 * Claude connector: a stateless MCP server over Streamable HTTP (plain JSON responses).
 * Add https://adityajain.ca/travelplanner/mcp as a custom connector in claude.ai.
 *
 * There is no login on the connector itself: every tool takes a trip share link, and the link
 * is the credential. A view link unlocks reading; an edit link also unlocks the write tools.
 * Write tools are annotated as non-read-only so claude.ai can ask for approval on each call.
 */

const SERVER_INFO = { name: "travel-planner", title: "Travel Planner", version: "1.0.0" };
const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `Reads and edits trips in Aditya's travel planner (adityajain.ca/travelplanner).
Every tool needs a trip share link (https://adityajain.ca/travelplanner/s/...). Ask the user to paste one if you don't have it.
Call get_trip first: it returns days, lists and the item ids the edit tools need.
Sections are addressed as "day 3", a date like "2026-12-03", or a list name like "Places to visit".
Use search_places to get real coordinates before add_place when possible, so the place appears on the map.
For single edits, make one change per call and say what you changed. To import a whole itinerary (e.g. a Wanderlog PDF the user attached), add everything with one add_items call, using the trip's day numbers or dates; set the trip dates first with update_trip if they differ. Put flights, hotels, car rentals, trains and restaurant bookings in add_reservations (not as places), and any budget expenses in add_expenses.`;

const linkProp = {
  trip_link: { type: "string", description: "The trip's share link (https://adityajain.ca/travelplanner/s/<token>) or just the token." },
};
const sectionProp = {
  section: { type: "string", description: 'Where it goes: "day 3", a date ("2026-12-03"), or a list name ("Places to visit").' },
};
const positionProp = {
  position: { type: "integer", minimum: 1, description: "1-based position within the section. Omit to append at the end." },
};
const itemFields = {
  notes: { type: "string", description: "Free text: tips, booking refs, links." },
  start_time: { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "HH:MM, 24-hour, local time." },
  end_time: { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "HH:MM, 24-hour, local time." },
};

const TOOLS = [
  {
    name: "get_trip",
    title: "Read trip",
    description: "Returns the whole trip: title, dates, every day and list, with each item's id, time, address, coordinates and notes.",
    inputSchema: { type: "object", properties: { ...linkProp }, required: ["trip_link"] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "search_places",
    title: "Search places",
    description: "Searches OpenStreetMap (Photon) for real places. Results include coordinates and address to pass to add_place. Biased toward the trip's area when trip_link is given.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: 'e.g. "Ichiran Shibuya" or "ramen near Kyoto station"' }, ...linkProp },
      required: ["query"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "add_place",
    title: "Add place",
    description: "Adds a place to a day or list. Needs an edit link.",
    inputSchema: {
      type: "object",
      properties: {
        ...linkProp,
        ...sectionProp,
        name: { type: "string" },
        lat: { type: "number" },
        lng: { type: "number" },
        address: { type: "string" },
        category: { type: "string", description: 'Short type, e.g. "restaurant", "shrine", "museum".' },
        osm_id: { type: "string", description: "From search_places, if used." },
        ...itemFields,
        ...positionProp,
      },
      required: ["trip_link", "section", "name"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "add_note",
    title: "Add note",
    description: "Adds a text note (not a map pin) to a day or list, e.g. a reminder or transit tip. Needs an edit link.",
    inputSchema: {
      type: "object",
      properties: { ...linkProp, ...sectionProp, text: { type: "string" }, ...positionProp },
      required: ["trip_link", "section", "text"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "add_items",
    title: "Add many items",
    description:
      "Adds many places and notes in one call, e.g. when importing a whole itinerary (a Wanderlog PDF, a list from a website). Items are appended to their sections in the order given. Places without lat/lng are geocoded automatically near the trip's destination; check the result for any that weren't found. Needs an edit link. Prefer this over repeated add_place calls.",
    inputSchema: {
      type: "object",
      properties: {
        ...linkProp,
        items: {
          type: "array",
          maxItems: 300,
          items: {
            type: "object",
            properties: {
              ...sectionProp,
              kind: { type: "string", enum: ["place", "note"], description: "place = map pin (default); note = text only." },
              name: { type: "string", description: "Place name, or the note text." },
              address: { type: "string" },
              city: { type: "string", description: "Helps geocoding when there's no full address." },
              lat: { type: "number" },
              lng: { type: "number" },
              category: { type: "string" },
              ...itemFields,
            },
            required: ["section", "name"],
          },
        },
      },
      required: ["trip_link", "items"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "add_reservations",
    title: "Add reservations",
    description:
      "Adds bookings to the trip's Reservations tab: flights, lodging, rental cars, trains/buses, restaurants, other. They also appear as chips on the matching days, and their cost counts toward the budget. Use for confirmations and when importing a Wanderlog trip. Needs an edit link.",
    inputSchema: {
      type: "object",
      properties: {
        ...linkProp,
        reservations: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: [...RES_TYPES] },
              title: { type: "string", description: 'e.g. "AC1 Air Canada", "Hotel Granvia Kyoto", "Toyota Rent a Car".' },
              confirmation: { type: "string" },
              start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Depart / check-in / pick-up / reservation date, local." },
              start_time: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
              end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Arrive / check-out / drop-off." },
              end_time: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
              from: { type: "string", description: "Origin airport/station or car pick-up location." },
              to: { type: "string", description: "Destination or car drop-off location." },
              address: { type: "string", description: "For lodging/restaurants; used to place a map pin." },
              cost: { type: "number" },
              cost_currency: { type: "string", description: "ISO code, e.g. JPY. Defaults to the trip currency." },
              notes: { type: "string" },
            },
            required: ["type", "title"],
          },
        },
      },
      required: ["trip_link", "reservations"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "add_expenses",
    title: "Add expenses",
    description: "Adds expenses to the trip's Budget tab. Don't add reservation costs here; they're counted automatically. Needs an edit link.",
    inputSchema: {
      type: "object",
      properties: {
        ...linkProp,
        expenses: {
          type: "array",
          maxItems: 300,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              amount: { type: "number" },
              currency: { type: "string", description: "ISO code. Defaults to the trip currency." },
              category: { type: "string", enum: [...EXPENSE_CATEGORIES] },
              date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
              paid_by: { type: "string", description: "Traveler name, if the trip splits costs." },
              notes: { type: "string" },
            },
            required: ["title", "amount"],
          },
        },
      },
      required: ["trip_link", "expenses"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "update_item",
    title: "Edit item",
    description: "Changes fields on an existing item. Pass only what should change; pass an empty string to clear a field. Needs an edit link.",
    inputSchema: {
      type: "object",
      properties: {
        ...linkProp,
        item_id: { type: "string" },
        name: { type: "string" },
        address: { type: "string" },
        category: { type: "string" },
        ...itemFields,
      },
      required: ["trip_link", "item_id"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "move_item",
    title: "Move item",
    description: "Moves an item to another day/list and/or position. Needs an edit link.",
    inputSchema: {
      type: "object",
      properties: { ...linkProp, item_id: { type: "string" }, ...sectionProp, ...positionProp },
      required: ["trip_link", "item_id", "section"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "remove_item",
    title: "Remove item",
    description: "Deletes an item from the trip. Needs an edit link.",
    inputSchema: { type: "object", properties: { ...linkProp, item_id: { type: "string" } }, required: ["trip_link", "item_id"] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "update_trip",
    title: "Edit trip details",
    description: "Renames the trip or changes its dates. Shortening dates moves that day's items to 'Outside trip dates'; they are not deleted. Needs an edit link.",
    inputSchema: {
      type: "object",
      properties: {
        ...linkProp,
        title: { type: "string" },
        destination: { type: "string" },
        start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      },
      required: ["trip_link"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

type Args = Record<string, unknown>;
class ToolError extends Error {}

const str = (a: Args, k: string, required = false): string | undefined => {
  const v = a[k];
  if (v == null || v === "") {
    if (required) throw new ToolError(`Missing "${k}".`);
    return v === "" ? "" : undefined;
  }
  if (typeof v !== "string") throw new ToolError(`"${k}" must be a string.`);
  return v.trim();
};
const num = (a: Args, k: string): number | undefined => {
  const v = a[k];
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ToolError(`"${k}" must be a number.`);
  return n;
};
const time = (a: Args, k: string) => {
  const v = str(a, k);
  if (v && !/^\d{2}:\d{2}$/.test(v)) throw new ToolError(`"${k}" must be HH:MM.`);
  return v;
};

async function access(env: Env, a: Args, need: Role) {
  const raw = str(a, "trip_link", true)!;
  const token = raw.includes("/s/") ? raw.split("/s/")[1].split(/[?#/]/)[0] : raw;
  const v = await verifyShareToken(env, token);
  if (!v) throw new ToolError("That trip link is invalid or was reset. Ask the user for a fresh share link from the app (Share button).");
  if (need === "edit" && v.role !== "edit")
    throw new ToolError("This is a view-only link, so the trip can't be changed. Ask the user for the edit link (Share → Can edit).");
  return { ...v, room: env.TRIP_ROOM.get(env.TRIP_ROOM.idFromName(v.tripId)) };
}

const describe = (it: Item | null) =>
  it ? `"${it.name}" {id: ${it.id}}${it.startTime ? ` at ${it.startTime}` : ""}${it.lat == null && it.kind === "place" ? " (no coordinates, so no map pin)" : ""}` : "";

async function mutate(env: Env, a: Args, op: Op, verb: string) {
  const { room } = await access(env, a, "edit");
  const r = await room.mutate(op);
  if (!r.ok) throw new ToolError(r.error);
  return `${verb} ${describe(r.item)}`.trim() + ". The app shows the change live.";
}

async function geocode(q: string, near?: number[]) {
  const params = new URLSearchParams({ q, limit: "1", lang: "en" });
  if (near?.length === 2) params.set("lon", String(near[0])), params.set("lat", String(near[1]));
  try {
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: { "User-Agent": "travelplanner (adityajain.ca)" } });
    if (!res.ok) return null;
    const f = ((await res.json()) as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | number> }[] }).features[0];
    if (!f) return null;
    const p = f.properties;
    const address = [[p.housenumber, p.street].filter(Boolean).join(" "), p.city, p.country].filter(Boolean).join(", ");
    return { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], osmId: `${p.osm_type}${p.osm_id}`, address: address || undefined };
  } catch {
    return null;
  }
}

async function callTool(env: Env, name: string, a: Args): Promise<string> {
  switch (name) {
    case "get_trip": {
      const { room, role } = await access(env, a, "view");
      const snap = await room.read();
      if (!snap.meta.title) return "This trip has no data on the server yet. The owner needs to open it once in the app while online.";
      return render(snap, role);
    }
    case "search_places": {
      const q = str(a, "query", true)!;
      const params = new URLSearchParams({ q, limit: "6", lang: "en" });
      if (a.trip_link) {
        const { room } = await access(env, a, "view");
        const c = (await room.read()).meta.center;
        if (c) params.set("lon", String(c[0])), params.set("lat", String(c[1]));
      }
      const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: { "User-Agent": "travelplanner (adityajain.ca)" } });
      if (!res.ok) throw new ToolError(`Place search failed (${res.status}).`);
      const data = (await res.json()) as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | number> }[] };
      if (!data.features.length) return "No places found. Try a different spelling or add the city name.";
      return data.features
        .map((f, i) => {
          const p = f.properties;
          const addr = [[p.housenumber, p.street].filter(Boolean).join(" "), p.district ?? p.locality, p.city, p.country].filter(Boolean).join(", ");
          const [lng, lat] = f.geometry.coordinates;
          return `${i + 1}. ${p.name ?? addr} (${String(p.osm_value ?? "").replace(/_/g, " ")})\n   address: ${addr}\n   lat: ${lat}, lng: ${lng}, osm_id: ${p.osm_type}${p.osm_id}`;
        })
        .join("\n");
    }
    case "add_place": {
      const lat = num(a, "lat");
      const lng = num(a, "lng");
      if ((lat == null) !== (lng == null)) throw new ToolError("Pass both lat and lng, or neither.");
      const item: ItemInput = {
        kind: "place",
        name: str(a, "name", true)!,
        lat,
        lng,
        address: str(a, "address"),
        category: str(a, "category"),
        osmId: str(a, "osm_id"),
        notes: str(a, "notes"),
        startTime: time(a, "start_time"),
        endTime: time(a, "end_time"),
      };
      return mutate(env, a, { type: "add", section: str(a, "section", true)!, item, position: num(a, "position") }, "Added");
    }
    case "add_note":
      return mutate(env, a, { type: "add", section: str(a, "section", true)!, item: { kind: "note", name: str(a, "text", true)! }, position: num(a, "position") }, "Added note");
    case "add_items": {
      const list = a.items;
      if (!Array.isArray(list) || list.length === 0) throw new ToolError('"items" must be a non-empty array.');
      if (list.length > 300) throw new ToolError("At most 300 items per call; split the import.");
      const { room } = await access(env, a, "edit");
      const center = (await room.read()).meta.center;
      const items = list.map((raw, i) => {
        const x = (raw ?? {}) as Args;
        try {
          const kind = str(x, "kind") === "note" ? "note" : "place";
          return {
            section: str(x, "section", true)!,
            city: str(x, "city"),
            item: {
              kind,
              name: str(x, "name", true)!,
              lat: num(x, "lat"),
              lng: num(x, "lng"),
              address: str(x, "address") || undefined,
              category: str(x, "category") || undefined,
              notes: str(x, "notes") || undefined,
              startTime: time(x, "start_time") || undefined,
              endTime: time(x, "end_time") || undefined,
            } as ItemInput,
          };
        } catch (e) {
          throw new ToolError(`Item ${i + 1}: ${(e as Error).message}`);
        }
      });

      // Geocode places that came without coordinates (Photon, a few at a time to be polite)
      const missing = items.filter((x) => x.item.kind === "place" && (x.item.lat == null || x.item.lng == null));
      const notFound: string[] = [];
      for (let i = 0; i < missing.length; i += 4) {
        await Promise.all(
          missing.slice(i, i + 4).map(async (x) => {
            const hit = await geocode([x.item.name, x.item.address, x.city].filter(Boolean).join(", "), center);
            if (hit) Object.assign(x.item, { lat: hit.lat, lng: hit.lng, osmId: hit.osmId, address: x.item.address ?? hit.address });
            else (x.item.lat = undefined), (x.item.lng = undefined), notFound.push(x.item.name);
          }),
        );
      }

      const r = await room.mutate({ type: "addMany", items: items.map(({ section, item }) => ({ section, item })) });
      if (!r.ok) throw new ToolError(r.error);
      const pinned = items.filter((x) => x.item.lat != null).length;
      return [
        `Added ${items.length} items (${pinned} with map pins). The app shows them live.`,
        notFound.length ? `Couldn't find coordinates for: ${notFound.join("; ")}. Use search_places and update_item, or leave them as unpinned.` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "add_reservations": {
      const list = a.reservations;
      if (!Array.isArray(list) || !list.length) throw new ToolError('"reservations" must be a non-empty array.');
      const { room } = await access(env, a, "edit");
      const snap = await room.read();
      if (!snap.meta.title) throw new ToolError("This trip has no data on the server yet. Open it once in the app while online.");
      const records = [];
      for (const [i, raw] of list.entries()) {
        const x = (raw ?? {}) as Args;
        try {
          const type = str(x, "type", true)!;
          if (!(RES_TYPES as readonly string[]).includes(type)) throw new ToolError(`type must be one of ${RES_TYPES.join(", ")}`);
          const rec: Omit<Rec, "id"> = {
            type,
            title: str(x, "title", true),
            confirmation: str(x, "confirmation"),
            startDate: str(x, "start_date"),
            startTime: time(x, "start_time"),
            endDate: str(x, "end_date"),
            endTime: time(x, "end_time"),
            from: str(x, "from"),
            to: str(x, "to"),
            address: str(x, "address"),
            cost: num(x, "cost"),
            costCurrency: str(x, "cost_currency")?.toUpperCase(),
            notes: str(x, "notes"),
          };
          if ((type === "lodging" || type === "restaurant") && (rec.address || rec.title)) {
            const hit = await geocode([rec.title, rec.address].filter(Boolean).join(", "), snap.meta.center);
            if (hit) Object.assign(rec, { lat: hit.lat, lng: hit.lng, address: rec.address ?? hit.address });
          }
          records.push(rec);
        } catch (e) {
          throw new ToolError(`Reservation ${i + 1}: ${(e as Error).message}`);
        }
      }
      const r = await room.mutate({ type: "addRecords", map: "reservations", records });
      if (!r.ok) throw new ToolError(r.error);
      return `Added ${records.length} reservation${records.length > 1 ? "s" : ""}. They show in the Reservations tab and on their days.`;
    }
    case "add_expenses": {
      const list = a.expenses;
      if (!Array.isArray(list) || !list.length) throw new ToolError('"expenses" must be a non-empty array.');
      const { room } = await access(env, a, "edit");
      const snap = await room.read();
      if (!snap.meta.title) throw new ToolError("This trip has no data on the server yet. Open it once in the app while online.");
      const records = list.map((raw, i) => {
        const x = (raw ?? {}) as Args;
        try {
          const amount = num(x, "amount");
          if (amount == null) throw new ToolError('Missing "amount".');
          const category = str(x, "category") ?? "other";
          if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) throw new ToolError(`category must be one of ${EXPENSE_CATEGORIES.join(", ")}`);
          return {
            title: str(x, "title", true)!,
            amount,
            currency: (str(x, "currency") || snap.meta.currency || "CAD").toUpperCase(),
            category,
            date: str(x, "date"),
            paidBy: str(x, "paid_by"),
            notes: str(x, "notes"),
          };
        } catch (e) {
          throw new ToolError(`Expense ${i + 1}: ${(e as Error).message}`);
        }
      });
      const r = await room.mutate({ type: "addRecords", map: "expenses", records });
      if (!r.ok) throw new ToolError(r.error);
      return `Added ${records.length} expense${records.length > 1 ? "s" : ""} to the budget.`;
    }
    case "update_item": {
      const patch: Record<string, unknown> = {
        name: str(a, "name"),
        address: str(a, "address"),
        category: str(a, "category"),
        notes: str(a, "notes"),
        startTime: time(a, "start_time"),
        endTime: time(a, "end_time"),
      };
      if (patch.name === "") throw new ToolError("name can't be empty.");
      return mutate(env, a, { type: "update", id: str(a, "item_id", true)!, patch }, "Updated");
    }
    case "move_item":
      return mutate(env, a, { type: "move", id: str(a, "item_id", true)!, section: str(a, "section", true)!, position: num(a, "position") }, "Moved");
    case "remove_item":
      return mutate(env, a, { type: "remove", id: str(a, "item_id", true)! }, "Removed the item");
    case "update_trip":
      return mutate(
        env,
        a,
        { type: "meta", patch: { title: str(a, "title"), destination: str(a, "destination"), startDate: str(a, "start_date"), endDate: str(a, "end_date") } },
        "Updated the trip details",
      );
    default:
      throw new ToolError(`Unknown tool "${name}".`);
  }
}

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

async function handleRpc(env: Env, msg: RpcRequest): Promise<object | null> {
  const reply = (result: object) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  if (msg.id === undefined) return null; // notification (e.g. notifications/initialized)

  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return reply({
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Args;
      try {
        return reply({ content: [{ type: "text", text: await callTool(env, name, args) }] });
      } catch (e) {
        if (e instanceof ToolError) return reply({ content: [{ type: "text", text: e.message }], isError: true });
        console.error(e);
        return reply({ content: [{ type: "text", text: "Server error while running the tool." }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
};

export async function handleMcp(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  // Stateless server: no server-initiated stream
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST", ...CORS } });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }
  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as RpcRequest[];
  const out = (await Promise.all(msgs.map((m) => handleRpc(env, m)))).filter(Boolean);
  if (out.length === 0) return new Response(null, { status: 202, headers: CORS });
  return json(batch ? out : out[0], { headers: CORS });
}
