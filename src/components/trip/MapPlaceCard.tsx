import { useEffect, useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { SectionPicker, type SectionTarget } from "../SectionPicker";
import { reversePlaces, type GeoHit } from "../../lib/geocode";
import { getDetails, GOOGLE_KEY, nearbyPlaces, photoUrl, PRICE_LABEL, type GoogleDetails, type NearbyPlace } from "../../lib/google";
import { googleMapsLink, type PlaceResult } from "../../lib/photon";

/** Metres across 28 screen pixels at this spot and zoom, kept between 20 m and 400 m. */
function radiusFor(lat: number, zoom: number): number {
  const metresPerPixel = (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  return Math.round(Math.min(400, Math.max(20, 28 * metresPerPixel)));
}

interface Props {
  /** The held spot, [lng, lat]. */
  at: [number, number];
  /** Map zoom when the spot was held (sizes the search radius). */
  zoom: number;
  targets: SectionTarget[];
  /** Section key from the picker to the section the item is written to (a day in draft view, etc.). */
  writeOf: (key: string) => string;
  onAdd: (sectionKey: string, p: PlaceResult) => void;
  onClose: () => void;
  readOnly?: boolean;
}

/** Card for a long-pressed spot: the Google place there (or the nearest one), or a dropped pin. */
export function MapPlaceCard({ at, zoom, targets, writeOf, onAdd, onClose, readOnly }: Props) {
  const [lng, lat] = at;
  // Search results for the spot: Google's places there (nearest first) and Photon's nearest hit
  const [loaded, setLoaded] = useState<{ nearby: NearbyPlace[]; photon: GeoHit | null } | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [details, setDetails] = useState<GoogleDetails | null>(null);

  // A new spot starts over (zoom is read once, when the spot is held)
  useEffect(() => {
    const ac = new AbortController();
    const radius = radiusFor(lat, zoom);
    setLoaded(null);
    setChoice(null);
    Promise.all([
      GOOGLE_KEY ? nearbyPlaces([lng, lat], radius, ac.signal).catch(() => [] as NearbyPlace[]) : Promise.resolve([] as NearbyPlace[]),
      reversePlaces([lng, lat], Math.max(0.05, radius / 1000), ac.signal).catch(() => [] as GeoHit[]),
    ]).then(([nearby, hits]) => {
      if (!ac.signal.aborted) setLoaded({ nearby, photon: hits[0] ?? null });
    });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lng, lat]);

  // Escape closes the card
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const nearby = loaded?.nearby ?? [];
  const current = nearby.find((n) => n.id === choice) ?? nearby[0] ?? null;
  const others = nearby.filter((n) => n.id !== current?.id).slice(0, 4);

  // Google details for the place on show (cached by Google's ID in google.ts)
  useEffect(() => {
    setDetails(null);
    if (!current) return;
    let live = true;
    getDetails(current.id)
      .then((d) => live && setDetails(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const photon = loaded?.photon ?? null;
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // What "Add to trip" saves: the Google place, or the dropped pin
  const place: PlaceResult | null = !loaded
    ? null
    : current
      ? { osmId: "", name: current.name, address: current.address ?? "", category: current.type ?? "", lat: current.lat, lng: current.lng, googlePlaceId: current.id }
      : { osmId: photon?.osmId ?? "", name: photon?.name ?? "Dropped pin", address: photon?.address ?? "", category: photon?.category ?? "", lat, lng };

  const mapsUri = current
    ? (details?.mapsUri ?? googleMapsLink({ name: current.name, lat: current.lat, lng: current.lng, googlePlaceId: current.id }))
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const photo = details?.photos[0];
  const address = current ? (details?.address ?? current.address) : (photon?.address ?? coords);
  const priceLabel = details?.priceLevel ? PRICE_LABEL[details.priceLevel] : undefined;

  return (
    <div
      role="dialog"
      aria-label="Place at this spot"
      className="absolute bottom-4 left-1/2 z-40 w-[min(360px,calc(100%-32px))] -translate-x-1/2 overflow-visible rounded-2xl border border-line bg-surface shadow-2xl"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-full bg-surface/90 text-muted shadow hover:text-fg"
      >
        <X className="size-4" />
      </button>

      {!loaded ? (
        <div className="space-y-2.5 p-4" aria-busy="true">
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-surface-2" />
        </div>
      ) : (
        <>
          {photo && (
            <div className="relative">
              <img
                src={photoUrl(photo.name, 600)}
                referrerPolicy="strict-origin-when-cross-origin"
                alt=""
                onError={(e) => (e.currentTarget.style.display = "none")}
                className="h-36 w-full rounded-t-2xl object-cover"
              />
              {photo.attributions[0] && (
                <span className="absolute right-2 bottom-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">Photo: {photo.attributions[0].displayName}</span>
              )}
            </div>
          )}
          <div className="space-y-1.5 px-4 pt-3.5 pb-3">
            <p className="pr-9 text-[16px] font-semibold text-fg">{current ? current.name : (photon?.name ?? "Dropped pin")}</p>
            {current ? (
              <div className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
                {current.type && <span>{current.type}</span>}
                {details?.rating != null && (
                  <span>
                    {current.type && "· "}★ {details.rating.toFixed(1)}
                    {details.ratingCount ? ` (${details.ratingCount.toLocaleString()})` : ""}
                  </span>
                )}
                {priceLabel && <span>· {priceLabel}</span>}
                {details?.openNow != null && <span className={details.openNow ? "text-accent" : "text-danger"}>· {details.openNow ? "Open now" : "Closed"}</span>}
              </div>
            ) : null}
            {address && <p className="text-[13px] text-muted">{address}</p>}
            {others.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {others.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setChoice(n.id)}
                    className="max-w-full truncate rounded-full border border-line px-2.5 py-1 text-[12px] text-fg hover:bg-surface-2"
                  >
                    Also here: {n.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-4 pb-4">
            {!readOnly && place && (
              <SectionPicker
                targets={targets}
                up
                onPick={(k) => onAdd(writeOf(k), place)}
                align="left"
                className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-on-accent"
              >
                <Plus className="size-4" /> Add to trip
              </SectionPicker>
            )}
            <a
              href={mapsUri}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[13px] font-semibold text-fg hover:bg-surface-2"
            >
              <ExternalLink className="size-3.5" /> Google Maps
            </a>
          </div>
        </>
      )}
    </div>
  );
}
