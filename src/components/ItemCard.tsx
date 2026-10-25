import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, ExternalLink, GripVertical, ImagePlus, StickyNote, Trash2, Wallet } from "lucide-react";
import { ImagePicker } from "./ImagePicker";
import { Photo } from "./Photo";
import { PhotoCredit } from "./PhotoCredit";
import { CURRENCIES, formatMoney } from "../lib/fx";
import type { Item } from "../lib/trips";
import { googleMapsLink } from "../lib/photon";
import { GoogleDetails } from "./GoogleDetails";

interface Props {
  item: Item;
  number?: number;
  color: string;
  selected: boolean;
  readOnly?: boolean;
  /** Trip currency, the default for a new cost. */
  currency?: string;
  /** Usually the trip destination; added to photo searches ("Strokkur Iceland"). */
  searchContext?: string;
  onSelect: () => void;
  onChange: (patch: Partial<Item>) => void;
  onDelete: () => void;
}

/** Wanderlog-style teardrop marker with the stop number, in the day's colour. */
export function PinMarker({ color, label, size = 28 }: { color: string; label?: string | number; size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 28 34" className="shrink-0 drop-shadow-sm" aria-hidden>
      <path d="M14 33c-1-3.2-3.4-6-6.2-8.8A12.5 12.5 0 1 1 26.5 14c0 3.7-1.6 7-4.3 10.2C19.4 27 17 29.8 14 33z" fill={color} stroke="rgb(0 0 0 / .35)" strokeWidth="1" />
      <text x="14" y="18.3" textAnchor="middle" fontSize={String(label ?? "").length > 1 ? 10.5 : 12.5} fontWeight="700" fill="#0e1110" fontFamily="Manrope Variable, system-ui">
        {label ?? "•"}
      </text>
    </svg>
  );
}

