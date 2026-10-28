import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MapPin, MapPinOff } from "lucide-react";
import { searchPlaces, type PlaceResult } from "../lib/photon";
import { autocomplete, type GoogleSuggestion } from "../lib/google";
import { placeFromSuggestion } from "../lib/gmaps";

/**
 * Address box that is also a place search: type an address or the place's name and pick a
 * result to pin it on the map. Typing without picking keeps the text (it's geocoded on save).
 */
export function AddressSearch({
  value,
  pinned,
  near,
  onType,
  onPick,
  className = "",
}: {
  value?: string;
  pinned: boolean;
  near?: [number, number];
  onType: (address: string) => void;
  onPick: (p: { address: string; lat: number; lng: number; name: string }) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const { osm, google, loading, setLoading } = useAddressResults(value, typed, near);

  useEffect(() => {
    const down = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, []);

  const choose = async (p: PlaceResult | GoogleSuggestion) => {
    setOpen(false);
    setTyped(false);
    if ("placeId" in p) {
      setLoading(true);
      const g = await placeFromSuggestion(p).catch(() => null);
      setLoading(false);
      if (g) onPick({ address: g.address || p.main, lat: g.lat, lng: g.lng, name: g.name });
    } else onPick({ address: p.address || p.name, lat: p.lat, lng: p.lng, name: p.name });
  };

  return (
    <div ref={wrap} className="relative" {...(open ? { "data-popover": "" } : {})}>
      <div className="relative">
        <input
          value={value ?? ""}
          onChange={(e) => (onType(e.target.value), setTyped(true), setOpen(true))}
          onFocus={() => typed && setOpen(true)}
          placeholder="Search an address or place to pin it"
          className={`${className} pr-24`}
        />
        <span className={`pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1 text-[12px] font-semibold ${pinned ? "text-accent" : "text-muted"}`}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : pinned ? <Check className="size-3.5" /> : <MapPinOff className="size-3.5" />}
          {pinned ? "Pinned" : "No pin"}
        </span>
      </div>
      {open && (osm.length > 0 || google.length > 0) && <ResultsList osm={osm} google={google} onChoose={choose} />}
    </div>
  );
}

/** Debounced place search (OSM + Google) for what was typed; only runs once the user has typed. */
function useAddressResults(value: string | undefined, typed: boolean, near: [number, number] | undefined) {
  const [osm, setOsm] = useState<PlaceResult[]>([]);
  const [google, setGoogle] = useState<GoogleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = (value ?? "").trim();
    if (!typed || q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const [a, g] = await Promise.allSettled([searchPlaces(q, near, ctrl.signal), autocomplete(q, near, ctrl.signal)]);
      if (ctrl.signal.aborted) return;
      setOsm(a.status === "fulfilled" ? a.value.slice(0, 5) : []);
      setGoogle(g.status === "fulfilled" ? g.value : []);
      setLoading(false);
    }, 300);
    return () => (clearTimeout(t), ctrl.abort());
  }, [value, typed, near]);

  return { osm, google, loading, setLoading };
}

/** The dropdown of suggestions: OSM places first, then Google's. */
function ResultsList({
  osm,
  google,
  onChoose,
}: {
  osm: PlaceResult[];
  google: GoogleSuggestion[];
  onChoose: (p: PlaceResult | GoogleSuggestion) => void;
}) {
  const row = "flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-surface-2";
  return (
    <ul className="absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-2xl">
      {osm.map((p) => (
        <li key={p.osmId}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onChoose(p)} className={row}>
            <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
            <span className="min-w-0">
              <span className="block truncate text-[14px]">{p.name}</span>
              <span className="block truncate text-xs text-muted">{p.address}</span>
            </span>
          </button>
        </li>
      ))}
      {google.map((g) => (
        <li key={g.placeId}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onChoose(g)} className={row}>
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
            <span className="min-w-0">
              <span className="block truncate text-[14px]">{g.main}</span>
              {g.secondary && <span className="block truncate text-xs text-muted">{g.secondary}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
