import { useEffect, useState } from "react";

/** Per-device preferences (this browser only). */
export interface Settings {
  /** Clicking a pin on the map: zoom to it and open its card, or just open the card. */
  pinClick: "focus" | "card";
  /** Draw flight arcs between airports on the map. */
  flightPaths: "show" | "hide";
  /** Wide screens: the contents column with every day and its stops, or a thin icon rail. */
  contentsWidth: "thick" | "thin";
}

const KEY = "tp-settings";
const DEFAULTS: Settings = { pinClick: "focus", flightPaths: "show", contentsWidth: "thick" };

const read = (): Settings => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
};

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [s, setS] = useState(read);
  useEffect(() => {
    const sync = (e: StorageEvent) => e.key === KEY && setS(read());
    const local = () => setS(read());
    window.addEventListener("storage", sync);
    window.addEventListener("tp-settings", local);
    return () => (window.removeEventListener("storage", sync), window.removeEventListener("tp-settings", local));
  }, []);
  const update = (patch: Partial<Settings>) => {
    const next = { ...read(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: still applies for this visit */
    }
    setS(next);
    window.dispatchEvent(new Event("tp-settings"));
  };
  return [s, update];
}
