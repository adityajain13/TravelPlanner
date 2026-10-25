import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import { RefreshCw } from "lucide-react";

/** After a deploy, an open tab can ask for a code chunk that no longer exists. Reload once to get the new build. */
export const isChunkError = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically|ChunkLoadError|Loading chunk/i.test(String((e as Error)?.message ?? e));

export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem("tp-chunk-reload") ?? 0);
    if (Date.now() - last < 20000) return false; // already tried just now: show the error instead of looping
    sessionStorage.setItem("tp-chunk-reload", String(Date.now()));
  } catch {
    /* storage blocked: still reload */
  }
  location.reload();
  return true;
}

export function RouteError() {
  const err = useRouteError();
  const chunk = isChunkError(err);
  useEffect(() => {
    if (chunk) reloadOnce();
  }, [chunk]);
  return (
    <div className="grid min-h-full place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="font-display text-2xl">{chunk ? "Updating to the latest version…" : "Something went wrong"}</h1>
        <p className="text-muted">{chunk ? "A new version was deployed while this tab was open." : String((err as Error)?.message ?? err)}</p>
        <button onClick={() => location.reload()} className="mx-auto flex items-center gap-2 rounded-full bg-accent px-5 py-2 font-bold text-on-accent">
          <RefreshCw className="size-4" /> Reload
        </button>
      </div>
    </div>
  );
}
