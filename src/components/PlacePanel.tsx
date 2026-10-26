import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Clock, ExternalLink, MapPin, Maximize2, Minimize2, Navigation, StickyNote, Wallet, X } from "lucide-react";
import type { Item } from "../lib/trips";
import { googleMapsLink } from "../lib/photon";
import { placeSummary } from "../lib/images";
import { formatMoney } from "../lib/fx";
import { Photo } from "./Photo";
import { PhotoCredit } from "./PhotoCredit";
import { PinMarker } from "./ItemCard";
import { GoogleDetails } from "./GoogleDetails";
import { SectionPicker, type SectionTarget } from "./SectionPicker";

export type PanelMode = "compact" | "full";

interface Props {
  item: Item;
  number?: number;
  color: string;
  /** Position among the places of its day/list, for "6 of 12". */
  index: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  mode: PanelMode;
  onMode: (m: PanelMode) => void;
  targets: SectionTarget[];
  onMoveTo: (section: string) => void;
  sections?: string[];
  onToggleSection?: (section: string) => void;
  onLink: (googlePlaceId: string) => void;
  onSnapshot?: (d: import("../lib/google").GoogleDetails) => void;
  readOnly?: boolean;
  currency: string;
  /** Previous stop, for the Directions link. */
  from?: { lat: number; lng: number };
  /** Reports the space the panel covers so the map can frame the pin around it. */
  onInset: (inset: { top: number; bottom: number }) => void;
}

