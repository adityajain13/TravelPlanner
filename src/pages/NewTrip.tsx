// PROTOTYPE (proto/new-trip) — Variant A: setup happens in the trip page's own frame.
// Desktop: the plan panel (same widths as Trip.tsx) holds the hero + form, and the globe sits where the trip map will be.
// "Start planning" creates the trip and crossfades into /trip/:id (View Transitions), so the hero and map carry over.
// Phones: the globe fills the screen and the form sits in a card over its lower half.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { DestinationField } from "../components/newtrip/DestinationField";
import { GlobeView } from "../components/newtrip/GlobeView";
import { InlineRangeCalendar } from "../components/newtrip/InlineRangeCalendar";
import { useNewTrip } from "../components/newtrip/useNewTrip";
import { VariantSwitch } from "../components/newtrip/VariantSwitch";
import { inputCls } from "../components/NewTripDialog";
import { dtf } from "../lib/intl";
import { fromISO } from "../components/DatePicker";

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

export function NewTripPage() {
  const t = useNewTrip();
  const navigate = useNavigate();
  const desktop = useMedia("(min-width: 768px)");
  // Two months side by side only fit the widest plan panel (2xl: 680px)
  const twoMonths = useMedia("(min-width: 1536px)");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = await t.create();
    if (id) navigate(`/trip/${id}`, { replace: true, viewTransition: true });
  }
  const back = () => navigate("/", { viewTransition: true });

  const form = (
    <form onSubmit={submit} className="space-y-6">
      <Step n={1} text="Where are you going?">
        <DestinationField autoFocus={desktop} large value={t.dest} onChange={t.setDest} onPreview={t.setPreview} />
      </Step>
      <Step n={2} text="When?">
        <InlineRangeCalendar start={t.startDate} end={t.endDate} onChange={t.setDates} months={desktop && twoMonths ? 2 : 1} />
      </Step>
      <Step n={3} text="Name it" optional>
        <input value={t.title} onChange={(e) => t.setTitle(e.target.value)} placeholder={t.autoTitle || "Trip to …"} className={inputCls} />
      </Step>
      <button disabled={!t.ready || t.busy} className="w-full rounded-xl bg-accent py-3 font-semibold text-on-accent transition-opacity disabled:opacity-40">
        {t.busy ? "Creating…" : "Start planning"}
      </button>
    </form>
  );

  if (!desktop) {
    return (
      <div className="relative h-full overflow-hidden bg-bg">
        <div className="absolute inset-x-0 top-0 h-[52%]" style={{ viewTransitionName: "trip-map" }}>
          <GlobeView place={t.dest.place} preview={t.preview} padding={{ top: 70, bottom: 30, left: 30, right: 30 }} />
        </div>
        <button onClick={back} className="absolute top-4 left-4 z-10 grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <div className="absolute inset-x-0 bottom-0 flex h-[55%] flex-col rounded-t-3xl border-t border-line bg-bg shadow-[0_-12px_40px_rgb(0_0_0/.35)]">
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line" />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-8">
            <LiveTitle title={t.title || t.autoTitle} start={t.startDate} end={t.endDate} compact />
            <div className="mt-5">{form}</div>
          </div>
        </div>
        <VariantSwitch />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-row">
      <aside className="flex min-h-0 w-[480px] shrink-0 flex-col border-r border-line bg-bg lg:w-[540px] xl:w-[620px] 2xl:w-[680px]">
        <div className="min-h-0 flex-1 overflow-y-auto pb-24">
          {/* A plain title bar in the page's own colours: back link, then the trip's name and dates.
              The cover banner appears on the trip page once Start planning is pressed */}
          <header className="border-b border-line bg-surface px-5 pt-4 pb-5" style={{ viewTransitionName: "trip-hero" }}>
            <button onClick={back} className="-ml-1 flex items-center gap-1.5 rounded-full px-1 py-1 text-sm text-muted hover:text-fg">
              <ArrowLeft className="size-4" /> Your trips
            </button>
            <div className="mt-3">
              <LiveTitle title={t.title || t.autoTitle} start={t.startDate} end={t.endDate} compact inline />
            </div>
          </header>
          <div className="px-5 pt-6">{form}</div>
        </div>
      </aside>
      <main className="relative min-w-0 flex-1 bg-bg" style={{ viewTransitionName: "trip-map" }}>
        <GlobeView place={t.dest.place} preview={t.preview} padding={{ top: 24, bottom: 24, left: 24, right: 24 }} />
      </main>
      <VariantSwitch />
    </div>
  );
}

/** The hero's title + dates, filling in as the form is completed (`inline`: one row, for the compact header). */
function LiveTitle({ title, start, end, compact, inline }: { title: string; start: string; end: string; compact?: boolean; inline?: boolean }) {
  const s = fromISO(start);
  const e = fromISO(end);
  const label = s && e ? `${dtf(undefined, { month: "short", day: "numeric" }).format(s)} – ${dtf(undefined, { month: "short", day: "numeric", year: "numeric" }).format(e)}` : "";
  return (
    <div className={inline ? "flex items-end justify-between gap-3" : ""}>
      <p
        className={`min-w-0 truncate font-display leading-tight transition-opacity ${compact ? "text-2xl" : inline ? "text-[1.75rem] [text-shadow:0_1px_12px_rgb(0_0_0/.5)]" : "text-[2.25rem] [text-shadow:0_1px_12px_rgb(0_0_0/.5)]"} ${title ? "" : compact ? "text-muted" : "opacity-40"}`}
      >
        {title || (compact ? "New trip" : "Trip to …")}
      </p>
      <p
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[15px] font-semibold ${inline ? "mb-0.5" : "mt-2"} ${compact ? "bg-surface-2 px-3 py-1 text-sm" : "bg-black/35 text-white/90 backdrop-blur"}`}
      >
        <CalendarDays className="size-4 opacity-80" /> {label}
      </p>
    </div>
  );
}

function Step({ n, text, optional, children }: { n: number; text: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2.5 text-[15px] font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">{n}</span>
        {text}
        {optional && <span className="text-xs font-normal text-muted">optional</span>}
      </h3>
      {children}
    </section>
  );
}
