import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bookmark, CheckSquare, Clock, Users, ListChecks, Plus, X, ExternalLink, GripVertical, ImagePlus, StickyNote, Trash2, Wallet } from "lucide-react";
import { ImagePicker } from "./ImagePicker";
import { Photo } from "./Photo";
import { PhotoCredit } from "./PhotoCredit";
import { CURRENCIES, formatMoney } from "../lib/fx";
import type { CheckItem, Item } from "../lib/trips";
import { fmtTime, TimeField } from "./TimeField";
import { googleMapsLink } from "../lib/photon";
import { GoogleDetails } from "./GoogleDetails";
import { SectionPicker, type SectionTarget } from "./SectionPicker";

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
  /** Multi-select */
  checked?: boolean;
  selecting?: boolean;
  onCheck?: (checked: boolean, shift: boolean) => void;
  /** Days and lists, for the "Added to ▾" menu */
  targets?: SectionTarget[];
  onMoveTo?: (section: string) => void;
  /** Open the budget editor (category, who paid, split) for this stop's cost. */
  onCostDetails?: () => void;
}

/** Wanderlog-style teardrop marker with the stop number, in the day's colour. */
export function PinMarker({ color, label, size = 28 }: { color: string; label?: string | number; size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 28 34" className="shrink-0 drop-shadow-sm" aria-hidden>
      <path d="M14 33c-1-3.2-3.4-6-6.2-8.8A12.5 12.5 0 1 1 26.5 14c0 3.7-1.6 7-4.3 10.2C19.4 27 17 29.8 14 33z" fill={color} stroke="rgb(0 0 0 / .35)" strokeWidth="1" />
      <text x="14" y="18.3" textAnchor="middle" fontSize={String(label ?? "").length > 1 ? 10.5 : 12.5} fontWeight="700" fill="#0e1110" fontFamily="Source Sans 3 Variable, system-ui">
        {label ?? "•"}
      </text>
    </svg>
  );
}

export function ItemCard(props: Props) {
  const sortable = useSortable({ id: props.item.id, disabled: props.readOnly });
  return <ItemCardView {...props} sortable={sortable} />;
}

/** The card as it looks while being dragged (rendered in the DragOverlay; no sortable hooks). */
export function ItemCardDragPreview(props: Pick<Props, "item" | "number" | "color" | "currency">) {
  return (
    <div className="rotate-[0.6deg] cursor-grabbing rounded-xl shadow-2xl ring-1 ring-accent/60">
      <ItemCardView {...props} selected={false} readOnly onSelect={() => undefined} onChange={() => undefined} onDelete={() => undefined} overlay />
    </div>
  );
}

