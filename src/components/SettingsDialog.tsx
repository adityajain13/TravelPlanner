import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair, EyeOff, Moon, MoonStar, PanelBottom, PanelLeft, PanelLeftDashed, Plane, RectangleHorizontal, Pill, Clock, Hourglass, Sun, X, Sparkles, Loader2, Check, Luggage } from "lucide-react";
import { useIsPhone, useTravelMode } from "../lib/travelMode";
import type * as Y from "yjs";
import { readTrip } from "../lib/trips";
import { withNotes, tidyNotes } from "../lib/tidyNotes";
import { useTheme, type Theme } from "../lib/theme";
import { useSettings, type Settings, type SettingsScope } from "../lib/settings";

/** App settings (this device). One section per setting; options as selectable cards. */
export function SettingsDialog({ onClose, scope }: { onClose: () => void; scope?: SettingsScope | null }) {
  const [settings, update, where] = useSettings(scope);
  const [theme, , setTheme] = useTheme();
  const [travel, setTravel] = useTravelMode();
  const phone = useIsPhone();
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
      <div role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-line bg-surface p-6 shadow-2xl max-sm:p-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl">Settings</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full border border-line text-muted hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <Row title="Appearance" hint={themes.find((t) => t.key === theme)!.hint} value={theme} options={themes} onPick={setTheme} />
        {phone && (
          <>
            <div className="my-4 border-t border-line" />
            <Row
              title="Travel mode"
              hint={travel ? "Today first, big buttons, no photos" : "Quick and light on battery, for the road"}
              value={travel ? "on" : "off"}
              options={[
                { key: "off", icon: <PanelBottom />, short: "Off" },
                { key: "on", icon: <Luggage />, short: "On" },
              ]}
              onPick={(k) => (setTravel(k === "on"), k === "on" && onClose())}
            />
          </>
        )}
        <div className="my-4 border-t border-line" />
        <Row title="Clicking a pin on the map" hint={options.find((o) => o.key === settings.pinClick)!.hint} value={settings.pinClick} options={options} onPick={(k) => update({ pinClick: k })} />
        <div className="my-4 border-t border-line" />
        <Row
          title="Flight paths on the map"
          hint={settings.flightPaths === "show" ? "Arcs between the airports you fly" : "Airport pins only, no arcs"}
          value={settings.flightPaths}
          options={[
            { key: "show", icon: <Plane />, short: "Show" },
            { key: "hide", icon: <EyeOff />, short: "Hide" },
          ]}
          onPick={(k) => update({ flightPaths: k })}
        />
        <div className="my-4 border-t border-line" />
        <Row
          title="Contents column"
          hint={settings.contentsWidth === "thick" ? "Every day with its stops" : "Icons and day numbers only"}
          value={settings.contentsWidth}
          options={[
            { key: "thick", icon: <PanelLeft />, short: "Thick" },
            { key: "thin", icon: <PanelLeftDashed />, short: "Thin" },
          ]}
          onPick={(k) => update({ contentsWidth: k })}
        />
        <div className="my-4 border-t border-line" />
        <Row
          title="Bookings in a day"
          hint={settings.bookingStyle === "card" ? "Slim cards, lined up with the stops" : "Small pills under the stops"}
          value={settings.bookingStyle}
          options={[
            { key: "card", icon: <RectangleHorizontal />, short: "Card" },
            { key: "pill", icon: <Pill />, short: "Pill" },
          ]}
          onPick={(k) => update({ bookingStyle: k })}
        />
        <div className="my-4 border-t border-line" />
        <Row
          title="Stop times"
          hint={settings.timing === "set" ? "You type each stop's start and end" : "From how long each stop takes + travel"}
          value={settings.timing}
          options={[
            { key: "set", icon: <Clock />, short: "Set" },
            { key: "auto", icon: <Hourglass />, short: "Auto" },
          ]}
          onPick={(k) => update({ timing: k })}
        />
        {scope && <TidyNotesRow doc={scope.doc} />}
        <p className="mt-5 text-[12px] text-muted">
          {where === "trip" ? "Saved to your account for this trip; appearance is saved on this device." : "Settings are saved on this device."}
        </p>
      </div>
    </div>,
    document.body,
  );
}

/** One-off action: put every emailed booking's notes in the standard layout again. */
function TidyNotesRow({ doc }: { doc: Y.Doc }) {
  const [run, setRun] = useState<{ done: number; total: number; changed?: number; failed?: number } | null>(null);
  const count = withNotes(readTrip(doc).reservations).length;
  const busy = run != null && run.changed == null;
  const go = async () => {
    const list = withNotes(readTrip(doc).reservations);
    setRun({ done: 0, total: list.length });
    const { changed, failed } = await tidyNotes(doc, list, (done, total) => setRun({ done, total }));
    setRun({ done: list.length, total: list.length, changed, failed });
  };
  return (
    <>
      <div className="my-4 border-t border-line" />
      <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
        <div className="min-w-0">
          <p className="text-[15px] font-bold">Booking notes</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {busy
              ? `Formatting ${run.done + 1} of ${run.total}…`
              : run?.changed != null
                ? [run.changed ? `Reformatted ${run.changed} of ${run.total}` : "Already in the standard layout", run.failed ? `${run.failed} couldn't be reached, try again` : ""].filter(Boolean).join(" · ")
                : count
                  ? `Seat, class, baggage… in one layout (${count} with notes)`
                  : "No booking notes yet"}
          </p>
        </div>
        <button
          onClick={go}
          disabled={busy || !count || !navigator.onLine}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-1.5 text-[12px] font-bold tracking-wider text-fg uppercase transition-colors hover:border-accent/60 disabled:opacity-50 [&>svg]:size-3.5"
        >
          {busy ? <Loader2 className="animate-spin" /> : run?.changed != null ? <Check className="text-accent" /> : <Sparkles className="text-accent" />}
          {busy ? "Working" : "Format now"}
        </button>
      </div>
    </>
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
