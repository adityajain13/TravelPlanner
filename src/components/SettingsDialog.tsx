import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Crosshair, PanelBottom, X } from "lucide-react";
import { useSettings, type Settings } from "../lib/settings";

/** App settings (this device). One section per setting; options as selectable cards. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, update] = useSettings();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const options: { key: Settings["pinClick"]; icon: React.ReactNode; short: string; title: string; hint: string }[] = [
    { key: "focus", icon: <Crosshair />, short: "Zoom", title: "Zoom to the pin", hint: "Centres and zooms on it, then opens its card" },
    { key: "card", icon: <PanelBottom />, short: "Card", title: "Just open the card", hint: "Opens its card; the map stays where it is" },
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

        {/* Label on the left, a two-way segmented switch on the right */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[15px] font-bold">Clicking a pin on the map</p>
            <p className="mt-0.5 text-[13px] text-muted">{options.find((o) => o.key === settings.pinClick)!.hint}</p>
          </div>
          <div className="flex shrink-0 rounded-lg border border-line bg-bg p-0.5" role="radiogroup" aria-label="Clicking a pin on the map">
            {options.map((o) => {
              const on = settings.pinClick === o.key;
              return (
                <button
                  key={o.key}
                  role="radio"
                  aria-checked={on}
                  title={o.title}
                  onClick={() => update({ pinClick: o.key })}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold tracking-wider uppercase transition-colors [&>svg]:size-3.5 ${
                    on ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
                  }`}
                >
                  {o.icon}
                  {o.short}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-5 text-[12px] text-muted">Settings are saved on this device.</p>
      </div>
    </div>,
    document.body,
  );
}
