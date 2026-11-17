// Which trip-page layout to show. Chosen in Settings (per device) in every build; remembered per browser.
import { useEffect, useState } from "react";

export type TripLayout = "current" | "a" | "b";
const KEY = "proto:trip-layout";
const EVENT = "proto-trip-layout";

/** The floating dev switch (LayoutSwitch) only shows in dev builds; the layout itself works everywhere. */
export const PROTO_ENABLED = import.meta.env.DEV;

function read(): TripLayout {
  try {
    const v = localStorage.getItem(KEY);
    return v === "a" || v === "b" || v === "current" ? v : "current";
  } catch {
    return "current";
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

// Who "I" am on each trip (for Ideas votes and interest), kept per device. Falls back to the first person.
const ME_KEY = (tripId?: string) => `tp-me-${tripId ?? ""}`;
const ME_EVENT = "tp-me";
function readMe(tripId?: string): string | undefined {
  try {
    return localStorage.getItem(ME_KEY(tripId)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function useMe(tripId: string | undefined, people: string[]): [string | undefined, (who: string) => void] {
  const [stored, setStored] = useState(() => readMe(tripId));
  useEffect(() => {
    const on = () => setStored(readMe(tripId));
    setStored(readMe(tripId));
    window.addEventListener(ME_EVENT, on);
    return () => window.removeEventListener(ME_EVENT, on);
  }, [tripId]);
  const me = stored && people.includes(stored) ? stored : people[0];
  const set = (who: string) => {
    try {
      localStorage.setItem(ME_KEY(tripId), who);
    } catch {
      /* private mode: just this page view */
    }
    setStored(who);
    window.dispatchEvent(new Event(ME_EVENT));
  };
  return [me, set];
}

// Idea card style: "details" = folded card plus a Details appendix; "zones" = the same four zones fold and unfold in place
export type CardStyle = "details" | "zones" | "fit";
const CARD_KEY = "proto:idea-card";
const CARD_EVENT = "proto-idea-card";
function readCard(): CardStyle {
  try {
    const v = localStorage.getItem(CARD_KEY);
    return v === "details" || v === "zones" ? v : "fit";
  } catch {
    return "fit";
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
