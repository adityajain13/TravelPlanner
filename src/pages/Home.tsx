import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, LogOut, MapPin, Plus, Trash2, Users } from "lucide-react";
import { useSession } from "../lib/api";
import { reconcileTrips } from "../lib/sync";
import { db, type TripIndexRow } from "../lib/db";
import { formatRange, todayISO } from "../lib/dates";
import { deleteTrip } from "../lib/trips";
import { useTheme } from "../lib/theme";
import { ThemeToggle } from "../components/ThemeToggle";
import { NewTripDialog } from "../components/NewTripDialog";

export function Home() {
  const [theme, toggleTheme] = useTheme();
  const { email, logout } = useSession();

  // Pull trips from other devices / push ones made offline
  useEffect(() => {
    if (navigator.onLine) reconcileTrips().catch(() => undefined);
  }, []);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const trips = useLiveQuery(() => db.trips.orderBy("startDate").toArray(), []);
  const today = todayISO();
  const upcoming = trips?.filter((t) => !t.endDate || t.endDate >= today) ?? [];
  const past = (trips?.filter((t) => t.endDate && t.endDate < today) ?? []).reverse();

  return (
    <div className="mx-auto min-h-full max-w-3xl px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-16">
      <header className="mb-10 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-wide text-muted">travel planner</span>
        <div className="flex items-center gap-1">
          <span className="mr-1 hidden text-xs text-muted sm:inline">{email}</span>
          <ThemeToggle theme={theme} toggle={toggleTheme} />
          <button
            onClick={() => confirm("Sign out on this device? Your trips stay saved here.") && logout()}
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
        <button
          onClick={() => setCreating(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
        >
          <Plus className="size-4" /> New trip
        </button>
      </div>

      {trips && trips.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">
          <p className="font-display text-xl text-fg">Nothing planned yet</p>
          <p className="mt-1 text-sm">Trips are stored on this device and work offline.</p>
        </div>
      )}

      <TripGroup title="Upcoming" trips={upcoming} />
      <TripGroup title="Past" trips={past} />

      {creating && <NewTripDialog onClose={() => setCreating(false)} onCreated={(id) => navigate(`/trip/${id}`)} />}
    </div>
  );
}

function TripGroup({ title, trips }: { title: string; trips: TripIndexRow[] }) {
  if (trips.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">{title}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {trips.map((t) => (
          <li key={t.id} className="group flex items-center">
            <Link to={`/trip/${t.id}`} className="flex flex-1 items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
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
                  {t.shareToken && (
                    <span className="flex items-center gap-1.5 text-accent">
                      <Users className="size-3.5" />
                      Shared with you{t.role === "view" ? " · view only" : ""}
                    </span>
                  )}
                </p>
              </div>
            </Link>
            <button
              onClick={() => {
                const msg = t.shareToken ? `Remove "${t.title}" from this device?` : `Delete "${t.title}" everywhere? This can't be undone.`;
                if (confirm(msg)) deleteTrip(t.id, { server: !t.shareToken }).catch((e) => alert((e as Error).message));
              }}
              className="mr-3 grid size-9 place-items-center rounded-full text-muted opacity-0 transition hover:text-danger group-hover:opacity-100 focus:opacity-100"
              aria-label={`Delete ${t.title}`}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
