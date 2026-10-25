import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, ExternalLink, GripVertical, StickyNote, Trash2 } from "lucide-react";
import type { Item } from "../lib/trips";
import { googleMapsLink } from "../lib/photon";
import { GoogleDetails } from "./GoogleDetails";

interface Props {
  item: Item;
  number?: number;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Item>) => void;
  onDelete: () => void;
}

export function ItemCard({ item, number, color, selected, onSelect, onChange, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`item-${item.id}`}
      onClick={onSelect}
      className={`group relative flex gap-2 rounded-xl border p-3 transition-colors ${
        selected ? "border-accent/60 bg-surface-2" : "border-transparent hover:bg-surface-2/60"
      } ${isDragging ? "z-10 opacity-40" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="-ml-1 flex w-4 cursor-grab touch-none items-start pt-1 text-muted/50 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing max-md:opacity-100"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>

      {item.kind === "place" ? (
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-[#0e1110]"
          style={{ background: color }}
        >
          {number ?? "•"}
        </span>
      ) : (
        <StickyNote className="mt-0.5 size-5 shrink-0 text-muted" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${item.kind === "note" ? "font-normal" : ""}`}>{item.name}</p>
            {item.kind === "place" && (item.category || item.address) && (
              <p className="truncate text-xs text-muted">{[item.category, item.address].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
            {item.kind === "place" && (
              <a
                href={googleMapsLink(item)}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-fg"
                title="Open in Google Maps"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
            <button
              onClick={(e) => (e.stopPropagation(), onDelete())}
              className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-danger"
              title="Remove"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>

        {(selected || item.startTime || item.notes) && (
          <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
            {(selected || item.startTime) && item.kind === "place" && (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Clock className="size-3.5" />
                <TimeInput value={item.startTime} onCommit={(v) => onChange({ startTime: v })} />
                <span>–</span>
                <TimeInput value={item.endTime} onCommit={(v) => onChange({ endTime: v })} />
              </div>
            )}
            {selected && item.kind === "place" && (
              <GoogleDetails item={item} onLink={(googlePlaceId) => onChange({ googlePlaceId })} />
            )}
            {(selected || item.notes) && (
              <NotesInput value={item.notes ?? ""} onCommit={(v) => onChange({ notes: v })} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TimeInput({ value, onCommit }: { value?: string; onCommit: (v: string) => void }) {
  return (
    <input
      type="time"
      defaultValue={value ?? ""}
      key={value}
      onBlur={(e) => e.target.value !== (value ?? "") && onCommit(e.target.value)}
      className="rounded-md bg-transparent px-1 py-0.5 text-fg outline-none focus:bg-surface"
    />
  );
}

/** Local draft while typing; writes to the doc on blur so remote edits don't fight the cursor. */
function NotesInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);
  return (
    <textarea
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
