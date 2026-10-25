import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Photo } from "./Photo";
import { ImageOff, Link2, Loader2, Search, Trash2, X } from "lucide-react";
import { searchImages, type PlaceImage, trackPick, forStorage } from "../lib/images";
import { inputCls } from "./NewTripDialog";

/** Pick a photo for a place (or the trip cover) from Wikipedia, Commons and Openverse, or paste a link. */
export function ImagePicker({
  initialQuery,
  name,
  coords,
  current,
  onPick,
  onClose,
}: {
  initialQuery: string;
  name?: string;
  coords?: [number, number];
  current?: PlaceImage;
  onPick: (img: PlaceImage | undefined) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [term, setTerm] = useState(initialQuery);
  const [results, setResults] = useState<PlaceImage[] | null>(null);
  const [link, setLink] = useState("");
  const [broken, setBroken] = useState<Set<string>>(new Set());

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

  const shown = results?.filter((r) => !broken.has(r.thumb)) ?? null;

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
                <button
                  key={img.thumb}
                  onClick={() => pick(img)}
                  className={`group relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-2 ring-accent hover:ring-2 ${current?.thumb === img.thumb ? "ring-2" : ""}`}
                  title={[img.title, img.credit].filter(Boolean).join(" · ")}
                >
                  <Photo
                    srcs={[img.thumb, img.url]}
                    alt={img.title ?? ""}
                    className="size-full object-cover transition-transform group-hover:scale-105"
                    onFail={() => setBroken((b) => new Set(b).add(img.thumb))}
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 px-1.5 pt-4 pb-1 text-left text-[10px] text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
                    {img.source === "unsplash" ? img.credit : `${img.source === "wikipedia" ? "Wikipedia" : img.source === "commons" ? "Commons" : "Openverse"} · ${img.credit ?? ""}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (/^https?:\/\/\S+$/.test(link.trim())) pick({ url: link.trim(), thumb: link.trim(), source: "link", link: link.trim() });
            }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <Link2 className="size-4 shrink-0 text-muted" />
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="…or paste an image URL" className={`${inputCls} py-1.5`} />
          </form>
          {current && (
            <button onClick={() => pick(undefined)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted hover:text-danger">
              <Trash2 className="size-4" /> Remove photo
            </button>
          )}
        </div>
        <p className="-mt-2 text-[10px] text-muted/70">Photos from Unsplash, Wikipedia, Wikimedia Commons and Openverse, with credits kept. Check each image's license before reusing it elsewhere.</p>
      </div>
    </div>,
    document.body,
  );
}
