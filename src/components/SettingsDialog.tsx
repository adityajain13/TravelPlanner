import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Crosshair, Moon, MoonStar, PanelBottom, Sun, X } from "lucide-react";
import { useTheme, type Theme } from "../lib/theme";
import { useSettings, type Settings } from "../lib/settings";

/** App settings (this device). One section per setting; options as selectable cards. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, update] = useSettings();
  const [theme, , setTheme] = useTheme();
  const themes: { key: Theme; icon: React.ReactNode; short: string; hint: string }[] = [
    { key: "light", icon: <Sun />, short: "Light", hint: "Light background" },
    { key: "dark", icon: <Moon />, short: "Dark", hint: "Dark grey background" },
    { key: "amoled", icon: <MoonStar />, short: "Black", hint: "True black, for OLED screens" },
  ];
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const options: { key: Settings["pinClick"]; icon: React.ReactNode; short: string; title: string; hint: string }[] = [
    { key: "focus", icon: <Crosshair />, short: "Zoom", title: "Zoom to the pin", hint: "Zooms in and opens its card" },
    { key: "card", icon: <PanelBottom />, short: "Card", title: "Just open the card", hint: "Opens its card; map stays put" },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100] grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-2xl max-sm:p-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl">Settings</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full border border-line text-muted hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <Row title="Appearance" hint={themes.find((t) => t.key === theme)!.hint} value={theme} options={themes} onPick={setTheme} />
        <div className="my-4 border-t border-line" />
        <Row title="Clicking a pin on the map" hint={options.find((o) => o.key === settings.pinClick)!.hint} value={settings.pinClick} options={options} onPick={(k) => update({ pinClick: k })} />
        <p className="mt-5 text-[12px] text-muted">Settings are saved on this device.</p>
      </div>
    </div>,
    document.body,
  );
}

/** A setting row: label + one-line description on the left, a sliding segmented switch on the right. */
function Row<K extends string>({ title, hint, value, options, onPick }: { title: string; hint: string; value: K; options: { key: K; icon: React.ReactNode; short: string }[]; onPick: (k: K) => void }) {
  const at = Math.max(0, options.findIndex((o) => o.key === value));
  return (
    <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
      <div className="min-w-0">
        <p className="text-[15px] font-bold">{title}</p>
        <p className="mt-0.5 truncate text-[13px] text-muted">{hint}</p>
      </div>
      <div
        className="relative grid shrink-0 rounded-lg border border-line bg-bg p-0.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={title}
      >
        {/* The green thumb slides between equal-width segments */}
        <span
          aria-hidden
          className="absolute inset-y-0.5 left-0.5 rounded-md bg-accent transition-transform duration-300 ease-out"
          style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${at * 100}%)` }}
        />
        {options.map((o) => {
          const on = value === o.key;
          return (
            <button
              key={o.key}
              role="radio"
              aria-checked={on}
              onClick={() => onPick(o.key)}
              className={`relative z-10 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold tracking-wider uppercase transition-colors duration-300 [&>svg]:size-3.5 ${on ? "text-on-accent" : "text-muted hover:text-fg"}`}
            >
              {o.icon}
              {o.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
