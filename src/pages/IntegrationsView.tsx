import { useEffect, useState } from "react";
import { Cable, CheckCircle2, ShieldAlert } from "lucide-react";
import type { IntegrationItem } from "../types";
import { getJson } from "../lib/api";
import { Badge } from "../components/ui";
import { formatDateTime } from "../lib/labels";

export function IntegrationsView() {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadIntegrations = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<IntegrationItem[]>("/api/v1/integrations");
      setIntegrations(payload);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-secondary">Connecteurs et synchronisations</p>
        <h1 className="text-3xl font-black text-on-surface mt-1">Integrations</h1>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">
          Chargement des integrations...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {integrations.map((integration) => (
            <div key={integration.id} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-on-surface">{integration.name}</p>
                  <p className="text-sm text-secondary mt-1">{integration.provider}</p>
                </div>
                <Badge variant={integration.status === "connected" ? "success" : integration.status === "configured" ? "default" : "warning"}>
                  {integration.status}
                </Badge>
              </div>
              <p className="text-sm text-secondary mt-4">{integration.description}</p>
              <div className="mt-5 space-y-2 text-xs text-secondary">
                <p>Scope: {integration.scope}</p>
                <p>Derniere sync: {formatDateTime(integration.lastSyncAt)}</p>
              </div>
              <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-on-surface">
                {integration.status === "connected" ? (
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                ) : integration.status === "attention" ? (
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                ) : (
                  <Cable className="w-4 h-4 text-primary" />
                )}
                {integration.status === "connected"
                  ? "Operationnelle"
                  : integration.status === "attention"
                    ? "Action requise"
                    : "Prete a activer"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
