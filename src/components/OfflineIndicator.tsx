import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { flushQueue, subscribe } from "../lib/offlineQueue";

/**
 * Shows the connectivity state and how many CRM writes are waiting to sync.
 * Hidden entirely when online with an empty queue (the happy path).
 */
export function OfflineIndicator() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => subscribe(setPending), []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online && pending === 0) return null;

  const offline = !online;
  return (
    <button
      type="button"
      onClick={() => void flushQueue()}
      title={offline ? "Hors-ligne — les modifications seront synchronisées" : "Synchroniser maintenant"}
      className={`flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-all ${
        offline
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-outline-variant bg-white/80 text-secondary hover:bg-white"
      }`}
    >
      {offline ? <CloudOff className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
      {pending > 0 ? <span>{pending}</span> : <span className="hidden sm:inline">Hors-ligne</span>}
    </button>
  );
}
