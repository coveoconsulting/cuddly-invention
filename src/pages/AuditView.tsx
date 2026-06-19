import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { ApiError, asArray, getJson } from "../lib/api";
import { Badge } from "../components/ui";
import { Skeleton } from "../components/Skeleton";
import { useWorkspace } from "../context/WorkspaceContext";
import { formatDateTime } from "../lib/labels";

type AuditLogEntry = {
  id: string;
  actorUserId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export function AuditView() {
  const { can } = useWorkspace();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getJson<unknown>("/api/v1/audit-logs?limit=200")
      .then((payload) => {
        if (!cancelled) {
          setLogs(asArray<AuditLogEntry>(payload));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof ApiError ? reason.message : "Chargement impossible");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!can("audit.read")) {
    return (
      <div className="p-6">
        <p className="text-sm text-secondary">Acces reserve aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm text-secondary">Journal d'activite</p>
        <h1 className="mt-1 text-3xl font-black text-on-surface">Audit logs</h1>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3"
            >
              <Skeleton className="mt-1 h-4 w-4 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-2 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-error/20 bg-error-container p-4 text-sm text-error">
          {error}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center text-secondary">
          Aucune entree pour l'instant.
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3"
            >
              <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-on-surface">{entry.actorName}</span>
                  <Badge variant="neutral">{entry.action}</Badge>
                  <span className="text-xs text-secondary">{entry.entityType}/{entry.entityId}</span>
                </div>
                {entry.meta ? (
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-surface px-2 py-1 text-[11px] text-secondary">
                    {JSON.stringify(entry.meta)}
                  </pre>
                ) : null}
              </div>
              <span className="shrink-0 text-[11px] text-secondary">
                {formatDateTime(entry.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
