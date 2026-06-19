import { useEffect, useMemo, useState } from "react";
import { ArrowRightCircle, Trash2, UserPlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { Prospect, ProspectStatus } from "../types";
import { ApiError, asArray, getJson, patchJson, postJson, requestJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { SkeletonCard } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { useWorkspace } from "../context/WorkspaceContext";

const STATUS_LABEL: Record<ProspectStatus, string> = {
  new: "Nouveau",
  qualified: "Qualifié",
  contacted: "Contacté",
  converted: "Converti",
  lost: "Perdu",
};

const STATUS_TONE: Record<ProspectStatus, "default" | "neutral" | "warning" | "success" | "error"> = {
  new: "neutral",
  qualified: "default",
  contacted: "warning",
  converted: "success",
  lost: "error",
};

const COLUMNS: ProspectStatus[] = ["new", "qualified", "contacted", "converted", "lost"];

export function ProspectsView() {
  const navigate = useNavigate();
  const { can } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", contactName: "", email: "", phone: "", source: "", notes: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<unknown>("/api/v1/prospects");
      setProspects(asArray<Prospect>(payload));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<ProspectStatus, Prospect[]>();
    COLUMNS.forEach((status) => map.set(status, []));
    prospects.forEach((prospect) => {
      const list = map.get(prospect.status) || [];
      list.push(prospect);
      map.set(prospect.status, list);
    });
    return map;
  }, [prospects]);

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await postJson("/api/v1/prospects", form);
      toast.success("Prospect créé", { title: form.name });
      setShowCreate(false);
      setForm({ name: "", contactName: "", email: "", phone: "", source: "", notes: "" });
      await load();
    } catch (reason) {
      const message = reason instanceof ApiError ? reason.message : "Création impossible";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (prospect: Prospect, status: ProspectStatus) => {
    try {
      await patchJson(`/api/v1/prospects/${prospect.id}`, { status });
      await load();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "Modification impossible");
    }
  };

  const convert = async (prospect: Prospect) => {
    const decision = await confirm({
      title: `Convertir ${prospect.name} en client ?`,
      description: "Un compte client sera créé. Le prospect passera au statut converti.",
      confirmLabel: "Convertir",
    });
    if (!decision.confirmed) return;
    try {
      const result = await postJson<{ client: { id: string } }>(`/api/v1/prospects/${prospect.id}/convert`);
      toast.success("Prospect converti", { title: prospect.name });
      await load();
      if (result?.client?.id) {
        navigate(`/clients`);
      }
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "Conversion impossible");
    }
  };

  const remove = async (prospect: Prospect) => {
    if (busyId) return;
    const decision = await confirm({
      title: `Supprimer ${prospect.name} ?`,
      description: "Le prospect et son historique d'activités seront retirés.",
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (!decision.confirmed) return;
    setBusyId(prospect.id);
    setProspects((current) => current.filter((entry) => entry.id !== prospect.id));
    try {
      await requestJson(`/api/v1/prospects/${prospect.id}`, { method: "DELETE" });
      toast.success(`${prospect.name} supprimé`);
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "Suppression impossible");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1580px] space-y-5 p-4 md:p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-secondary">Top du funnel</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">Prospects</h1>
          <p className="mt-1 text-sm text-secondary">Suivi des leads, scoring et conversion en compte client.</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/v1/prospects?format=csv"
            className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm font-semibold text-on-surface hover:bg-surface"
          >
            Export CSV
          </a>
          {can("clients.write") ? (
            <Button onClick={() => setShowCreate(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Nouveau prospect
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((status) => {
            const items = grouped.get(status) || [];
            return (
              <div key={status} className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-low p-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-secondary">{STATUS_LABEL[status]}</p>
                  <Badge variant={STATUS_TONE[status]}>{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-outline-variant bg-white/40 px-3 py-4 text-center text-xs text-secondary">
                      Vide
                    </p>
                  ) : (
                    items.map((prospect) => (
                      <div key={prospect.id} className="space-y-2 rounded-xl border border-outline-variant bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link to={`/prospects/${prospect.id}`} className="truncate text-sm font-bold text-on-surface hover:text-primary">
                              {prospect.name}
                            </Link>
                            <p className="truncate text-xs text-secondary">{prospect.contactName || prospect.email || "Sans contact"}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="neutral">{prospect.score}</Badge>
                            {can("prospects.delete") ? (
                              <button
                                type="button"
                                onClick={() => void remove(prospect)}
                                disabled={busyId === prospect.id}
                                title="Supprimer"
                                className="flex h-6 w-6 items-center justify-center rounded-md text-secondary hover:bg-error-container hover:text-error disabled:opacity-50"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {prospect.source ? (
                          <p className="text-[11px] text-secondary">Source : {prospect.source}</p>
                        ) : null}
                        {can("clients.write") && status !== "converted" ? (
                          <div className="flex flex-wrap gap-1">
                            {COLUMNS.filter((target) => target !== status && target !== "converted").map((target) => (
                              <button
                                key={target}
                                type="button"
                                onClick={() => void updateStatus(prospect, target)}
                                className="rounded-full border border-outline-variant px-2 py-0.5 text-[10px] font-semibold text-secondary hover:bg-surface"
                              >
                                → {STATUS_LABEL[target]}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => void convert(prospect)}
                              className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-on-primary"
                            >
                              <ArrowRightCircle className="h-3 w-3" />
                              Convertir
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={submitCreate} className="w-full max-w-xl space-y-3 rounded-2xl border border-outline-variant bg-white p-6 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-secondary">Nouveau prospect</p>
              <h3 className="mt-1 text-xl font-black text-on-surface">Lead à qualifier</h3>
            </div>
            <input className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Nom de l'entité" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            <div className="grid grid-cols-2 gap-3">
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Contact" value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Téléphone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Source (site web, salon, ...)" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
            </div>
            <textarea className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} />
            {error ? <p className="text-xs text-error">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
              <Button type="submit" loading={saving}>Créer</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
