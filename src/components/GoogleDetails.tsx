import { useEffect, useState } from "react";
import { ExternalLink, Globe, Loader2, Phone, Star, WifiOff } from "lucide-react";
import type { Item } from "../lib/trips";
import { findPlaceId, getDetails, GOOGLE_KEY, photoUrl, PRICE_LABEL, type GoogleDetails as Details } from "../lib/google";

interface Props {
  item: Item;
  onLink: (googlePlaceId: string) => void;
}

/** Live Google data for a place. Only the place ID is ever written back to the trip. */
export function GoogleDetails({ item, onLink }: Props) {
  const [details, setDetails] = useState<Details | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "notfound">("idle");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [showHours, setShowHours] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => (window.removeEventListener("online", on), window.removeEventListener("offline", off));
  }, []);

  // Already linked → load details automatically when the card is opened
  useEffect(() => {
    if (item.googlePlaceId && online && !details) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.googlePlaceId, online]);

  async function load() {
    setState("loading");
    try {
      let id = item.googlePlaceId ?? null;
      if (!id) {
        id = await findPlaceId(item);
        if (!id) return setState("notfound");
        onLink(id);
      }
      setDetails(await getDetails(id));
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach Google");
      setState("error");
    }
  }

  if (!GOOGLE_KEY) return null;

  if (!details) {
    return (
      <div className="flex items-center gap-2 text-[13px]">
        <button
          onClick={load}
          disabled={!online || state === "loading"}
          className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-semibold text-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
        >
          {state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : !online ? <WifiOff className="size-3.5" /> : <GoogleG />}
          {!online ? "Google details need a connection" : "Google details"}
        </button>
        {state === "notfound" && <span className="text-muted">No match on Google</span>}
        {state === "error" && <span className="text-danger">{error}</span>}
      </div>
    );
  }

  const d = details;
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-2.5 text-xs">
      {d.photos.length > 0 && (
        <div className="-mx-0.5 flex gap-1.5 overflow-x-auto pb-1">
          {d.photos.map((ph) => (
            <img
              key={ph.name}
              src={photoUrl(ph.name)}
              alt=""
              loading="lazy"
              title={ph.attributions.map((a) => a.displayName).join(", ")}
              className="h-24 w-36 shrink-0 rounded-md bg-surface-2 object-cover"
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        {d.rating != null && (
          <span className="flex items-center gap-1 text-fg">
            <Star className="size-3.5 fill-current text-[#f2c14e]" />
            {d.rating.toFixed(1)}
            <span className="text-muted">({d.ratingCount?.toLocaleString()})</span>
          </span>
        )}
        {d.priceLevel && PRICE_LABEL[d.priceLevel] && <span>{PRICE_LABEL[d.priceLevel]}</span>}
        {d.openNow != null && (
          <span className={d.openNow ? "text-accent" : "text-danger"}>{d.openNow ? "Open now" : "Closed now"}</span>
        )}
        {d.hours && (
          <button onClick={() => setShowHours((s) => !s)} className="underline decoration-dotted underline-offset-2 hover:text-fg">
            {showHours ? "Hide hours" : "Hours"}
          </button>
        )}
      </div>
      {showHours && d.hours && (
        <ul className="space-y-0.5 text-muted">
          {d.hours.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {d.phone && (
          <a href={`tel:${d.phone.replace(/\s/g, "")}`} className="flex items-center gap-1 text-muted hover:text-fg">
            <Phone className="size-3.5" /> {d.phone}
          </a>
        )}
        {d.website && (
          <a href={d.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-muted hover:text-fg">
            <Globe className="size-3.5" /> Website
          </a>
        )}
        {d.mapsUri && (
          <a href={d.mapsUri} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-muted hover:text-fg">
            <ExternalLink className="size-3.5" /> Google Maps
          </a>
        )}
      </div>
      <p className="text-[10px] text-muted/70">Live from Google · not saved offline</p>
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9c-.3 1.4-1 2.5-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.7 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8C3.9 20.5 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V7H2.1C1.4 8.5 1 10.2 1 12s.4 3.5 1.1 5l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.5 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 7l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}
