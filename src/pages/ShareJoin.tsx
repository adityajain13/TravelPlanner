import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { db } from "../lib/db";

/** /s/:token — someone opened a share link. Register the trip on this device and open it. */
export function ShareJoin() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<{ tripId: string; role: "view" | "edit"; title: string; destination: string }>(`/share/${token}`)
      .then(async (r) => {
        const existing = await db.trips.get(r.tripId);
        // Your own trip (no token on it): just open it with full access
        if (existing && !existing.shareToken) return navigate(`/trip/${r.tripId}`, { replace: true });
        await db.trips.put({
          id: r.tripId,
          title: existing?.title ?? r.title,
          destination: existing?.destination ?? r.destination,
          startDate: existing?.startDate ?? "",
          endDate: existing?.endDate ?? "",
          updatedAt: Date.now(),
          shareToken: token,
          role: r.role,
        });
        navigate(`/trip/${r.tripId}`, { replace: true });
      })
      .catch((e) => setError(navigator.onLine ? (e as Error).message : "Open this link once while online to save the trip."));
  }, [token, navigate]);

  return (
    <div className="grid h-full place-items-center p-6 text-center">
      {error ? (
        <div className="space-y-3">
          <p className="font-display text-2xl">Can't open this trip</p>
          <p className="text-sm text-muted">{error}</p>
          <Link to="/" className="text-sm text-accent">
            Go to trips
          </Link>
        </div>
      ) : (
        <p className="text-muted">Opening shared trip…</p>
      )}
    </div>
  );
}