export function ItemCard({ item, number, color, selected, readOnly, currency = "CAD", searchContext, onSelect, onChange, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: readOnly });
  const style = { transform: CSS.Translate.toString(transform), transition };
  const [picking, setPicking] = useState(false);
  const isPlace = item.kind === "place";
  const subtitle = [item.category, item.address?.split(",").slice(0, 2).join(",")].filter(Boolean).join(" · ");

  return (
    <div ref={setNodeRef} style={style} id={`item-${item.id}`} className={`group relative flex items-start gap-2 py-1 ${isDragging ? "z-10 opacity-40" : ""}`}>
      {!readOnly && (
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-1/2 -left-3 flex w-4 -translate-y-1/2 cursor-grab touch-none text-muted/50 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing max-md:opacity-100"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
      )}

      <div className="mt-2.5 w-7 shrink-0">
        {isPlace ? <PinMarker color={color} label={number} /> : <StickyNote className="mx-auto mt-0.5 size-5 text-muted" />}
      </div>

      <div
        onClick={onSelect}
        className={`flex min-w-0 flex-1 cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
          selected ? "border-accent/60 bg-surface-2" : isPlace ? "border-line/70 bg-surface hover:border-line hover:bg-surface-2/60" : "border-transparent hover:bg-surface-2/50"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`leading-snug ${isPlace ? "text-[15px] font-semibold" : "text-sm"}`}>{item.name}</p>
            <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
              {isPlace && (
                <a
                  href={googleMapsLink(item)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
                  title="Open in Google Maps"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
              {!readOnly && (
                <button onClick={(e) => (e.stopPropagation(), onDelete())} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger" title="Remove">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </div>
          {isPlace && subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
          {!selected && item.notes && <p className="mt-1.5 line-clamp-2 text-sm whitespace-pre-line text-muted">{item.notes}</p>}

          {!selected && (item.startTime || item.cost != null) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {item.startTime && (
                <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-muted">
                  <Clock className="size-3" /> {item.startTime}
                  {item.endTime ? `–${item.endTime}` : ""}
                </span>
              )}
              {item.cost != null && (
                <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-muted">
                  <Wallet className="size-3" /> {formatMoney(item.cost, item.costCurrency ?? currency)}
                </span>
              )}
            </div>
          )}

          {selected && (
            <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
              {isPlace && (
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <Clock className="size-3.5" />
                  <TimeInput disabled={readOnly} value={item.startTime} onCommit={(v) => onChange({ startTime: v })} />
                  <span>–</span>
                  <TimeInput disabled={readOnly} value={item.endTime} onCommit={(v) => onChange({ endTime: v })} />
                </div>
              )}
              {(item.cost != null || !readOnly) && (
                <CostInput
                  disabled={readOnly}
                  amount={item.cost}
                  currency={item.costCurrency ?? currency}
                  onCommit={(cost, costCurrency) => onChange({ cost, costCurrency: cost == null || costCurrency === currency ? undefined : costCurrency })}
                />
              )}
              {isPlace && <GoogleDetails item={item} onLink={(googlePlaceId) => onChange({ googlePlaceId })} />}
              {item.image && <PhotoCredit img={item.image} className="block truncate text-[11px] text-muted" />}
              {(item.notes || !readOnly) && <NotesInput disabled={readOnly} value={item.notes ?? ""} onCommit={(v) => onChange({ notes: v })} />}
            </div>
          )}
        </div>

        {isPlace && (item.image || (selected && !readOnly)) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!readOnly) setPicking(true);
              else if (item.image?.link) window.open(item.image.link, "_blank", "noopener");
            }}
            className={`relative size-[72px] shrink-0 overflow-hidden rounded-lg sm:size-20 ${item.image ? "bg-surface-2" : "border border-dashed border-line text-muted hover:border-accent hover:text-fg"}`}
            title={item.image ? item.image.credit ?? "Photo" : "Add a photo"}
          >
            {item.image ? (
              <Photo srcs={[item.image.thumb, item.image.url]} className="size-full object-cover" />
            ) : (
              <span className="flex size-full flex-col items-center justify-center gap-1 text-[10px]">
                <ImagePlus className="size-4" /> Photo
              </span>
            )}
          </button>
        )}
      </div>

      {picking && (
        <ImagePicker
          initialQuery={[item.name, searchContext].filter(Boolean).join(" ")}
          name={item.name}
          coords={item.lat != null && item.lng != null ? [item.lng, item.lat] : undefined}
          current={item.image}
          onPick={(image) => onChange({ image })}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function CostInput({ amount, currency, disabled, onCommit }: { amount?: number; currency: string; disabled?: boolean; onCommit: (a: number | undefined, c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted">
      <Wallet className="size-3.5" />
      <input
        type="number"
        min="0"
        step="any"
        disabled={disabled}
        key={amount}
        defaultValue={amount ?? ""}
        placeholder="Cost"
        onBlur={(e) => {
          const v = e.target.value === "" ? undefined : Number(e.target.value);
          if (v !== amount) onCommit(v, currency);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-24 rounded-md bg-transparent px-1 py-0.5 text-fg outline-none placeholder:text-muted/60 focus:bg-surface"
      />
      <select
        disabled={disabled}
        value={currency}
        onChange={(e) => amount != null && onCommit(amount, e.target.value)}
        className="rounded-md bg-transparent py-0.5 text-fg outline-none focus:bg-surface"
      >
        {CURRENCIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}

function TimeInput({ value, onCommit, disabled }: { value?: string; onCommit: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      type="time"
      disabled={disabled}
      defaultValue={value ?? ""}
      key={value}
      onBlur={(e) => e.target.value !== (value ?? "") && onCommit(e.target.value)}
      className="rounded-md bg-transparent px-1 py-0.5 text-fg outline-none focus:bg-surface"
    />
  );
}

/** Local draft while typing; writes to the doc on blur so remote edits don't fight the cursor. */
function NotesInput({ value, onCommit, disabled }: { value: string; onCommit: (v: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);
  return (
    <textarea
      readOnly={disabled}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (draft !== value) onCommit(draft);
      }}
      rows={Math.min(6, Math.max(1, draft.split("\n").length))}
      placeholder="Add notes, links, reservation numbers…"
      className="w-full resize-none rounded-lg bg-surface px-2.5 py-1.5 text-sm text-fg outline-none placeholder:text-muted/60 focus:ring-1 focus:ring-accent/50"
    />
  );
}
