import { useEffect, useState } from "react";

/*
 * Travel mode (phones): a light, read-first view of the trip for when you're on the road.
 * Per device, like the theme: it's about this phone's battery and screen.
 */
const KEY = "tp-travel-mode";
const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export function useTravelMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(read);
  useEffect(() => {
    const sync = () => setOn(read());
    window.addEventListener("tp-travel-mode", sync);
    window.addEventListener("storage", sync);
    return () => (window.removeEventListener("tp-travel-mode", sync), window.removeEventListener("storage", sync));
  }, []);
  const set = (v: boolean) => {
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* private mode: this visit only */
    }
    setOn(v);
    window.dispatchEvent(new Event("tp-travel-mode"));
  };
  return [on, set];
}

/** Phone-sized screen (the app's mobile layout). */
export function useIsPhone() {
  const q = "(max-width: 767px)";
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return m;
}