/** Wanderlog-style place sheet over the map: compact card or full details; the mode sticks between pins. */
export function PlacePanel(p: Props) {
  const { item, mode } = p;
  const ref = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<{ text: string; url?: string } | null | undefined>(undefined);
  const coords: [number, number] | undefined = item.lat != null && item.lng != null ? [item.lng, item.lat] : undefined;

  useEffect(() => {
    let alive = true;
    setSummary(undefined);
    if (mode === "full" && item.kind === "place" && navigator.onLine) placeSummary(item.name, coords).then((s) => alive && setSummary(s));
    else setSummary(null);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.name, mode]);

  // Tell the map how much of it we cover
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      const parent = el.offsetParent?.getBoundingClientRect();
      if (!parent) return;
      p.onInset({ top: 0, bottom: parent.bottom - r.top }); // both modes sit at the bottom of the map
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") p.onClose();
      else if (e.key === "ArrowLeft") p.onPrev?.();
      else if (e.key === "ArrowRight") p.onNext?.();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [p]);

  const section = p.targets.find((t) => t.key === item.section);
  const nav = (
    <div className="flex items-center rounded-full bg-surface-2 text-[13px] font-semibold text-muted">
      <button onClick={p.onPrev} disabled={!p.onPrev} className="grid size-8 place-items-center rounded-full hover:text-fg disabled:opacity-30" aria-label="Previous place">
        <ChevronLeft className="size-4" />
      </button>
      <span className="tabular-nums">
        {p.index + 1} of {p.total}
      </span>
      <button onClick={p.onNext} disabled={!p.onNext} className="grid size-8 place-items-center rounded-full hover:text-fg disabled:opacity-30" aria-label="Next place">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
  const iconBtn = "grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg";

  if (mode === "compact") {
    return (
      <div ref={ref} className="absolute bottom-3 left-3 z-20 w-[min(440px,calc(100%-4.5rem))] rounded-2xl border border-line bg-surface/95 p-2.5 shadow-2xl backdrop-blur">
        <div className="flex gap-3">
          {item.image ? (
            <Photo srcs={[item.image.thumb, item.image.url]} className="size-20 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
              {item.kind === "place" ? <MapPin className="size-5" /> : <StickyNote className="size-5" />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1.5">
              {item.kind === "place" && <PinMarker color={p.color} label={p.number} size={18} />}
              <p className="min-w-0 flex-1 truncate text-[16px] leading-tight font-bold">{item.name}</p>
            </div>
            {/* Same category pill as the full card, then the address */}
            {(item.category || item.address) && (
              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                {item.category && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-muted capitalize">{item.category}</span>}
                {item.address && <span className="min-w-0 truncate text-[13px] text-muted">{item.address.split(",").slice(0, 3).join(",")}</span>}
              </div>
            )}
            <div className="mt-1.5 flex items-center justify-between gap-2">
              {nav}
              <div className="flex">
                <button onClick={() => p.onMode("full")} className={iconBtn} title="Show details" aria-label="Show details">
                  <Maximize2 className="size-4" />
                </button>
                <button onClick={p.onClose} className={iconBtn} title="Close" aria-label="Close">
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="absolute bottom-3 left-3 right-14 z-20 flex max-h-[min(58%,560px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface/97 shadow-2xl backdrop-blur max-sm:right-3">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        {nav}
        <div className="flex">
          <button onClick={() => p.onMode("compact")} className={iconBtn} title="Shrink" aria-label="Shrink">
            <Minimize2 className="size-4" />
          </button>
          <button onClick={p.onClose} className={iconBtn} title="Close" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto px-4 pt-3 pb-3.5">
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              {item.kind === "place" && <PinMarker color={p.color} label={p.number} size={22} />}
              <h2 className="text-[22px] leading-tight font-bold">{item.name}</h2>
            </div>
            {summary === undefined && item.kind === "place" ? (
              <div className="mt-2.5 space-y-1.5">
                <div className="h-3.5 w-full animate-pulse rounded bg-surface-2" />
                <div className="h-3.5 w-4/5 animate-pulse rounded bg-surface-2" />
              </div>
            ) : summary ? (
              <p className="mt-2 text-[15px] leading-relaxed text-fg/90">
                {summary.text}{" "}
                {summary.url && (
                  <a href={summary.url} target="_blank" rel="noreferrer" className="text-[13px] whitespace-nowrap text-muted underline-offset-2 hover:text-fg hover:underline">
                    Wikipedia
                  </a>
                )}
              </p>
            ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SectionPicker
            targets={p.targets}
            current={item.section}
            onPick={(k) => (p.onToggleSection ? p.onToggleSection(k) : k !== item.section && p.onMoveTo(k))}
            selected={p.onToggleSection ? p.sections : undefined}
            disabled={p.readOnly}
            className="rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-muted hover:border-accent hover:text-fg disabled:hover:border-line"
            title="Add to or remove from days and lists"
          >
            <Bookmark className="size-3.5" style={{ color: section?.color }} />
            {section ? `Added to ${section.label}` : "Added"}
            {p.sections && p.sections.length > 1 && <span className="text-accent">+{p.sections.length - 1}</span>}
          </SectionPicker>
          {item.category && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[13px] text-muted capitalize">{item.category}</span>}
          {item.address && (
            <span className="flex min-w-0 items-center gap-1.5 text-[14px] text-muted">
              <MapPin className="size-4 shrink-0" /> <span className="truncate">{item.address}</span>
            </span>
          )}
        </div>

        <ul className="mt-2.5 space-y-1.5 text-[14px] text-muted empty:hidden">
          {item.startTime && (
            <li className="flex gap-2">
              <Clock className="mt-0.5 size-4 shrink-0" /> {item.startTime}
              {item.endTime ? `–${item.endTime}` : ""}
            </li>
          )}
          {item.cost != null && (
            <li className="flex gap-2">
              <Wallet className="mt-0.5 size-4 shrink-0" /> {formatMoney(item.cost, item.costCurrency ?? p.currency)}
            </li>
          )}
          {item.notes && (
            <li className="flex gap-2">
              <StickyNote className="mt-0.5 size-4 shrink-0" /> <span className="whitespace-pre-line text-fg/90">{item.notes}</span>
            </li>
          )}
        </ul>

        {item.kind === "place" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
            {/* The Google details button sits first in the row; once loaded, its panel takes a full row below */}
            <div className="contents [&>div.space-y-2]:order-last [&>div.space-y-2]:basis-full">
              <GoogleDetails item={item} onLink={p.onLink} onSnapshot={p.onSnapshot} />
            </div>
            <a href={googleMapsLink(item)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-muted hover:border-accent hover:text-fg">
              <ExternalLink className="size-3.5" /> Google Maps
            </a>
            {p.from && coords && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&origin=${p.from.lat},${p.from.lng}&destination=${item.lat},${item.lng}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-muted hover:border-accent hover:text-fg"
              >
                <Navigation className="size-3.5" /> Directions from previous stop
              </a>
            )}
            {item.osmId && /^[NWR]\d+$/.test(item.osmId) && (
              <a
                href={`https://www.openstreetmap.org/${{ N: "node", W: "way", R: "relation" }[item.osmId[0] as "N" | "W" | "R"]}/${item.osmId.slice(1)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-muted hover:border-accent hover:text-fg"
              >
                <ExternalLink className="size-3.5" /> OpenStreetMap
              </a>
            )}
          </div>
        )}
          </div>
          {item.image && (
            <div className="w-36 shrink-0 max-sm:hidden">
              <Photo srcs={[item.image.url, item.image.thumb]} className="aspect-[4/3] w-full rounded-xl object-cover" />
              <PhotoCredit img={item.image} className="mt-1 block truncate text-[10.5px] text-muted" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
