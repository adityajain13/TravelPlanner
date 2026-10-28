import { formatMoney } from "../../lib/fx";
import type { TripState } from "../../lib/trips";

/** "¥2,340 · 2 receipts" on a stop's card (nothing when the stop has no receipts). */
export function receiptsLabel(expenses: TripState["expenses"], itemId: string) {
  const rs = expenses.filter((e) => e.kind === "receipt" && e.itemId === itemId);
  if (!rs.length) return undefined;
  const cur = rs[0].currency;
  const sum = rs.every((e) => e.currency === cur) ? formatMoney(rs.reduce((a, e) => a + e.amount, 0), cur) : `${rs.length} receipts`;
  return rs.length > 1 && !sum.endsWith("receipts") ? `${sum} · ${rs.length} receipts` : sum;
}
