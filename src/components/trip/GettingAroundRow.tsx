import type { Dispatch, SetStateAction } from "react";
import type * as Y from "yjs";
import { Camera, Loader2 } from "lucide-react";
import { MODE_ICON, MODE_LABEL } from "../LegChip";
import { MODES } from "../../lib/routing";
import { GENERIC_PLACE } from "../../lib/geocode";
import { bestImage } from "../../lib/images";
import { updateItem, updateMeta, type TripState } from "../../lib/trips";
import type { PhotoFill } from "./types";

/** The default travel mode (drive / walk / bike / transit) and the "Auto-fill photos" button. */
export function GettingAroundRow({
  doc,
  state,
  readOnly,
  photoFill,
  setPhotoFill,
}: {
  doc: Y.Doc;
  state: TripState;
  readOnly: boolean;
  photoFill: PhotoFill | null;
  setPhotoFill: Dispatch<SetStateAction<PhotoFill | null>>;
}) {
  async function autofillPhotos() {
    // Generic stops ("Parking lot", "Rest stop") would just get a random photo
    const todo = state.items.filter((i) => i.kind === "place" && !i.image && !GENERIC_PLACE.test(i.name.trim()));
    setPhotoFill({ done: 0, total: todo.length, added: 0 });
    let added = 0;
    for (const [n, it] of todo.entries()) {
      const img = await bestImage(it.name, it.lat != null && it.lng != null ? [it.lng, it.lat] : undefined).catch(() => null);
      if (img) (added++, updateItem(doc, it.id, { image: img }));
      setPhotoFill({ done: n + 1, total: todo.length, added });
    }
    setTimeout(() => setPhotoFill(null), 2500);
  }

  return (
    <div className="mx-2 mt-3 flex items-center gap-2">
      {/* Default way of getting between stops (each leg can override it) */}
      <div className="flex min-w-0 rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label="Getting around">
        {MODES.map((m) => {
          const on = (state.meta.travelMode ?? "drive") === m;
          return (
            <button
              key={m}
              role="radio"
              aria-checked={on}
              disabled={readOnly}
              onClick={() => updateMeta(doc, { travelMode: m })}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors max-[380px]:px-2 ${on ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
              title="Default for every leg; tap a leg to change just that one"
            >
              {MODE_ICON[m]} <span className="max-[380px]:hidden">{MODE_LABEL[m]}</span>
            </button>
          );
        })}
      </div>
      {!readOnly && (
        <button
          onClick={autofillPhotos}
          disabled={!!photoFill || !navigator.onLine}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-2 text-[13px] font-semibold text-muted hover:border-accent hover:text-fg disabled:opacity-60"
          title="Find a photo for every place without one"
        >
          {photoFill ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          <span className="max-sm:hidden">{photoFill ? `${photoFill.done}/${photoFill.total} · ${photoFill.added} added` : "Auto-fill photos"}</span>
          {photoFill && <span className="sm:hidden tabular-nums">{photoFill.done}/{photoFill.total}</span>}
        </button>
      )}
    </div>
  );
}
