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
      merchant: { type: "string", description: "Shop or restaurant name, in English/Latin letters when it's commonly known that way (e.g. \"FamilyMart\", \"Ichiran Shibuya\"); else as printed." },
      address: { type: "string", description: "Branch / address if printed." },
      date: { type: "string", description: "YYYY-MM-DD if printed." },
      time: { type: "string", description: "HH:MM 24h if printed." },
      currency: { type: "string", description: "ISO 4217 code (¥ in Japan = JPY, $ in Canada = CAD)." },
      category: { type: "string", enum: ["food", "drinks", "groceries", "shopping", "transit", "activities", "sightseeing", "gas", "other"], description: "Restaurants/cafés = food; convenience store or supermarket food = groceries; bars = drinks." },
      items: {
        type: "array",
        description: "Every purchased line, in order. Discounts as their own line with a negative price. Don't include subtotal/tax/tip/total/payment lines.",
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
      tip: { type: "number", description: "Tip / gratuity / service charge added." },
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
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      // Reading small print and translating: the bigger model is worth it here
      model: env.RECEIPT_MODEL || "claude-sonnet-5-5",
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
              text: `Read this receipt${body.trip?.destination ? ` (from a trip to ${body.trip.destination})` : ""}. List every item line with its price. Note whether tax is added on top (Canada/US style) or already included in the prices.`,
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return error(502, "Couldn't read the receipt");
  const data = (await res.json()) as { content: { type: string; input?: Record<string, unknown> }[] };
  const out = data.content.find((c) => c.type === "tool_use")?.input;
  if (!out || out.readable === false) return error(422, "That doesn't look like a readable receipt");
  return Response.json(out);
}
