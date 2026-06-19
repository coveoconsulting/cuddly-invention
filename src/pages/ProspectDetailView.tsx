import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRightCircle, FilePlus, Mail, MessageSquare, Phone, Save,
} from "lucide-react";
import { ApiError, getJson, patchJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { CommentsThread } from "../components/CommentsThread";
import { useWorkspace } from "../context/WorkspaceContext";
import type { ProspectDetailPayload, ProspectStatus } from "../types";
import { QuoteStatusBadge } from "./ClientDetailView";

const STATUS: Array<{ id: ProspectStatus; label: string }> = [
  { id: "new", label: "Nouveau" },
  { id: "qualified", label: "Qualifié" },
  { id: "contacted", label: "Contacté" },
  { id: "converted", label: "Converti" },
  { id: "lost", label: "Perdu" },
];

export function ProspectDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useWorkspace();
  const [data, setData] = useState<ProspectDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"info" | "comments" | "quotes" | "activities">("info");
  const [form, setForm] = useState({ name: "", contactName: "", phone: "", email: "", source: "", notes: "", status: "new" as ProspectStatus, score: 50 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const payload = await getJson<ProspectDetailPayload>(`/api/v1/prospects/${id}/detail`);
      setData(payload);
      setForm({
        name: payload.prospect.name,
        contactName: payload.prospect.contactName || "",
        phone: payload.prospect.phone || "",
        email: payload.prospect.email || "",
        source: payload.prospect.source || "",
        notes: payload.prospect.notes || "",
        status: payload.prospect.status,
        score: payload.prospect.score,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await patchJson(`/api/v1/prospects/${id}`, form);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const convert = async () => {
    if (!id) return;
    try {
      const r = await postJson<{ client: { id: string } }>(`/api/v1/prospects/${id}/convert`);
      if (r?.client?.id) navigate(`/clients/${r.client.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Conversion impossible");
    }
  };

  const createQuote = async () => {
    if (!id) return;
    try {
      const q = await postJson<{ id: string }>(`/api/v1/quotes`, { prospectId: id });
      navigate(`/quotes/${q.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Création devis impossible");
    }
  };

  if (loading) return <div className="p-6 text-secondary">Chargement…</div>;
  if (!data) {
    return (
      <div className="p-6">
        <p className="text-error">{error || "Prospect introuvable"}</p>
        <Link to="/prospects" className="mt-3 inline-block text-sm text-primary">← Retour</Link>
      </div>
    );
  }

  const p = data.prospect;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <Link to="/prospects" className="inline-flex items-center gap-1 text-xs text-secondary hover:text-on-surface">
        <ArrowLeft className="h-3.5 w-3.5" /> Tous les prospects
      </Link>

      {error ? (
        <div className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-error">{error}</div>
      ) : null}

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-on-surface">{p.name}</h1>
              <Badge variant={p.status === "converted" ? "success" : p.status === "lost" ? "error" : "default"}>
                {STATUS.find((s) => s.id === p.status)?.label}
              </Badge>
              <Badge variant="neutral">Score {p.score}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-secondary">
              {p.contactName ? <span>{p.contactName}</span> : null}
              {p.phone ? <a className="inline-flex items-center gap-1 hover:text-on-surface" href={`tel:${p.phone}`}><Phone className="h-3 w-3" />{p.phone}</a> : null}
              {p.email ? <a className="inline-flex items-center gap-1 hover:text-on-surface" href={`mailto:${p.email}`}><Mail className="h-3 w-3" />{p.email}</a> : null}
              {p.source ? <span>Source : {p.source}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can("clients.write") && p.status !== "converted" ? (
              <Button variant="outline" onClick={() => void convert()}>
                <ArrowRightCircle className="mr-1 h-4 w-4" /> Convertir en client
              </Button>
            ) : null}
            {can("orders.write") ? (
              <Button onClick={() => void createQuote()}>
                <FilePlus className="mr-1 h-4 w-4" /> Nouveau devis
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-outline-variant">
        {(["info", "comments", "quotes", "activities"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 ${
              tab === t ? "border-primary text-on-surface" : "border-transparent text-secondary"
            }`}
          >
            {t === "info" ? "Informations" : t === "comments" ? "Commentaires" : t === "quotes" ? `Devis (${data.quotes.length})` : `Activités (${data.activities.length})`}
          </button>
        ))}
      </div>

      {tab === "info" ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="grid gap-3 md:grid-cols-2">
            {([
              ["name", "Raison sociale"],
              ["contactName", "Contact"],
              ["phone", "Téléphone"],
              ["email", "Email"],
              ["source", "Source"],
            ] as Array<["name" | "contactName" | "phone" | "email" | "source", string]>).map(([k, l]) => (
              <div key={k}>
                <label className="mb-1 block text-[11px] font-semibold text-secondary">{l}</label>
                <input
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  disabled={!can("clients.write")}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-secondary">Statut</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ProspectStatus })}
                disabled={!can("clients.write")}
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-secondary">Score</label>
              <input
                type="number" min={0} max={100}
                value={form.score}
                onChange={(e) => setForm({ ...form, score: Number(e.target.value) })}
                disabled={!can("clients.write")}
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-semibold text-secondary">Notes internes</label>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              disabled={!can("clients.write")}
              className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          {can("clients.write") ? (
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                <Save className="mr-1 h-3.5 w-3.5" /> {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "comments" ? <CommentsThread entityType="prospect" entityId={p.id} /> : null}

      {tab === "quotes" ? (
        data.quotes.length === 0 ? (
          <p className="text-sm text-secondary">Aucun devis émis pour ce prospect.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-outline-variant">
            <table className="w-full text-sm">
              <thead className="bg-surface-container text-xs uppercase text-secondary">
                <tr><th className="px-3 py-2 text-left">Numéro</th><th className="px-3 py-2 text-left">Statut</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-left">Signé</th></tr>
              </thead>
              <tbody>
                {data.quotes.map((q) => (
                  <tr key={q.id} className="border-t border-outline-variant">
                    <td className="px-3 py-2"><Link to={`/quotes/${q.id}`} className="font-semibold hover:text-primary">{q.number}</Link></td>
                    <td className="px-3 py-2"><QuoteStatusBadge status={q.status} /></td>
                    <td className="px-3 py-2 text-right font-semibold">{q.total.toFixed(2)} {q.currency}</td>
                    <td className="px-3 py-2 text-xs text-secondary">{q.signedAt ? new Date(q.signedAt).toLocaleDateString("fr-FR") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "activities" ? (
        data.activities.length === 0 ? (
          <p className="text-sm text-secondary">Aucune activité enregistrée.</p>
        ) : (
          <div className="space-y-2">
            {data.activities.map((a) => (
              <div key={a.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-on-surface">{a.subject}</p>
                  <span className="text-[10px] text-secondary">{new Date(a.createdAt).toLocaleString("fr-FR")}</span>
                </div>
                <p className="text-[10px] uppercase text-secondary">{a.type}</p>
                {a.content ? <p className="mt-1 whitespace-pre-wrap text-sm">{a.content}</p> : null}
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

// keep import used
void MessageSquare;
