import type { Dispatch, SetStateAction } from "react";
import type * as Y from "yjs";
import { ExpenseForm } from "../Budget";
import { ImagePicker } from "../ImagePicker";
import { ReservationForm } from "../Reservations";
import { SettingsDialog } from "../SettingsDialog";
import { ShareDialog } from "../ShareDialog";
import { lineForItem, travelersOf } from "../../lib/budget";
import { edit, updateMeta, type Reservation, type TripState } from "../../lib/trips";
import type { SettingsScope } from "../../lib/settings";

/** The trip page's modals: the cost form, cover picker, reservation form, share and settings. */
export function TripDialogs({
  doc,
  state,
  tripId,
  readOnly,
  costFor,
  setCostFor,
  pickingCover,
  setPickingCover,
  editingRes,
  setEditingRes,
  sharing,
  setSharing,
  showSettings,
  setShowSettings,
  settingsScope,
}: {
  doc: Y.Doc;
  state: TripState;
  tripId: string | undefined;
  readOnly: boolean;
  costFor: string | null;
  setCostFor: Dispatch<SetStateAction<string | null>>;
  pickingCover: boolean;
  setPickingCover: Dispatch<SetStateAction<boolean>>;
  editingRes: Partial<Reservation> | null;
  setEditingRes: Dispatch<SetStateAction<Partial<Reservation> | null>>;
  sharing: boolean;
  setSharing: Dispatch<SetStateAction<boolean>>;
  showSettings: boolean;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  settingsScope: SettingsScope | null;
}) {
  return (
    <>
      {costFor &&
        (() => {
          const it = state.items.find((x) => x.id === costFor);
          if (!it || it.cost == null) return null;
          const line = lineForItem(it, state);
          return (
            <ExpenseForm
              doc={doc}
              travelers={travelersOf(state)}
              linked={line}
              initial={{ title: line.title, amount: line.amount, currency: line.currency, category: line.category, paidBy: line.paidBy, splitWith: line.splitWith, date: line.date }}
              onClose={() => setCostFor(null)}
            />
          );
        })()}
      {pickingCover && (
        <ImagePicker
          initialQuery={state.meta.destination || state.meta.title}
          current={state.meta.cover}
          onPick={(cover) => (cover ? updateMeta(doc, { cover }) : edit(doc, () => doc.getMap("meta").delete("cover")))}
          onClose={() => setPickingCover(false)}
        />
      )}
      {editingRes && <ReservationForm doc={doc} state={state} initial={editingRes} onClose={() => setEditingRes(null)} />}
      {sharing && tripId && <ShareDialog tripId={tripId} onClose={() => setSharing(false)} />}
      {showSettings && <SettingsDialog doc={doc} scope={readOnly ? null : settingsScope} onClose={() => setShowSettings(false)} />}
    </>
  );
}
