import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Photo } from "./Photo";
import { PhotoCredit } from "./PhotoCredit";
import { Check, ImageOff, Link2, Loader2, Search, Trash2, X } from "lucide-react";
import { googlePhotos, searchImages, type PlaceImage, trackPick, forStorage, unsplashIssue } from "../lib/images";
import { GOOGLE_KEY } from "../lib/google";
import { inputCls } from "./NewTripDialog";

/** Pick a photo for a place (or the trip cover) from Wikipedia, Commons and Openverse, or paste a link. */
export function ImagePicker({
  initialQuery,
  name,
  coords,
  googlePlaceId,
  address,
  current,
  onPick,
  onClose,
}: {
  initialQuery: string;
  name?: string;
  coords?: [number, number];
  /** The stop's Google place, for its Google Maps photos. */
  googlePlaceId?: string;
  address?: string;
  current?: PlaceImage;
  onPick: (img: PlaceImage | undefined) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [term, setTerm] = useState(initialQuery);
  const [results, setResults] = useState<PlaceImage[] | null>(null);
  const [link, setLink] = useState("");
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [google, setGoogle] = useState<PlaceImage[] | null>(null);
  // Pasted link: previewed first, used only once it actually loads
  const linkUrl = /^https?:\/\/\S+$/.test(link.trim()) ? link.trim() : "";
  const [linkState, setLinkState] = useState<"idle" | "loading" | "ok" | "bad">("idle");
  useEffect(() => setLinkState(linkUrl ? "loading" : "idle"), [linkUrl]);

  useEffect(() => {
    if (!GOOGLE_KEY || !term.trim()) return setGoogle([]);
    let alive = true;
    setGoogle(null);
    const own = term === initialQuery;
    googlePhotos({ placeId: own ? googlePlaceId : undefined, name: own ? (name ?? term) : term, address: own ? address : undefined, coords: own ? coords : undefined })
      .then((g) => alive && setGoogle(g))
      .catch(() => alive && setGoogle([]));
    return () => {
      alive = false;
    };
  }, [term, initialQuery, name, coords, googlePlaceId, address]);

  useEffect(() => {
    if (!term.trim()) return;
    const ctrl = new AbortController();
    setResults(null);
    searchImages(term, { name: term === initialQuery ? name : term, coords: term === initialQuery ? coords : undefined, signal: ctrl.signal })
      .then(setResults)
      .catch(() => setResults([]));
    return () => ctrl.abort();
  }, [term, initialQuery, name, coords]);

  const pick = (img: PlaceImage | undefined) => {
    if (img) trackPick(img);
    onPick(img && forStorage(img));
    onClose();
  };

  const shown = results && google ? [...google, ...results].filter((r) => !broken.has(r.thumb)) : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Choose a photo</h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(q.trim());
          }}
          className="flex gap-2"
        >
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 focus-within:border-accent">
            <Search className="size-4 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-transparent py-2 text-sm outline-none" />
          </div>
          <button className="rounded-lg bg-surface-2 px-4 text-sm hover:text-accent">Search</button>
        </form>

        <div className="min-h-[200px] flex-1 overflow-y-auto">
          {shown === null ? (
            <div className="grid h-48 place-items-center text-muted">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : shown.length === 0 ? (
            <div className="grid h-48 place-items-center text-center text-sm text-muted">
              <div>
                <ImageOff className="mx-auto mb-2 size-6" />
                {navigator.onLine ? "No photos found. Try a broader search, like the city name." : "Photo search needs a connection."}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {shown.map((img) => (
                <figure key={img.thumb} className="min-w-0">
                  <button
                    onClick={() => pick(img)}
                    className={`group relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-2 ring-accent hover:ring-2 ${current?.thumb === img.thumb ? "ring-2" : ""}`}
                    title={img.title ?? "Use this photo"}
                  >
                    <Photo
                      srcs={[img.thumb, img.url]}
                      alt={img.title ?? ""}
                      className="size-full object-cover transition-transform group-hover:scale-105"
                      onFail={() => setBroken((b) => new Set(b).add(img.thumb))}
                    />
                  </button>
                  <figcaption className="mt-1 truncate text-[10.5px] text-muted">
                    <PhotoCredit img={img} />
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        {shown !== null && unsplashIssue && <p className="-mt-1 text-[12px] text-muted">{unsplashIssue}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (linkUrl && linkState === "ok") pick({ url: linkUrl, thumb: linkUrl, source: "link", link: linkUrl });
            }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            {linkUrl ? (
              <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2">
                <img
                  key={linkUrl}
                  src={linkUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  onLoad={() => setLinkState("ok")}
                  onError={() => setLinkState("bad")}
                  className={`size-full object-cover ${linkState === "ok" ? "" : "invisible absolute"}`}
                />
                {linkState === "loading" && <Loader2 className="size-4 animate-spin text-muted" />}
                {linkState === "bad" && <ImageOff className="size-4 text-danger" />}
              </span>
            ) : (
              <Link2 className="size-4 shrink-0 text-muted" />
            )}
            <div className="min-w-0 flex-1">
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="…or paste an image URL" className={`${inputCls} py-1.5`} />
              {linkState === "bad" && <p className="mt-1 text-[12px] text-danger">That link didn't load as an image. Copy the image address itself (right-click the picture).</p>}
            </div>
            {linkUrl && (
              <button
                disabled={linkState !== "ok"}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-bold text-on-accent disabled:opacity-40"
              >
                <Check className="size-4" /> Use image
              </button>
            )}
          </form>
          {current && (
            <button onClick={() => pick(undefined)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted hover:text-danger">
              <Trash2 className="size-4" /> Remove photo
            </button>
          )}
        </div>
        <p className="-mt-2 text-[10px] text-muted/70">Photos from Google Maps, Unsplash, Wikipedia, Wikimedia Commons and Openverse, with credits kept. Check each image's license before reusing it elsewhere.</p>
      </div>
    </div>,
    document.body,
  );
}