function ItemCardView({
  item,
  number,
  color,
  selected,
  readOnly,
  currency = "CAD",
  searchContext,
  onSelect,
  onChange,
  onDelete,
  checked,
  selecting,
  onCheck,
  targets,
  onMoveTo,
  onCostDetails,
  sortable,
  overlay,
}: Props & { sortable?: ReturnType<typeof useSortable>; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable ?? ({} as Partial<ReturnType<typeof useSortable>>);
  const style = sortable ? { transform: CSS.Translate.toString(transform ?? null), transition } : undefined;
  const [picking, setPicking] = useState(false);
  const isPlace = item.kind === "place";
  const subtitle = [item.category && capitalize(item.category), item.address?.split(",").slice(0, 2).join(",")].filter(Boolean).join(" · ");

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={overlay ? undefined : `item-${item.id}`}
      className={`group relative flex items-start gap-2 py-1 ${overlay ? "bg-bg pr-1 pl-1" : ""} ${isDragging ? "z-10 opacity-30" : ""}`}
    >
      {!readOnly && sortable && (
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-1/2 -left-5 grid h-12 w-7 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-lg text-muted/60 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-2 hover:text-fg active:cursor-grabbing max-md:opacity-100"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-5" />
        </button>
      )}

      <div className="relative mt-2.5 w-7 shrink-0">
        {/* Hovering swaps the pin for a checkbox (multi-select); while selecting, every row shows one */}
        <div className={onCheck && (selecting || checked) ? "invisible" : onCheck ? "md:group-hover:invisible" : ""}>
          {isPlace ? (
            <PinMarker color={color} label={number} />
          ) : item.kind === "checklist" ? (
            <ListChecks className="mx-auto mt-0.5 size-5 text-muted" />
          ) : (
            <StickyNote className="mx-auto mt-0.5 size-5 text-muted" />
          )}
        </div>
        {onCheck && (
          <label
            onClick={(e) => e.stopPropagation()}
            className={`absolute inset-x-0 top-0.5 flex cursor-pointer justify-center ${selecting || checked ? "" : "invisible md:group-hover:visible"}`}
            title="Select"
          >
            <input
              type="checkbox"
              checked={!!checked}
              onChange={() => undefined}
              onClick={(e) => onCheck(!checked, (e as React.MouseEvent).shiftKey)}
              className="size-[18px] cursor-pointer rounded accent-[var(--accent)]"
              aria-label={`Select ${item.name}`}
            />
          </label>
        )}
      </div>

      <div
        onClick={isPlace ? onSelect : undefined}
        className={`flex min-w-0 flex-1 gap-3 rounded-xl border p-3 transition-colors ${isPlace ? "cursor-pointer" : ""} ${
          selected && isPlace
            ? "border-accent/60 bg-surface-2"
            : isPlace
              ? "border-line/70 bg-surface hover:border-line hover:bg-surface-2/60"
              : item.kind === "checklist"
                ? "border-line/70 bg-surface"
                : "border-transparent bg-surface-2/40 hover:bg-surface-2/70"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {isPlace ? (
              <p className="text-[17px] leading-snug font-bold">{item.name}</p>
            ) : item.kind === "checklist" ? (
              <ChecklistBody item={item} readOnly={readOnly} onChange={onChange} onDelete={onDelete} />
            ) : (
              <NoteBody text={item.name} readOnly={readOnly} onCommit={(name) => (name.trim() ? name !== item.name && onChange({ name }) : onDelete())} />
            )}
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
          {isPlace && subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
          {isPlace && !selected && item.notes && <p className="mt-1.5 line-clamp-3 text-[15px] leading-snug whitespace-pre-line text-muted">{item.notes}</p>}

          {isPlace && !selected && (item.startTime || item.cost != null) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[13px] font-semibold">
              {item.startTime && (
                <span className="flex items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-1 text-fg ring-1 ring-accent/25">
                  <Clock className="size-3.5 text-accent" /> {fmtTime(item.startTime)}
                  {item.endTime ? ` – ${fmtTime(item.endTime)}` : ""}
                </span>
              )}
              {item.cost != null && (
                <span className="flex items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-1 text-fg ring-1 ring-accent/25">
                  <Wallet className="size-3.5 text-accent" /> {formatMoney(item.cost, item.costCurrency ?? currency)}
                </span>
              )}
            </div>
          )}

          {selected && isPlace && (
            <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
              {!readOnly && (targets?.length || onCheck) && (
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  {targets && onMoveTo && (
                    <SectionPicker
                      targets={targets}
                      current={item.section}
                      onPick={(k) => k !== item.section && onMoveTo(k)}
                      className="rounded-full border border-line px-2.5 py-1 font-semibold text-muted hover:border-accent hover:text-fg"
                    >
                      <Bookmark className="size-3.5" />
                      {targets.find((t) => t.key === item.section)?.label ?? "Move to"}
                    </SectionPicker>
                  )}
                  {onCheck && !checked && (
                    <button onClick={() => onCheck(true, false)} className="flex items-center gap-1.5 rounded-full px-2 py-1 font-semibold text-muted hover:text-fg md:hidden">
                      <CheckSquare className="size-3.5" /> Select
                    </button>
                  )}
                </div>
              )}
              {isPlace && (
                <div className="flex items-center gap-1 text-[14px]">
                  <TimeField
                    disabled={readOnly}
                    value={item.startTime}
                    onChange={(v) => onChange({ startTime: v })}
                    placeholder="Start time"
                    className="rounded-full px-2.5 py-1 hover:bg-surface"
                  />
                  <span className="text-muted">–</span>
                  <TimeField
                    disabled={readOnly}
                    value={item.endTime}
                    near={item.startTime}
                    onChange={(v) => onChange({ endTime: v })}
                    placeholder="End time"
                    className="rounded-full px-2.5 py-1 hover:bg-surface"
                  />
                </div>
              )}
              {(item.cost != null || !readOnly) && (
                <div className="flex flex-wrap items-center gap-2">
                  <CostInput
                    disabled={readOnly}
                    amount={item.cost}
                    currency={item.costCurrency ?? currency}
                    onCommit={(cost, costCurrency) => onChange({ cost, costCurrency: cost == null || costCurrency === currency ? undefined : costCurrency })}
                  />
                  {item.cost != null && onCostDetails && !readOnly && (
                    <button onClick={onCostDetails} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold text-muted hover:bg-surface hover:text-fg">
                      <Users className="size-3.5" /> Category & split
                    </button>
                  )}
                </div>
              )}
              {/* Google details and the photo credit share a row */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 [&>div.space-y-2]:basis-full">
                {isPlace && <GoogleDetails item={item} onLink={(googlePlaceId) => onChange({ googlePlaceId })} />}
                {item.image && <PhotoCredit img={item.image} className="ml-auto truncate text-[11px] text-muted" />}
              </div>
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

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const newId = () => Math.random().toString(36).slice(2, 10);

/** A note: edits in place; empty notes remove themselves. */
function NoteBody({ text, readOnly, onCommit }: { text: string; readOnly?: boolean; onCommit: (t: string) => void }) {
  const [draft, setDraft] = useState(text);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(text);
  }, [text, focused]);
  if (readOnly) return <p className="min-w-0 flex-1 text-[15px] leading-relaxed whitespace-pre-line">{text}</p>;
  return (
    <textarea
      value={draft}
      autoFocus={!text}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => (setFocused(false), onCommit(draft))}
      onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLTextAreaElement).blur()}
      rows={Math.max(1, draft.split("\n").length)}
      placeholder="Write a note…"
      className="min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted/60 [field-sizing:content]"
    />
  );
}

/** A checklist: optional title, tick boxes, Enter adds a row, Backspace on an empty row removes it. */
function ChecklistBody({ item, readOnly, onChange, onDelete }: { item: Item; readOnly?: boolean; onChange: (p: Partial<Item>) => void; onDelete: () => void }) {
  const checks = item.checks ?? [];
  const [focusId, setFocusId] = useState<string | null>(checks.length === 1 && !checks[0].text ? checks[0].id : null);
  const save = (next: CheckItem[]) => onChange({ checks: next });
  const done = checks.filter((c) => c.done).length;
  return (
    <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <input
          disabled={readOnly}
          defaultValue={item.name}
          key={item.name}
          placeholder="Checklist"
          onBlur={(e) => e.target.value !== item.name && onChange({ name: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 bg-transparent text-[16px] font-bold outline-none placeholder:text-muted/70"
        />
        {checks.length > 0 && <span className="text-[12px] text-muted tabular-nums">{done}/{checks.length}</span>}
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {checks.map((c, i) => (
          <li key={c.id} className="group/row flex items-center gap-2.5">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={!!c.done}
              onChange={() => save(checks.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}
              className="size-[17px] shrink-0 cursor-pointer accent-[var(--accent)]"
              aria-label={c.text || "Item"}
            />
            <input
              disabled={readOnly}
              defaultValue={c.text}
              key={`${c.id}:${c.text}`}
              autoFocus={focusId === c.id}
              placeholder="List item"
              onFocus={() => setFocusId(null)}
              onBlur={(e) => e.target.value !== c.text && save(checks.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))}
              onKeyDown={(e) => {
                const el = e.target as HTMLInputElement;
                if (e.key === "Enter") {
                  e.preventDefault();
                  const id = newId();
                  const next = checks.map((x) => (x.id === c.id ? { ...x, text: el.value } : x));
                  next.splice(i + 1, 0, { id, text: "" });
                  setFocusId(id);
                  save(next);
                } else if (e.key === "Backspace" && !el.value && checks.length > 1) {
                  e.preventDefault();
                  setFocusId(checks[i - 1]?.id ?? checks[i + 1]?.id ?? null);
                  save(checks.filter((x) => x.id !== c.id));
                }
              }}
              className={`min-w-0 flex-1 bg-transparent py-0.5 text-[15px] outline-none placeholder:text-muted/50 ${c.done ? "text-muted line-through" : ""}`}
            />
            {!readOnly && (
              <button onClick={() => save(checks.filter((x) => x.id !== c.id))} className="text-muted opacity-0 group-hover/row:opacity-100 hover:text-danger" aria-label="Remove item">
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <button
          onClick={() => {
            const id = newId();
            setFocusId(id);
            save([...checks, { id, text: "" }]);
          }}
          className="mt-1 flex items-center gap-1.5 py-0.5 text-[13px] font-semibold text-muted hover:text-fg"
        >
          <Plus className="size-3.5" /> Add item
        </button>
      )}
      {!readOnly && !item.name && checks.every((c) => !c.text) && checks.length > 0 && focusId === null && (
        <button onClick={onDelete} className="ml-3 text-[12px] text-muted hover:text-danger">
          Discard empty checklist
        </button>
      )}
    </div>
  );
}
