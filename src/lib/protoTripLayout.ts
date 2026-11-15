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

// Idea card style: "details" = folded card plus a Details appendix; "zones" = the same four zones fold and unfold in place
export type CardStyle = "details" | "zones";
const CARD_KEY = "proto:idea-card";
const CARD_EVENT = "proto-idea-card";
function readCard(): CardStyle {
  try {
    return localStorage.getItem(CARD_KEY) === "details" ? "details" : "zones";
  } catch {
    return "zones";
  }
}
export function useCardStyle(): [CardStyle, (v: CardStyle) => void] {
  const [v, setV] = useState(readCard);
  useEffect(() => {
    const on = () => setV(readCard());
    window.addEventListener(CARD_EVENT, on);
    return () => window.removeEventListener(CARD_EVENT, on);
  }, []);
  const set = (next: CardStyle) => {
    try {
      localStorage.setItem(CARD_KEY, next);
    } catch {
      /* private mode */
    }
    setV(next);
    window.dispatchEvent(new Event(CARD_EVENT));
  };
  return [v, set];
}
