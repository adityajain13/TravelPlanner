import { useEffect, useState } from "react";

/** "amoled" is dark with true-black surfaces (pixels off on OLED screens). */
export type Theme = "dark" | "amoled" | "light";
export const isDark = (t: Theme) => t !== "light";

const BAR: Record<Theme, string> = { dark: "#0e1110", amoled: "#000000", light: "#f6f5f0" };
/** The toggle cycles dark → black → light. */
export const NEXT: Record<Theme, Theme> = { dark: "amoled", amoled: "light", light: "dark" };
export const THEME_LABEL: Record<Theme, string> = { dark: "Dark mode", amoled: "Black mode", light: "Light mode" };

const read = (): Theme => {
  const c = document.documentElement.classList;
  return c.contains("amoled") ? "amoled" : c.contains("dark") ? "dark" : "light";
};

export function useTheme(): [Theme, () => void, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => {
    const c = document.documentElement.classList;
    c.toggle("dark", isDark(theme));
    c.toggle("amoled", theme === "amoled");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[theme]);
    try {
      localStorage.setItem("tp-theme", theme);
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new CustomEvent("tp-theme", { detail: theme })); // other hook users on this page
  }, [theme]);
  // Other tabs/pages using the hook stay in step
  useEffect(() => {
    const s = (e: StorageEvent) => e.key === "tp-theme" && e.newValue && setTheme(e.newValue as Theme);
    const here = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("storage", s);
    window.addEventListener("tp-theme", here);
    return () => (window.removeEventListener("storage", s), window.removeEventListener("tp-theme", here));
  }, []);
  return [theme, () => setTheme((t) => NEXT[t]), setTheme];
}
