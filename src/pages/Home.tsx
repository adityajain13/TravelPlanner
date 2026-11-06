import { Logo } from "../components/Logo";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, ChevronDown, ChevronRight, DoorOpen, FileUp, LogOut, MapPin, Plus, Trash2, Users, X } from "lucide-react";
import { askConfirm, ConfirmDialog } from "../components/ConfirmDialog";
import { useSession } from "../lib/api";
import { pushTrip, reconcileTrips } from "../lib/sync";
import { fetchInbox, type InboxItem } from "../lib/inbox";
import { UnmatchedInbox } from "../components/UnmatchedInbox";
import { db, type TripIndexRow } from "../lib/db";
import { formatRange, todayISO } from "../lib/dates";
import { deleteTrip, openTrip, updateMeta } from "../lib/trips";
import { statusOf, type TripStatus } from "../lib/tripStatus";
import { StatusMenu } from "../components/StatusMenu";
import { useTheme } from "../lib/theme";
import { SettingsDialog } from "../components/SettingsDialog";
import { Settings as SettingsIcon } from "lucide-react";
import { NewTripDialog } from "../components/NewTripDialog";
import { WanderlogImport } from "../components/WanderlogImport";

export function Home() {
  useTheme(); // applies the saved theme
  const [showSettings, setShowSettings] = useState(false);
  const { email, logout } = useSession();

  const [unmatched, setUnmatched] = useState<InboxItem[]>([]);
  const loadInbox = useCallback(
    () =>
      fetchInbox()
        .then((items) => setUnmatched(items.filter((i) => !i.trip_id)))
        .catch(() => undefined),
    [],
  );
  // Email's "ready to review" link (?review=1): open the unmatched sheet, then drop the param
  const [review, setReview] = useState(() => new URLSearchParams(window.location.search).get("review") === "1");
  useEffect(() => {
    if (!review || !unmatched.length) return;
    setReview(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("review");
    window.history.replaceState(window.history.state, "", url);
  }, [review, unmatched.length]);

  // Pull trips from other devices / push ones made offline; check for forwarded bookings
  useEffect(() => {
    if (!navigator.onLine) return;
    reconcileTrips().catch(() => undefined);
    void loadInbox();
  }, [loadInbox]);
  // Bookings can be forwarded while the app is open: check again when it's back in front or online
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void loadInbox();
    const onOnline = () => void loadInbox();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [loadInbox]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();
  const trips = useLiveQuery(() => db.trips.orderBy("startDate").toArray(), []);
  const today = todayISO();
  const groups: Record<TripStatus, TripIndexRow[]> = { planning: [], booked: [], done: [] };
  for (const t of trips ?? []) groups[statusOf(t.status, t.endDate, today)].push(t);
  // Undated trips sort last; planning and booked soonest first, done most recent first
  const byStart = (desc: boolean) => (a: TripIndexRow, b: TripIndexRow) => {
    if (!a.startDate || !b.startDate) return a.startDate ? -1 : b.startDate ? 1 : 0;
    return desc ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate);
  };
  const planning = groups.planning.sort(byStart(false));
  const booked = groups.booked.sort(byStart(false));
  const done = groups.done.sort(byStart(true));

  return (
    <div className="mx-auto min-h-full max-w-3xl px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-16">
      <header className="mb-10 flex items-center justify-between">
        <Logo size={30} />
        <div className="flex items-center gap-1">
          <span className="mr-1 hidden text-xs text-muted sm:inline">{email}</span>
          <button onClick={() => setShowSettings(true)} className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg" aria-label="Settings" title="Settings">
            <SettingsIcon className="size-4" />
          </button>
          {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
          <button
            onClick={async () => (await askConfirm({ title: "Sign out on this device?", body: "Your trips stay saved here.", confirmLabel: "Sign out", danger: false, icon: <LogOut /> })) && logout()}
            className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <div className="mb-8 flex items-end justify-between gap-4">
        <h1 className="font-display text-4xl leading-none sm:text-5xl">Your trips</h1>
        <div className="flex shrink-0 gap-2">
        {/* Mounted only while there are unmatched emails, so initiallyOpen is read when they arrive */}
        {unmatched.length > 0 && <UnmatchedInbox items={unmatched} trips={trips ?? []} onChange={loadInbox} initiallyOpen={review} />}
        <button
          onClick={() => setImporting(true)}
          className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm text-muted hover:border-accent hover:text-fg"
          title="Import from Wanderlog"
        >
          <FileUp className="size-4" /> <span className="max-sm:hidden">Import</span>
        </button>
        <button
          onClick={() => setCreating(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
        >
          <Plus className="size-4" /> New trip
        </button>
        </div>
      </div>

      {trips && trips.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">
          <p className="font-display text-xl text-fg">Nothing planned yet</p>
          <p className="mt-1 text-sm">Trips are stored on this device and work offline.</p>
        </div>
      )}

      <TripGroup title="Planning" trips={planning} />
      <TripGroup title="Booked" trips={booked} />
      <TripGroup title="Done" trips={done} collapsible />

      {importing && <WanderlogImport onClose={() => setImporting(false)} />}
      {creating && <NewTripDialog onClose={() => setCreating(false)} onCreated={(id) => navigate(`/trip/${id}`)} />}
    </div>
  );
}

const DONE_OPEN_KEY = "tp-done-open";
function readDoneOpen() {
  try {
    return localStorage.getItem(DONE_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}
function writeDoneOpen(open: boolean) {
  try {
    localStorage.setItem(DONE_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function TripGroup({ title, trips, collapsible }: { title: string; trips: TripIndexRow[]; collapsible?: boolean }) {
  const { email } = useSession();
  const [pending, setPending] = useState<TripIndexRow | null>(null);
  const [open, setOpen] = useState(() => !collapsible || readDoneOpen());
  if (trips.length === 0) return null;
  const today = todayISO();
  const toggle = () =>
    setOpen((o) => {
      writeDoneOpen(!o);
      return !o;
    });
  const pick = async (t: TripIndexRow, status: TripStatus) => {
    try {
      const { doc, ready } = openTrip(t.id);
      await ready;
      updateMeta(doc, { status });
      void pushTrip(t.id).catch(() => undefined);
    } catch {
      /* nothing was saved; the pill keeps its old status */
    }
  };
  return (
    <section className="mb-10">
      {collapsible ? (
        <button
          onClick={toggle}
          aria-expanded={open}
          className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-widest text-muted uppercase transition-colors hover:text-fg"
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {title} · {trips.length}
        </button>
      ) : (
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">{title}</h2>
      )}
      {open && (
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {trips.map((t) => (
          <li key={t.id} className="group flex items-center transition-colors hover:bg-surface-2 first:rounded-t-2xl last:rounded-b-2xl">
            <Link to={`/trip/${t.id}`} className="flex min-w-0 flex-1 items-center gap-4 py-4 pr-2 pl-5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg">{t.title}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    {t.destination}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" />
                    {formatRange(t.startDate, t.endDate)}
                  </span>
                  {(t.shareToken || t.owner) && (
                    <span className="flex items-center gap-1.5 text-accent">
                      <Users className="size-3.5" />
                      {t.owner ? `Shared by ${t.owner}` : "Shared with you"}
                      {t.role === "view" ? " · view only" : ""}
                    </span>
                  )}
                </p>
              </div>
            </Link>
            <div className="shrink-0">
              <StatusMenu
                variant="card"
                value={statusOf(t.status, t.endDate, today)}
                disabled={t.role === "view"}
                onPick={(status) => void pick(t, status)}
              />
            </div>
            {/* Only the trip's creator can delete it; people it's shared with leave or remove it from this device */}
            <button
              onClick={() => setPending(t)}
              className="mx-4 grid size-10 shrink-0 place-items-center rounded-full text-muted opacity-0 transition hover:bg-surface hover:text-danger group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"
              aria-label={t.owner ? `Leave ${t.title}` : t.shareToken ? `Remove ${t.title}` : `Delete ${t.title}`}
              title={t.owner ? "Leave trip" : t.shareToken ? "Remove from this device" : "Delete trip"}
            >
              {t.owner ? <DoorOpen className="size-4" /> : t.shareToken ? <X className="size-4" /> : <Trash2 className="size-4" />}
            </button>
          </li>
        ))}
      </ul>
      )}
      {pending && (
        <ConfirmDialog
          icon={pending.owner ? <DoorOpen /> : pending.shareToken ? <X /> : <Trash2 />}
          title={pending.owner ? `Leave ${pending.title}?` : pending.shareToken ? `Remove ${pending.title}?` : `Delete ${pending.title}?`}
          confirmLabel={pending.owner ? "Leave" : pending.shareToken ? "Remove" : "Delete"}
          onConfirm={() => deleteTrip(pending.id, { server: !pending.shareToken && !pending.owner, leave: pending.owner && email ? email : undefined })}
          onClose={() => setPending(null)}
        >
          {pending.owner
            ? `It disappears from your trips. ${pending.owner} can add you back.`
            : pending.shareToken
              ? "It's removed from this device only. The trip and its share link keep working."
              : "The itinerary, bookings and budget are deleted for everyone it's shared with. This can't be undone."}
        </ConfirmDialog>
      )}
    </section>
  );
}
