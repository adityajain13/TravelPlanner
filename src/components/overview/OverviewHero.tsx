import { Photo } from "../Photo";
import { formatRange } from "../../lib/dates";
import type { TripMeta } from "../../lib/trips";
import type { Overview } from "../../lib/overview";

/** Title, dates, countdown and how planned the trip is; the cover photo sits beside it (on top on phones). */
export function OverviewHero({ meta, o }: { meta: TripMeta; o: Overview }) {
  const planned = Math.round(o.pct * 100);
  const attention = o.attention === 0 ? "Nothing needs attention" : `${o.attention} ${o.attention === 1 ? "thing needs" : "things need"} attention`;
  return (
    <section className="order-1 grid overflow-hidden rounded-3xl border border-line lg:col-span-2 lg:order-none lg:grid-cols-2">
      <div className="flex flex-col justify-between gap-6 bg-accent p-6 text-on-accent sm:p-8">
        <div>
          <p className="text-[12px] font-bold tracking-wider uppercase opacity-80">
            Trip overview · {o.travelers} {o.travelers === 1 ? "traveler" : "travelers"}
          </p>
          <h1 className="font-display mt-1 text-[32px] leading-tight sm:text-[40px]">{meta.title}</h1>
          <p className="mt-2 text-[15px]">
            {formatRange(meta.startDate, meta.endDate)} · <b>{o.countdown}</b>
          </p>
        </div>
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-on-accent/25">
            <div className="h-full rounded-full bg-on-accent" style={{ width: `${planned}%` }} />
          </div>
          <p className="mt-2 text-[13px] opacity-90">
            {planned}% planned · {attention}
          </p>
        </div>
      </div>
      <div className="order-first h-40 bg-linear-to-br from-accent/30 to-surface-2 lg:order-none lg:h-auto">
        {meta.cover && <Photo srcs={[meta.cover.url, meta.cover.thumb]} className="size-full object-cover" />}
      </div>
    </section>
  );
}
