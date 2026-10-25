import type { PlaceImage } from "../lib/images";

const UNSPLASH = "https://unsplash.com/?utm_source=travelplanner&utm_medium=referral";

/** "Photo by Jane Doe on Unsplash" (both linked), or the source's own credit line. */
export function PhotoCredit({ img, className = "" }: { img: PlaceImage; className?: string }) {
  const a = "underline decoration-current/40 underline-offset-2 hover:decoration-current";
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (img.source === "unsplash") {
    const name = img.authorName ?? img.credit?.replace(/^Photo: /, "").replace(/ on Unsplash$/, "") ?? "Unknown";
    return (
      <span className={className}>
        Photo by{" "}
        <a href={img.author ?? img.link} target="_blank" rel="noreferrer" onClick={stop} className={a}>
          {name}
        </a>{" "}
        on{" "}
        <a href={UNSPLASH} target="_blank" rel="noreferrer" onClick={stop} className={a}>
          Unsplash
        </a>
      </span>
    );
  }
  const label = img.source === "wikipedia" ? "Wikipedia" : img.source === "commons" ? "Wikimedia Commons" : img.source === "openverse" ? "Openverse" : "";
  const text = [img.credit && !img.credit.startsWith("Wikipedia") ? img.credit : null, label].filter(Boolean).join(" · ");
  if (!text) return null;
  return (
    <span className={className}>
      {img.link ? (
        <a href={img.link} target="_blank" rel="noreferrer" onClick={stop} className={a}>
          {text}
        </a>
      ) : (
        text
      )}
    </span>
  );
}
