import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { edit } from "./trips";

/**
 * Preferences. Inside a trip they're saved per account in the trip doc (map "prefs": email →
 * settings), so they follow you to every device and each trip keeps its own. Outside a trip, or
 * where you can't edit the trip (view-only), they live on this device; the device copy is also
 * where a trip you haven't set anything on yet starts from.
 */
export interface Settings {
  /** Clicking a pin on the map: zoom to it and open its card, or just open the card. */
  pinClick: "focus" | "card";
  /** Draw flight arcs between airports on the map. */
  flightPaths: "show" | "hide";
  /** Wide screens: the contents column with every day and its stops, or a thin icon rail. */
  contentsWidth: "thick" | "thin";
  /** Bookings inside a day (flights, check-ins…): slim cards like the stops, or small pills. */
  bookingStyle: "card" | "pill";
  /** Stop times typed in, or worked out from how long each stop takes plus the routes. */
  timing: "set" | "auto";
}

const KEY = "tp-settings";
const DEFAULTS: Settings = { pinClick: "focus", flightPaths: "show", contentsWidth: "thick", bookingStyle: "card", timing: "set" };

const readDevice = (): Settings => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
};
const writeDevice = (s: Settings) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: still applies for this visit */
  }
};

/** Where settings are saved: this trip's doc for this account (null = this device). */
export interface SettingsScope {
  doc: Y.Doc;
  email: string;
}

const readTrip = (sc: SettingsScope): Settings => {
  const saved = sc.doc.getMap<Partial<Settings>>("prefs").get(sc.email);
  return { ...readDevice(), ...(saved ?? {}) };
};

/** `where` tells the settings dialog what it's saving to. */
export function useSettings(scope?: SettingsScope | null): [Settings, (patch: Partial<Settings>) => void, "trip" | "device"] {
  const doc = scope?.doc;
  const email = scope?.email;
  const [s, setS] = useState(() => (scope ? readTrip(scope) : readDevice()));
  useEffect(() => {
    const sc = doc && email ? { doc, email } : null;
    const refresh = () => setS(sc ? readTrip(sc) : readDevice());
    refresh();
    const sync = (e: StorageEvent) => e.key === KEY && refresh();
    window.addEventListener("storage", sync);
    window.addEventListener("tp-settings", refresh);
    const prefs = sc?.doc.getMap("prefs");
    prefs?.observe(refresh); // changed on another device, or in another tab
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("tp-settings", refresh);
      prefs?.unobserve(refresh);
    };
  }, [doc, email]);
  const update = (patch: Partial<Settings>) => {
    const sc = doc && email ? { doc, email } : null;
    const next = { ...(sc ? readTrip(sc) : readDevice()), ...patch };
    writeDevice(next); // also the starting point for trips with nothing set yet
    if (sc) {
      const prefs = sc.doc.getMap<Partial<Settings>>("prefs");
      // Not in the undo scope: Undo is for the itinerary, not for flipping a setting
      edit(sc.doc, () => prefs.set(sc.email, { ...(prefs.get(sc.email) ?? {}), ...patch }));
    }
    setS(next);
    window.dispatchEvent(new Event("tp-settings"));
  };
  return [s, update, scope ? "trip" : "device"];
}
