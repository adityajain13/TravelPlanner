/** After a Wanderlog import: the places that couldn't be put on the map, with a dismiss button. */
export function UnpinnedNotice({ unpinned, onDismiss }: { unpinned: string[]; onDismiss: () => void }) {
  return (
    <div className="mx-2 mt-4 rounded-xl border border-line bg-surface-2 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p>
          <span className="font-semibold">{unpinned.length} place{unpinned.length > 1 ? "s" : ""} without a map pin</span>
          <span className="text-muted">. Generic names (parking, rest stops) are skipped on purpose. Select one and use Google details, or delete and re-add it.</span>
        </p>
        <button onClick={onDismiss} className="text-muted hover:text-fg" aria-label="Dismiss">
          ✕
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">{unpinned.join(" · ")}</p>
    </div>
  );
}
