// Place search via Photon (OpenStreetMap data, free, results are fine to store offline).
// https://photon.komoot.io — attribution: © OpenStreetMap contributors

export interface PlaceResult {
  osmId: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined> & { osm_id?: number; osm_type?: string };
}

export async function searchPlaces(q: string, near?: [number, number], signal?: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ q, limit: "8", lang: "en" });
  if (near) {
    params.set("lon", String(near[0]));
    params.set("lat", String(near[1]));
    params.set("location_bias_scale", "0.3");
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  const seen = new Set<string>();
  return json.features
    .map((f) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const street = [p.housenumber, p.street].filter(Boolean).join(" ");
      const address = [street, p.district ?? p.locality, p.city, p.state, p.country].filter(Boolean).join(", ");
      return {
        osmId: `${p.osm_type ?? "?"}${p.osm_id ?? ""}`,
        name: p.name ?? street ?? "Unnamed place",
        address,
        category: (p.osm_value ?? p.osm_key ?? "").replace(/_/g, " "),
        lat,
        lng,
      };
    })
    .filter((r) => (seen.has(r.osmId) ? false : (seen.add(r.osmId), true)));
}

/** Free deep link — opens the place in Google Maps without touching the Places API. */
export function googleMapsLink(i: { name: string; lat?: number; lng?: number; googlePlaceId?: string }) {
  const q = encodeURIComponent(i.lat != null ? `${i.name} @${i.lat},${i.lng}` : i.name);
  const base = `https://www.google.com/maps/search/?api=1&query=${q}`;
  return i.googlePlaceId ? `${base}&query_place_id=${i.googlePlaceId}` : base;
}
