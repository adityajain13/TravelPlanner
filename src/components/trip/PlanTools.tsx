import type { Dispatch, SetStateAction } from "react";
import type * as Y from "yjs";
import { InboxPanel } from "../InboxPanel";
import type { InboxItem } from "../../lib/inbox";
import type { Reservation, ReservationType, TripState } from "../../lib/trips";
import { UnpinnedNotice } from "./UnpinnedNotice";
import { ReservationQuickAdd } from "./ReservationQuickAdd";
import { GettingAroundRow } from "./GettingAroundRow";
import type { PhotoFill } from "./types";

/** Above the days on the plan tab: unpinned notice, reservation quick-add, travel mode + photos, forwarded bookings. */
export function PlanTools({
  doc,
  state,
  readOnly,
  unpinned,
  onDismissUnpinned,
  canReview,
  inbox,
  setInbox,
  setEditingRes,
  photoFill,
  setPhotoFill,
}: {
  doc: Y.Doc;
  state: TripState;
  readOnly: boolean;
  unpinned: string[];
  onDismissUnpinned: () => void;
  canReview: boolean;
  inbox: InboxItem[];
  setInbox: Dispatch<SetStateAction<InboxItem[]>>;
  setEditingRes: Dispatch<SetStateAction<Partial<Reservation> | null>>;
  photoFill: PhotoFill | null;
  setPhotoFill: Dispatch<SetStateAction<PhotoFill | null>>;
}) {
  return (
    <>
      {unpinned.length > 0 && <UnpinnedNotice unpinned={unpinned} onDismiss={onDismissUnpinned} />}
      {!readOnly && (
        <ReservationQuickAdd onPick={(t: ReservationType) => setEditingRes({ type: t, startDate: state.meta.startDate })} />
      )}
      <GettingAroundRow doc={doc} state={state} readOnly={readOnly} photoFill={photoFill} setPhotoFill={setPhotoFill} />
      {canReview && <InboxPanel items={inbox} doc={doc} state={state} onDone={(itemId) => setInbox((xs) => xs.filter((x) => x.id !== itemId))} />}
    </>
  );
}
