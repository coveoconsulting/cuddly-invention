import { useEffect, useState } from "react";
import { Cable, CheckCircle2, RefreshCcw, Settings2, ShieldAlert } from "lucide-react";
import type { IntegrationItem } from "../types";
import { ApiError, asArray, getJson, patchJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import { formatDateTime } from "../lib/labels";

type IntegrationForm = {
  endpointUrl: string;
  status: IntegrationItem["status"];
  description: string;
};

export function IntegrationsView() {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<IntegrationItem | null>(null);
  const [form, setForm] = useState<IntegrationForm>({
    endpointUrl: "",
    status: "configured",
    description: "",
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadIntegrations = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<unknown>("/api/v1/integrations");
      setIntegrations(asArray<IntegrationItem>(payload));
      setError("");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Chargement impossible");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadIntegrations();
  }, []);

  const openEdit = (integration: IntegrationItem) => {
    setEditing(integration);
    setForm({
      endpointUrl: integration.endpointUrl || "",
      status: integration.status,
      description: integration.description || "",
    });
    setError("");
  };

  const saveIntegration = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setSavingId(editing.id);
    try {
      await patchJson(`/api/v1/integrations/${editing.id}`, form);
      setEditing(null);
      await loadIntegrations();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Configuration impossible");
    } finally {
      setSavingId(null);
    }
  };

  const syncIntegration = async (integration: IntegrationItem) => {
    setSavingId(integration.id);
    try {
      await postJson(`/api/v1/integrations/${integration.id}/sync`);
      await loadIntegrations();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Synchronisation impossible");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm text-secondary">Connecteurs et synchronisations</p>
        <h1 className="mt-1 text-3xl font-black text-on-surface">Integrations</h1>
      </div>

      {error ? (
        <div className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-error">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">
          Chargement des integrations...
        </div>
      ) : integrations.length === 0 ? (
        <EmptyState
          title="Aucune integration configuree"
          description="Les connecteurs ERP, messagerie, cartographie ou stock apparaitront ici des leur configuration."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-on-surface">{integration.name}</p>
                  <p className="mt-1 text-sm text-secondary">{integration.provider}</p>
                </div>
                <Badge
                  variant={
                    integration.status === "connected"
                      ? "success"
                      : integration.status === "configured"
                        ? "default"
                        : "warning"
                  }
                >
                  {integration.status}
                </Badge>
              </div>
              <p className="mt-4 text-sm text-secondary">{integration.description}</p>
              <div className="mt-5 space-y-2 text-xs text-secondary">
                <p>Perimetre : {integration.scope}</p>
                <p>Endpoint : {integration.endpointUrl || "Non configure"}</p>
                <p>Derniere synchro : {formatDateTime(integration.lastSyncAt)}</p>
                {integration.lastError ? <p className="text-error">Erreur : {integration.lastError}</p> : null}
              </div>
              <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-on-surface">
                {integration.status === "connected" ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : integration.status === "attention" ? (
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                ) : (
                  <Cable className="h-4 w-4 text-primary" />
                )}
                {integration.status === "connected"
                  ? "Operationnelle"
                  : integration.status === "attention"
                    ? "Action requise"
                    : "Prete a activer"}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(integration)}>
                  <Settings2 className="mr-1 h-3.5 w-3.5" />
                  Configurer
                </Button>
                <Button
                  size="sm"
                  onClick={() => void syncIntegration(integration)}
                  disabled={savingId === integration.id}
                >
                  <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                  {savingId === integration.id ? "Sync..." : "Synchroniser"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void saveIntegration(event)}
            className="w-full max-w-lg space-y-4 rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl"
          >
            <div>
              <p className="text-sm font-bold text-on-surface">Configurer {editing.name}</p>
              <p className="mt-1 text-xs text-secondary">{editing.provider}</p>
            </div>
            <input
              className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              placeholder="Endpoint API / webhook / URL connecteur"
              value={form.endpointUrl}
              onChange={(event) => setForm({ ...form, endpointUrl: event.target.value })}
            />
            <select
              className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value as IntegrationItem["status"] })}
            >
              <option value="configured">Configure</option>
              <option value="connected">Connecte</option>
              <option value="attention">Attention requise</option>
            </select>
            <textarea
              className="min-h-24 w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              placeholder="Description operationnelle"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={savingId === editing.id}>
                Enregistrer
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
