import { Cloud, CloudOff, Loader2 } from "lucide-react";
import type { SyncStatus } from "../lib/sync";

export function SyncBadge({ status }: { status: SyncStatus }) {
  const map = {
    online: { icon: <Cloud className="size-3.5" />, text: "Synced", cls: "text-accent" },
    connecting: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Connecting", cls: "text-muted" },
    offline: { icon: <CloudOff className="size-3.5" />, text: "Offline · saved on device", cls: "text-muted" },
  }[status];
  return (
    <span className={`flex items-center gap-1.5 text-xs ${map.cls}`} title={status === "offline" ? "Changes sync when you're back online" : undefined}>
      {map.icon}
      {map.text}
    </span>
  );
}
