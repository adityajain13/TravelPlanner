import { getSession } from "./auth";
import { API, error, type Env } from "./util";

/*
 * POST /api/receipts/parse { image: base64 JPEG, trip?: { destination, currency } }
 * → the receipt as structured data: merchant, date, currency, every line item, tax, tip, total.
 * Claude reads the photo; the app does the splitting maths.
 */

const TOOL = {
  name: "record_receipt",
  description: "Record what's on the receipt photo.",
  input_schema: {
    type: "object",
    properties: {
      readable: { type: "boolean", description: "False if the photo isn't a receipt or can't be read." },
      merchant: { type: "string", description: "Shop or restaurant name, in English/Latin letters when it's commonly known that way (e.g. \"FamilyMart\", \"Uotami\", \"Ichiran Shibuya\"); else as printed. Brand plus a short branch at most; the full branch goes in address." },
      address: { type: "string", description: "This branch's address (or branch name + phone if no street address is printed). Not a head-office address." },
      date: { type: "string", description: "YYYY-MM-DD if printed." },
      time: { type: "string", description: "HH:MM 24h if printed." },
      currency: { type: "string", description: "ISO 4217 code (¥ in Japan = JPY, $ in Canada = CAD)." },
      category: { type: "string", enum: ["food", "drinks", "groceries", "shopping", "transit", "activities", "sightseeing", "gas", "other"], description: "Restaurants/cafés = food; convenience store or supermarket food = groceries; bars = drinks." },
      items: {
        type: "array",
        description: "Every purchased line, in order (a cover / table charge per person counts as a line). Discounts as their own line with a negative price. Don't include subtotal/tax/tip/total/payment lines, and never list a surcharge or service charge here if it goes in tip.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Short English name (translate if needed), e.g. \"Tuna onigiri\"." },
            original: { type: "string", description: "As printed, if it was translated." },
            qty: { type: "number" },
            price: { type: "number", description: "Line total for this line (qty × unit price), as printed, before any tax added at the bottom." },
            taxable: { type: "boolean", description: "Only when tax is added on top (Canada/US): false for lines marked tax-exempt / zero-rated (e.g. basic groceries), true otherwise." },
          },
          required: ["name", "price"],
        },
      },
      subtotal: { type: "number" },
      tax: { type: "number", description: "Sales tax ADDED on top of the item prices (sum of GST/HST/PST/state tax lines). Leave out when prices already include tax (Japan, EU VAT shown \"incl.\")." },
      tax_included: { type: "boolean", description: "True when item prices already include tax (Japan 内税/税込, EU VAT included)." },
      tip: { type: "number", description: "Tip / gratuity / service charge / surcharge added after the items (e.g. Japan GW料金 holiday surcharge, 10% service). Only here, not also as an item." },
      total: { type: "number", description: "Amount paid." },
    },
    required: ["readable", "items"],
  },
};

export async function handleReceipts(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== `${API}/receipts/parse`) return null;
  if (req.method !== "POST") return error(405, "POST only");
  if (!(await getSession(req, env))) return error(401, "Sign in");
  const body = (await req.json().catch(() => null)) as { image?: string; trip?: { destination?: string; currency?: string } } | null;
  if (!body?.image || body.image.length > 6_000_000) return error(400, "Missing or oversized image");
  const ask = async (model: string) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: body.image } },
              {
                type: "text",
                text: `Read this receipt${body.trip?.destination ? ` (from a trip to ${body.trip.destination})` : ""}. The photo may be sideways, upside down, crumpled or in poor light: read it anyway, and only set readable=false if it isn't a receipt at all or the prices can't be made out. List every item line with its price (weighed items: the line total, e.g. "0.840 kg @ $6.58/kg" → the printed amount). Note whether tax is added on top (Canada/US style; untaxed lines like fresh food are taxable=false) or already included in the prices.`,
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error("receipt parse", model, res.status, detail);
      return { fail: `${res.status} ${(/"message"\s*:\s*"([^"]+)"/.exec(detail)?.[1] ?? "").slice(0, 120)}`.trim() };
    }
    const data = (await res.json()) as { content: { type: string; input?: Record<string, unknown> }[] };
    return { out: data.content.find((c) => c.type === "tool_use")?.input };
  };
  // The receipt model first (small print), then the email model if that one is unavailable or gives up
  const models = [...new Set([env.RECEIPT_MODEL || "claude-sonnet-5-5", env.EXTRACT_MODEL || "claude-haiku-5-5"])];
  let lastFail = "";
  let unreadable = false;
  for (const m of models) {
    const r = await ask(m);
    if (r.out && r.out.readable !== false) return Response.json(r.out);
    if (r.out) unreadable = true;
    else lastFail = r.fail ?? "";
  }
  if (unreadable) return error(422, "That doesn't look like a readable receipt");
  return error(502, `Couldn't reach the receipt reader (${lastFail || "no answer"})`);
}
