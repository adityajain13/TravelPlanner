// PROTOTYPE (proto/trip-focus): which trip-page layout to show. Dev builds only; remembered per browser.
import { useEffect, useState } from "react";

export type TripLayout = "current" | "a" | "b";
const KEY = "proto:trip-layout";
const EVENT = "proto-trip-layout";

export const PROTO_ENABLED = import.meta.env.DEV;

function read(): TripLayout {
  if (!PROTO_ENABLED) return "current";
  try {
    const v = localStorage.getItem(KEY);
    return v === "a" || v === "b" || v === "current" ? v : "a";
  } catch {
    return "a";
  }
}

export function useTripLayout(): [TripLayout, (v: TripLayout) => void] {
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const set = (next: TripLayout) => {
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
