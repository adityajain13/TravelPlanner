import { inkOn } from "../lib/colors";
import { RichEditor, RichField, RichLine, RichText } from "./RichText";
import { useEffect, useState } from "react";
import { CurrencySelect } from "./CurrencySelect";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bookmark, CheckSquare, Clock, Users, ListChecks, Plus, X, ExternalLink, GripVertical, ImagePlus, StickyNote, Trash2, Wallet } from "lucide-react";
import { ImagePicker } from "./ImagePicker";
import { Photo } from "./Photo";
import { PhotoCredit } from "./PhotoCredit";
import { formatMoney } from "../lib/fx";
import type { CheckItem, Item } from "../lib/trips";
import { fmtTime, StayField, TimeRangeField } from "./TimeField";
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
  /** Latest time on any stop above this one that day (where an empty time picker opens). */
  timeBefore?: string;
  /** Auto stop times: item.startTime/endTime are the worked-out times; you set how long instead. */
  auto?: { stay: number; isDefault: boolean; nextDay: boolean };
  onStay?: (min: number | undefined) => void;
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
  /** Days/lists this place is on (copies of it), and add/remove it on one. */
  sections?: string[];
  onToggleSection?: (section: string) => void;
  /** Open the budget editor (category, who paid, split) for this stop's cost. */
  onCostDetails?: () => void;
  /** The trip's people (days only): pick who goes to this stop. */
  people?: string[];
}

/** Wanderlog-style teardrop marker with the stop number, in the day's colour. */
export function PinMarker({ color, label, size = 28 }: { color: string; label?: string | number; size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 28 34" className="shrink-0 drop-shadow-sm" aria-hidden>
      <path d="M14 33c-1-3.2-3.4-6-6.2-8.8A12.5 12.5 0 1 1 26.5 14c0 3.7-1.6 7-4.3 10.2C19.4 27 17 29.8 14 33z" fill={color} stroke="rgb(0 0 0 / .35)" strokeWidth="1" />
      <text x="14" y="18.3" textAnchor="middle" fontSize={String(label ?? "").length > 1 ? 10.5 : 12.5} fontWeight="700" fill={inkOn(color)} fontFamily="Source Sans 3 Variable, system-ui">
        {label ?? "•"}
      </text>
    </svg>
  );
}

