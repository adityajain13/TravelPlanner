import { useEffect, useState } from "react";
import { db } from "./db";

/*
 * Exchange rates from Frankfurter (European Central Bank reference rates, free, no key).
 * Cached per base currency in Dexie so budgets still convert offline; refreshed at most daily.
 */

export const CURRENCIES = [
  "CAD", "USD", "EUR", "GBP", "JPY", "KRW", "CNY", "HKD", "TWD", "SGD", "THB", "INR", "AUD", "NZD",
  "CHF", "SEK", "NOK", "DKK", "CZK", "HUF", "PLN", "MXN", "BRL", "TRY", "ZAR", "IDR", "MYR", "PHP",
];

interface RateRow {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

const DAY = 24 * 3600 * 1000;

export async function loadRates(base: string): Promise<RateRow | null> {
  const key = `fx:${base}`;
  const cached = (await db.settings.get(key))?.value as RateRow | undefined;
  if (cached && Date.now() - cached.fetchedAt < DAY) return cached;
  if (!navigator.onLine) return cached ?? null;
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`);
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { rates: Record<string, number> };
    const row: RateRow = { base, rates: { ...j.rates, [base]: 1 }, fetchedAt: Date.now() };
    await db.settings.put({ key, value: row });
    return row;
  } catch {
    return cached ?? null;
  }
}

/** Returns a converter into `base`; amounts in currencies without a rate come back as null. */
export function useConverter(base: string) {
  const [row, setRow] = useState<RateRow | null>(null);
  useEffect(() => {
    let alive = true;
    loadRates(base).then((r) => alive && setRow(r));
    return () => {
      alive = false;
    };
  }, [base]);
  return {
    ready: !!row,
    fetchedAt: row?.fetchedAt,
    convert: (amount: number, from: string): number | null => {
      if (from === base) return amount;
      const r = row?.rates[from]; // rates are "1 base = r from"
      return r ? amount / r : null;
    },
  };
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: ["JPY", "KRW", "IDR", "HUF", "TWD"].includes(currency) ? 0 : 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
