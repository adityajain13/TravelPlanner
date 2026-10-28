import { api } from "./api";
import type { ExpenseCategory, Item, Receipt, ReceiptItem } from "./trips";

export interface ParsedReceipt {
  merchant?: string;
  address?: string;
  date?: string;
  time?: string;
  currency?: string;
  category?: ExpenseCategory;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  tax_included?: boolean;
  tip?: number;
  total?: number;
}

/** Photo → JPEG at most 1600 px on the long side (small enough to send, big enough to read). */
export async function photoToJpeg(file: File, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file).catch(() => null);
  const img =
    bmp ??
    (await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = URL.createObjectURL(file);
    }));
  const w = "width" in img ? img.width : 0;
  const h = "height" in img ? img.height : 0;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82).split(",")[1];
}

export const parseReceipt = (image: string, trip: { destination?: string; currency?: string }) =>
  api<ParsedReceipt>("/receipts/parse", { method: "POST", body: JSON.stringify({ image, trip }) });

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What each line really costs once tax and tip are spread over it: tax added on top (Canada/US)
 * goes onto the taxable lines in proportion to their price; the tip (and any gap left between
 * the lines and the total, like a service fee) onto every line in proportion.
 */
export function lineCosts(r: Pick<Receipt, "items" | "tax" | "tip" | "taxIncluded">, total?: number): number[] {
  const prices = r.items.map((i) => i.price);
  const sum = prices.reduce((a, b) => a + b, 0);
  const taxable = r.items.map((i) => i.taxable !== false);
  const taxBase = prices.reduce((a, p, k) => a + (taxable[k] ? p : 0), 0);
  const tax = r.taxIncluded ? 0 : (r.tax ?? 0);
  const withTax = prices.map((p, k) => p + (tax && taxBase ? (taxable[k] ? (tax * p) / taxBase : 0) : 0));
  const extra = (total != null ? total - sum - tax : (r.tip ?? 0)) || 0;
  return withTax.map((p, k) => p + (sum ? (extra * prices[k]) / sum : 0));
}

/** By-item split → each person's part (in the receipt currency), summing to the total. */
export function sharesByItem(r: Receipt, total: number): Record<string, number> {
  const costs = lineCosts(r, total);
  const out: Record<string, number> = {};
  r.items.forEach((it, k) => {
    const who = it.who?.length ? it.who : [];
    for (const t of who) out[t] = (out[t] ?? 0) + costs[k] / who.length;
  });
  for (const t of Object.keys(out)) out[t] = round2(out[t]);
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * The stop a receipt most likely belongs to: a name match on the receipt's day first, then any
 * day. "FamilyMart Shibuya 2-chome" ↔ stop "FamilyMart". Null when nothing is close.
 */
export function matchStop(merchant: string | undefined, date: string | undefined, items: Item[]): Item | null {
  if (!merchant) return null;
  const m = norm(merchant);
  const mt = new Set(m.split(" ").filter((w) => w.length > 1));
  let best: { it: Item; score: number } | null = null;
  for (const it of items) {
    if (it.kind !== "place" || it.section.startsWith("draft:")) continue;
    const n = norm(it.name);
    if (!n) continue;
    const nt = n.split(" ").filter((w) => w.length > 1);
    const overlap = nt.filter((w) => mt.has(w)).length / Math.max(1, Math.min(nt.length, mt.size));
    let score = n === m ? 1 : m.includes(n) || n.includes(m) ? 0.9 : overlap;
    if (date && it.section === `day:${date}`) score += 0.25;
    if (score >= 0.6 && (!best || score > best.score)) best = { it, score };
  }
  return best?.it ?? null;
}
