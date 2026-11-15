// PROTOTYPE (proto/trip-focus): floating A/B switch for the trip page, only in dev builds (localhost).
import { FlaskConical } from "lucide-react";
import { PROTO_ENABLED, useTripLayout, type TripLayout } from "../../../lib/protoTripLayout";

const OPTIONS: { v: TripLayout; label: string; hint: string }[] = [
  { v: "current", label: "Current", hint: "His original trip page" },
  { v: "a", label: "A", hint: "Pick a day: the plan and map show only that day" },
  { v: "b", label: "B", hint: "No sidebar: the plan pane is the navigation, with ideas beside each day" },
];

export function LayoutSwitch() {
  const [layout, setLayout] = useTripLayout();
  if (!PROTO_ENABLED) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface/95 p-1 text-xs shadow-xl backdrop-blur max-md:hidden">
      <span className="flex items-center gap-1 px-2 text-muted">
        <FlaskConical className="size-3.5" /> Trip layout
      </span>
      {OPTIONS.map((o) => (
        <button
          key={o.v}
          title={o.hint}
          onClick={() => setLayout(o.v)}
          className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${layout === o.v ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
