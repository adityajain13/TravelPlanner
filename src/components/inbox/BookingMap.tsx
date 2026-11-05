import { useEffect, useState } from "react";
import { locateBooking, type Located } from "../../lib/locate";
import { snapshotDay, type MiniMap } from "../../lib/miniMaps";
import { useTheme } from "../../lib/theme";
import type { Booking } from "../../lib/inbox";
import { RouteSketch } from "../overview/RouteSketch";

/** Where a venue booking is: looked up once, then drawn on a small snapshot of the map. */
export function BookingMap({ b, center }: { b: Booking; center?: [number, number] }) {
  const [theme] = useTheme();
  // undefined = still looking; null = not found
  const [loc, setLoc] = useState<Located | null | undefined>(undefined);
  const [mini, setMini] = useState<MiniMap | null>(null);

  // Keyed on the name and address, not the booking object, so an inbox refetch does not look it up again (center is only a search bias)
  const name = b.location_name ?? b.title;
  useEffect(() => {
    let alive = true;
    locateBooking(name, b.address, center)
      .catch(() => null)
      .then((r) => alive && setLoc(r));
    return () => {
      alive = false;
    };
  }, [name, b.address]);

  useEffect(() => {
    if (!loc) return;
    let alive = true;
    snapshotDay([[loc.lng, loc.lat]], theme).then((m) => alive && m && setMini(m));
    return () => {
      alive = false;
    };
  }, [loc, theme]);

  if (loc === undefined) return <p className="text-xs text-muted">Finding it on the map…</p>;
  if (!loc) return <p className="text-xs text-muted">Couldn't find this on the map — you can set the address after adding.</p>;
  return (
    <div>
      {/* Without a snapshot (offline, or it failed) the sketch shows a single dot */}
      <RouteSketch points={[[loc.lng, loc.lat]]} color="#5fd68b" mini={mini ?? undefined} className="h-36" />
      {loc.address && <p className="mt-1.5 text-xs text-muted">{loc.address}</p>}
    </div>
  );
}
