import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, Crosshair, PanelBottom, X } from "lucide-react";
import { useSettings, type Settings } from "../lib/settings";

/** App settings (this device). One section per setting; options as selectable cards. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, update] = useSettings();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const options: { key: Settings["pinClick"]; icon: React.ReactNode; title: string; hint: string }[] = [
    { key: "focus", icon: <Crosshair />, title: "Zoom to the pin", hint: "The map centres and zooms on it, and its card opens" },
    { key: "card", icon: <PanelBottom />, title: "Just open the card", hint: "The map stays exactly where it is" },
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

        <p className="text-[15px] font-bold">Clicking a pin on the map</p>
        <div className="mt-2.5 space-y-2" role="radiogroup" aria-label="Clicking a pin on the map">
          {options.map((o) => {
            const on = settings.pinClick === o.key;
            return (
              <button
                key={o.key}
                role="radio"
                aria-checked={on}
                onClick={() => update({ pinClick: o.key })}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${on ? "border-accent bg-accent/10" : "border-line hover:border-muted"}`}
              >
                <span className={`shrink-0 [&>svg]:size-5 ${on ? "text-accent" : "text-muted"}`}>{o.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{o.title}</span>
                  <span className="block text-[13px] text-muted">{o.hint}</span>
                </span>
                <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${on ? "border-accent bg-accent text-on-accent" : "border-line"}`}>
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-5 text-[12px] text-muted">Settings are saved on this device.</p>
      </div>
    </div>,
    document.body,
  );
}
