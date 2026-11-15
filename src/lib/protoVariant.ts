// PROTOTYPE (proto/new-trip): which new-trip variant to show. Dev builds only; remembered per browser.
import { useEffect, useState } from "react";

export type NewTripVariant = "current" | "a" | "b";
const KEY = "proto:new-trip";
const EVENT = "proto-variant";

export const PROTO_ENABLED = import.meta.env.DEV;

function read(): NewTripVariant {
  if (!PROTO_ENABLED) return "current";
  try {
    const v = localStorage.getItem(KEY);
    return v === "a" || v === "b" || v === "current" ? v : "a";
  } catch {
    return "a";
  }
}

export function useNewTripVariant(): [NewTripVariant, (v: NewTripVariant) => void] {
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const set = (next: NewTripVariant) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: just this page view */
    }
    setV(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [v, set];
}
