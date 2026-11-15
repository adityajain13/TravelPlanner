// PROTOTYPE (proto/new-trip): floating A/B switch, only in dev builds (localhost).
import { FlaskConical } from "lucide-react";
import { PROTO_ENABLED, useNewTripVariant, type NewTripVariant } from "../../lib/protoVariant";

const OPTIONS: { v: NewTripVariant; label: string; hint: string }[] = [
  { v: "current", label: "Current", hint: "His original pop-up" },
  { v: "a", label: "A", hint: "Full page, continues into the trip" },
  { v: "b", label: "B", hint: "Wide pop-up with globe" },
];

export function VariantSwitch() {
  const [variant, setVariant] = useNewTripVariant();
  if (!PROTO_ENABLED) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[60] flex items-center gap-1 rounded-full border border-line bg-surface/95 p-1 text-xs shadow-xl backdrop-blur">
      <span className="flex items-center gap-1 px-2 text-muted">
        <FlaskConical className="size-3.5" /> New trip
      </span>
      {OPTIONS.map((o) => (
        <button
          key={o.v}
          title={o.hint}
          onClick={() => setVariant(o.v)}
          className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${variant === o.v ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
