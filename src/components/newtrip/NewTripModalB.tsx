// PROTOTYPE (proto/new-trip) — Variant B: a wide pop-up. Form + inline calendar left, globe right.
// Phones: a plain full-screen form, no map.
import { X } from "lucide-react";
import { DestinationField } from "./DestinationField";
import { GlobeView } from "./GlobeView";
import { InlineRangeCalendar } from "./InlineRangeCalendar";
import { useNewTrip } from "./useNewTrip";
import { inputCls } from "../NewTripDialog";

export function NewTripModalB({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useNewTrip();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = await t.create();
    if (id) onCreated(id);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm md:p-6" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex size-full overflow-hidden border-line bg-surface shadow-2xl md:h-[min(720px,100%)] md:max-w-5xl md:rounded-2xl md:border"
      >
        <div className="flex w-full flex-col overflow-y-auto md:w-[420px] md:shrink-0">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-display text-2xl">Plan a new trip</h2>
            <button type="button" onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 space-y-5 px-6 py-5">
            <Label text="Where to?">
              <DestinationField autoFocus value={t.dest} onChange={t.setDest} onPreview={t.setPreview} />
            </Label>
            <Label text="Trip name (optional)">
              <input value={t.title} onChange={(e) => t.setTitle(e.target.value)} placeholder={t.autoTitle || "Trip to …"} className={inputCls} />
            </Label>
            <Label text="Dates">
              <InlineRangeCalendar start={t.startDate} end={t.endDate} onChange={t.setDates} months={1} />
            </Label>
          </div>
          <div className="sticky bottom-0 border-t border-line bg-surface px-6 py-4">
            <button disabled={!t.ready || t.busy} className="w-full rounded-xl bg-accent py-2.5 font-semibold text-on-accent transition-opacity disabled:opacity-40">
              {t.busy ? "Creating…" : "Start planning"}
            </button>
          </div>
        </div>
        <div className="relative hidden flex-1 border-l border-line bg-bg md:block">
          <GlobeView place={t.dest.place} preview={t.preview} />
        </div>
      </form>
    </div>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium tracking-wide text-muted uppercase">{text}</span>
      {children}
    </div>
  );
}