/** Auto times: the worked-out arrival–leave time (read-only) and the "how long" pill you edit. */
function AutoTimeChips({ item, auto, onStay, readOnly, chip }: { item: Item; auto: NonNullable<Props["auto"]>; onStay?: (m: number | undefined) => void; readOnly?: boolean; chip: string }) {
  return (
    <>
      <span className={chip} title="Worked out from the day's start, how long each stop takes and the travel between">
        <Clock className="size-3.5 text-accent" /> {fmtTime(item.startTime)} – {fmtTime(item.endTime)}
        {auto.nextDay && <span className="text-[11px] text-muted">+1</span>}
      </span>
      <StayField value={auto.stay} isDefault={auto.isDefault} disabled={readOnly || !onStay} onChange={(m) => onStay?.(m)} className={`${chip} ${readOnly ? "" : "hover:bg-accent/20"}`} />
    </>
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
  timeBefore,
  auto,
  onStay,
  onSelect,
  onChange,
  onDelete,
  checked,
  selecting,
  onCheck,
  targets,
  onMoveTo,
  sections,
  onToggleSection,
  onCostDetails,
  people,
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
          {isPlace && !selected && item.notes && <RichText text={item.notes} className="mt-1.5 line-clamp-3 text-[15px] leading-snug text-muted" />}

          {isPlace && !selected && (auto || item.startTime || item.endTime || item.cost != null || !!item.who?.length) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[13px] font-semibold">
              {!!item.who?.length && (
                <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-muted" title="Only they go here; their route is drawn on its own">
                  <Users className="size-3.5" /> {item.who.join(" & ")}
                </span>
              )}
              {auto && <AutoTimeChips item={item} auto={auto} onStay={onStay} readOnly={readOnly} chip={chip} />}
              {!auto && (item.startTime || item.endTime) && (
                <TimeRangeField
                    after={timeBefore}
                  disabled={readOnly}
                  start={item.startTime}
                  end={item.endTime}
                  onChange={(startTime, endTime) => onChange({ startTime, endTime })}
                  title="Change time"
                  className={`${chip} ${readOnly ? "" : "hover:bg-accent/20"}`}
                >
                  <Clock className="size-3.5 text-accent" />{" "}
                  {item.startTime ? `${fmtTime(item.startTime)}${item.endTime ? ` – ${fmtTime(item.endTime)}` : ""}` : `Until ${fmtTime(item.endTime!)}`}
                </TimeRangeField>
              )}
              {item.cost != null && (
                <button
                  type="button"
                  disabled={readOnly || !onCostDetails}
                  onClick={(e) => (e.stopPropagation(), onCostDetails?.())}
                  title="Cost details"
                  className={`${chip} ${readOnly ? "" : "hover:bg-accent/20"}`}
                >
                  <Wallet className="size-3.5 text-accent" /> {formatMoney(item.cost, item.costCurrency ?? currency)}
                </button>
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
                      onPick={(k) => (onToggleSection ? onToggleSection(k) : k !== item.section && onMoveTo(k))}
                      selected={onToggleSection ? sections : undefined}
                      className={`${PILL} hover:border-accent hover:text-fg`}
                    >
                      <Bookmark className="size-3.5" />
                      {targets.find((t) => t.key === item.section)?.label ?? "Move to"}
                      {sections && sections.length > 1 && <span className="text-accent">+{sections.length - 1}</span>}
                    </SectionPicker>
                  )}
                  {onCheck && !checked && (
                    <button onClick={() => onCheck(true, false)} className="flex items-center gap-1.5 rounded-full px-2 py-1 font-semibold text-muted hover:text-fg md:hidden">
                      <CheckSquare className="size-3.5" /> Select
                    </button>
                  )}
                </div>
              )}
              {isPlace && people && people.length > 1 && !readOnly && (
                <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <Users className="size-3.5 text-muted" />
                  {[undefined, ...people].map((t) => {
                    const on = t === undefined ? !item.who?.length : !!item.who?.includes(t);
                    return (
                      <button
                        key={t ?? "everyone"}
                        type="button"
                        onClick={() => {
                          if (t === undefined) return onChange({ who: undefined });
                          const next = on ? (item.who ?? []).filter((x) => x !== t) : [...(item.who ?? []), t];
                          // Everyone ticked = everyone
                          onChange({ who: next.length && next.length < people.length ? next : undefined });
                        }}
                        title={t ? `Only ${t} goes here (their own route)` : "Everyone goes here"}
                        className={`rounded-full px-2.5 py-1 font-semibold ${on ? "bg-accent text-on-accent" : "bg-surface-2 text-muted hover:text-fg"}`}
                      >
                        {t ?? "Everyone"}
                      </button>
                    );
                  })}
                </div>
              )}
              {isPlace && auto && (
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                  <AutoTimeChips item={item} auto={auto} onStay={onStay} readOnly={readOnly} chip={`${PILL}`} />
                </div>
              )}
              {isPlace && !auto && (
                <div className="flex items-center">
                  <TimeRangeField
                    after={timeBefore}
                    disabled={readOnly}
                    start={item.startTime}
                    end={item.endTime}
                    onChange={(startTime, endTime) => onChange({ startTime, endTime })}
                    className={`${PILL} ${readOnly ? "" : "hover:border-accent hover:text-fg"}`}
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
              {isPlace && <GoogleDetails item={item} onLink={(googlePlaceId) => onChange({ googlePlaceId })} onSnapshot={(d) => onChange({ google: { ...d, fetchedAt: Date.now() } })} />}
              {(item.notes || !readOnly) && <NotesInput disabled={readOnly} value={item.notes ?? ""} onCommit={(v) => onChange({ notes: v })} />}
            </div>
          )}
        </div>

        {isPlace && (item.image || (selected && !readOnly)) && (
          <div className="flex w-[72px] shrink-0 flex-col items-stretch gap-1 sm:w-20">
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
          {/* The photo's credit sits under the photo when the card is open, using no extra row */}
          {selected && item.image && <PhotoCredit img={item.image} className="line-clamp-3 block text-center text-[10px] leading-tight [overflow-wrap:anywhere] text-muted" />}
          </div>
        )}
      </div>

      {picking && (
        <ImagePicker
          initialQuery={[item.name, searchContext].filter(Boolean).join(" ")}
          name={item.name}
          coords={item.lat != null && item.lng != null ? [item.lng, item.lat] : undefined}
          googlePlaceId={item.googlePlaceId}
          address={item.address}
          current={item.image}
          onPick={(image) => onChange({ image })}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** Every control row in the open card is the same pill, so their icons line up on the left. */
const PILL = "flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-muted";

function CostInput({ amount, currency, disabled, onCommit }: { amount?: number; currency: string; disabled?: boolean; onCommit: (a: number | undefined, c: string) => void }) {
  return (
    <div className={`${PILL} py-1 pr-1 focus-within:border-accent`}>
      <Wallet className="size-3.5 shrink-0" />
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
        className="w-20 bg-transparent py-0.5 text-fg outline-none [appearance:textfield] placeholder:font-normal placeholder:text-muted/60 [&::-webkit-inner-spin-button]:appearance-none"
      />
      <CurrencySelect value={currency} disabled={disabled} onChange={(c) => amount != null && onCommit(amount, c)} className="!rounded-full !px-2 !py-0.5 text-[13px] text-fg" />
    </div>
  );
}


/** Stop notes: formatted text; click to edit in place (bold, lists… from the selection bar). */
function NotesInput({ value, onCommit, disabled }: { value: string; onCommit: (v: string) => void; disabled?: boolean }) {
  return (
    <RichField
      value={value}
      readOnly={disabled}
      onCommit={onCommit}
      placeholder="Add notes, links, reservation numbers…"
      className="w-full rounded-lg bg-surface px-2.5 py-1.5 text-sm leading-relaxed text-fg"
      editClassName="focus:ring-1 focus:ring-accent/50"
    />
  );
}

const chip = "flex items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-1 text-fg ring-1 ring-accent/25 transition-colors disabled:cursor-default";

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const newId = () => Math.random().toString(36).slice(2, 10);

/** A note: edits in place; empty notes remove themselves. */
function NoteBody({ text, readOnly, onCommit }: { text: string; readOnly?: boolean; onCommit: (t: string) => void }) {
  return (
    <RichField
      value={text}
      readOnly={readOnly}
      autoFocus={!text}
      onCommit={() => undefined}
      onDone={onCommit}
      placeholder="Write a note…"
      className="min-w-0 flex-1 text-[15px] leading-relaxed"
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
            <CheckText
              text={c.text}
              done={!!c.done}
              readOnly={readOnly}
              focus={focusId === c.id}
              onFocused={() => setFocusId(null)}
              onCommit={(t) => save(checks.map((x) => (x.id === c.id ? { ...x, text: t } : x)))}
              onEnter={(t) => {
                const id = newId();
                const next = checks.map((x) => (x.id === c.id ? { ...x, text: t } : x));
                next.splice(i + 1, 0, { id, text: "" });
                setFocusId(id);
                save(next);
              }}
              onBackspaceEmpty={
                checks.length > 1
                  ? () => {
                      setFocusId(checks[i - 1]?.id ?? checks[i + 1]?.id ?? null);
                      save(checks.filter((x) => x.id !== c.id));
                    }
                  : undefined
              }
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

/** A checklist row's text: formatted (ticked rows struck through); click to edit, caret where you clicked. */
function CheckText(p: { text: string; done: boolean; readOnly?: boolean; focus: boolean; onFocused: () => void; onCommit: (t: string) => void; onEnter: (t: string) => void; onBackspaceEmpty?: () => void }) {
  const [editing, setEditing] = useState<{ x: number; y: number } | null | false>(false);
  // A row just added with Enter: take over its focus so it stays in edit mode until you leave it
  useEffect(() => {
    if (p.focus) (setEditing(null), p.onFocused());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focus]);
  const tone = `min-w-0 flex-1 py-0.5 text-[15px] ${p.done ? "text-muted line-through" : ""}`;
  const edit = p.focus || editing !== false || (!p.text && !p.readOnly);
  if (!edit)
    return (
      <span
        onClick={(e) => !p.readOnly && !(e.target as HTMLElement).closest("a") && setEditing({ x: e.clientX, y: e.clientY })}
        className={`${tone} ${p.readOnly ? "" : "cursor-text"}`}
      >
        <RichLine text={p.text} />
      </span>
    );
  return (
    <RichEditor
      singleLine
      value={p.text}
      autoFocus={p.focus || editing !== false}
      caretAt={editing || null}
      placeholder="List item"
      onCommit={p.onCommit}
      onEnter={p.onEnter}
      onBackspaceEmpty={p.onBackspaceEmpty}
      onBlur={() => setEditing(false)}
      className={tone}
    />
  );
}
