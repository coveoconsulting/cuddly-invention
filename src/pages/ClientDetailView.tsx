import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, FileText, FilePlus, MapPin, Mail, Phone, Save,
  Calendar, ShoppingCart, TrendingUp, MessageSquare, Activity as ActivityIcon, FolderKanban,
} from "lucide-react";
import { ApiError, getJson, patchJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { CommentsThread } from "../components/CommentsThread";
import { CallButton } from "../components/CallButton";
import { VoiceIntake } from "../components/VoiceIntake";
import { useWorkspace } from "../context/WorkspaceContext";
import { useTranslation } from "../i18n";
import type { ClientDetailPayload, Quote } from "../types";

type Tab = "info" | "comments" | "quotes" | "opportunities" | "orders" | "visits" | "documents";

const TABS: Array<{ id: Tab; labelKey: string; icon: typeof FileText }> = [
  { id: "info", labelKey: "client.tab.info", icon: FileText },
  { id: "comments", labelKey: "client.tab.comments", icon: MessageSquare },
  { id: "quotes", labelKey: "client.tab.quotes", icon: FilePlus },
  { id: "opportunities", labelKey: "client.tab.opportunities", icon: TrendingUp },
  { id: "orders", labelKey: "client.tab.orders", icon: ShoppingCart },
  { id: "visits", labelKey: "client.tab.visits", icon: ActivityIcon },
  { id: "documents", labelKey: "client.tab.documents", icon: FolderKanban },
];

export function ClientDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useWorkspace();
  const { t } = useTranslation();
  const [data, setData] = useState<ClientDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("info");
  const [form, setForm] = useState({
    name: "", address: "", city: "", zone: "", contactName: "",
    phone: "", email: "", notes: "",
  });
  const [extra, setExtra] = useState({ segment: "B", status: "active", potentialScore: "50", financialRisk: "low" });
  const [savingInfo, setSavingInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const payload = await getJson<ClientDetailPayload>(`/api/v1/clients/${id}/detail`);
      setData(payload);
      setForm({
        name: payload.client.name,
        address: payload.client.address || "",
        city: payload.client.city || "",
        zone: payload.client.zone || "",
        contactName: payload.client.contactName || "",
        phone: payload.client.phone || "",
        email: payload.client.email || "",
        notes: payload.client.notes || "",
      });
      setExtra({
        segment: payload.client.segment,
        status: payload.client.status,
        potentialScore: String(payload.client.potentialScore ?? 50),
        financialRisk: payload.client.financialRisk,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("client.err.load"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { void load(); }, [load]);

  const saveInfo = async () => {
    if (!id) return;
    setSavingInfo(true);
    try {
      await patchJson(`/api/v1/clients/${id}`, {
        ...form,
        segment: extra.segment,
        status: extra.status,
        potentialScore: Number(extra.potentialScore),
        financialRisk: extra.financialRisk,
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("client.err.save"));
    } finally {
      setSavingInfo(false);
    }
  };

  const createQuote = async () => {
    if (!id) return;
    try {
      const q = await postJson<{ id: string }>(`/api/v1/quotes`, { clientId: id });
      navigate(`/quotes/${q.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("client.err.quote"));
    }
  };

  const createOpportunity = async () => {
    if (!id || !data) return;
    const expectedClose = new Date();
    expectedClose.setDate(expectedClose.getDate() + 30);
    try {
      await postJson(`/api/v1/opportunities`, {
        clientId: id,
        clientName: data.client.name,
        stage: "qualification",
        amount: 0,
        probability: 20,
        expectedClose: expectedClose.toISOString().slice(0, 10),
        nextAction: "Qualifier le besoin client",
      });
      navigate("/pipeline");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("client.err.opportunity"));
    }
  };

  const createVisit = async () => {
    if (!id || !data) return;
    try {
      const visit = await postJson<{ id: string }>(`/api/v1/visits`, {
        clientId: id,
        clientName: data.client.name,
        scheduledDate: new Date().toISOString().slice(0, 10),
        objective: "Visite de suivi commercial",
      });
      navigate(`/visits/${visit.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("client.err.visit"));
    }
  };

  const createOrder = async () => {
    if (!id || !data) return;
    try {
      await postJson(`/api/v1/orders`, {
        clientId: id,
        clientName: data.client.name,
        amount: 0,
        status: "draft",
        notes: "Commande brouillon creee depuis la fiche client",
      });
      navigate("/orders");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("client.err.order"));
    }
  };

  if (loading) {
    return <div className="p-6 text-secondary">{t("common.loading")}</div>;
  }
  if (!data) {
    return (
      <div className="p-6">
        <p className="text-error">{error || t("client.notFound")}</p>
        <Link to="/clients" className="mt-3 inline-block text-sm text-primary">← {t("qd.back")}</Link>
      </div>
    );
  }

  const c = data.client;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <Link to="/clients" className="inline-flex items-center gap-1 text-xs text-secondary hover:text-on-surface">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("client.backToAll")}
      </Link>

      {error ? (
        <div className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-error">{error}</div>
      ) : null}

      {/* header card */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-on-surface">{c.name}</h1>
              <Badge variant={c.type === "client" ? "success" : "default"}>
                {t(`enum.clientType.${c.type}`)}
              </Badge>
              <Badge variant={c.status === "active" ? "success" : c.status === "blocked" ? "error" : "neutral"}>
                {t(`enum.clientStatus.${c.status}`)}
              </Badge>
              <Badge variant="default">{t("client.seg", { s: c.segment })}</Badge>
              <Badge variant={c.financialRisk === "low" ? "neutral" : c.financialRisk === "medium" ? "warning" : "error"}>
                {t(`enum.risk.${c.financialRisk}`)}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-secondary">
              {c.contactName ? <span>{c.contactName}</span> : null}
              {c.phone ? <span className="inline-flex items-center gap-2"><span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span><CallButton phone={c.phone} name={c.name} clientId={c.id} onLogged={load} /></span> : null}
              {c.email ? <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-on-surface"><Mail className="h-3 w-3" />{c.email}</a> : null}
              {c.address || c.city ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{[c.address, c.city].filter(Boolean).join(", ")}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can("opportunities.write") ? (
              <Button variant="outline" onClick={() => void createOpportunity()}>
                <TrendingUp className="mr-1.5 h-4 w-4" /> {t("client.actions.opportunity")}
              </Button>
            ) : null}
            {can("visits.write") ? (
              <Button variant="outline" onClick={() => void createVisit()}>
                <Calendar className="mr-1.5 h-4 w-4" /> {t("client.actions.planVisit")}
              </Button>
            ) : null}
            {can("orders.write") ? (
              <Button variant="outline" onClick={() => void createOrder()}>
                <ShoppingCart className="mr-1.5 h-4 w-4" /> {t("client.actions.order")}
              </Button>
            ) : null}
            {can("orders.write") ? (
              <Button onClick={() => void createQuote()}>
                <FilePlus className="mr-1.5 h-4 w-4" /> {t("client.actions.newQuote")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {can("visits.write") ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">{t("client.voiceTitle")}</p>
          <VoiceIntake
            entityName={c.name}
            clientId={c.id}
            currency={data.quotes[0]?.currency}
            onApplied={load}
            onCreateQuote={createQuote}
          />
        </div>
      ) : null}

      {/* tabs */}
      <div className="flex flex-wrap gap-1 border-b border-outline-variant">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.id;
          const count =
            tb.id === "quotes" ? data.quotes.length
              : tb.id === "opportunities" ? data.opportunities.length
              : tb.id === "orders" ? data.orders.length
              : tb.id === "visits" ? data.visits.length
              : tb.id === "documents" ? data.documents.length
              : 0;
          return (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "border-primary text-on-surface"
                  : "border-transparent text-secondary hover:text-on-surface"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(tb.labelKey)}
              {count > 0 ? <span className="ml-1 rounded-full bg-surface-container px-1.5 text-[10px]">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {/* tab content */}
      <div>
        {tab === "info" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3">
              <h3 className="text-sm font-bold text-on-surface">{t("client.info.coords")}</h3>
              {[
                ["name", "client.field.name"],
                ["contactName", "client.field.contact"],
                ["phone", "client.field.phone"],
                ["email", "client.field.email"],
                ["address", "client.field.address"],
                ["city", "client.field.city"],
                ["zone", "client.field.zone"],
              ].map(([key, labelKey]) => (
                <div key={key}>
                  <label className="mb-1 block text-[11px] font-semibold text-secondary">{t(labelKey)}</label>
                  <input
                    value={(form as Record<string, string>)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    disabled={!can("clients.write")}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("client.notes")}</label>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  disabled={!can("clients.write")}
                  className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3">
              <h3 className="text-sm font-bold text-on-surface">{t("client.qualification")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("client.field.segment")}</label>
                  <select
                    value={extra.segment}
                    onChange={(e) => setExtra({ ...extra, segment: e.target.value })}
                    disabled={!can("clients.write")}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    {["A", "B", "C"].map((s) => <option key={s} value={s}>{t("clients.form.segmentOpt", { s })}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("client.field.status")}</label>
                  <select
                    value={extra.status}
                    onChange={(e) => setExtra({ ...extra, status: e.target.value })}
                    disabled={!can("clients.write")}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    {["active", "inactive", "blocked"].map((s) => <option key={s} value={s}>{t(`enum.clientStatus.${s}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("client.field.potentialScore")}</label>
                  <input
                    type="number" min={0} max={100}
                    value={extra.potentialScore}
                    onChange={(e) => setExtra({ ...extra, potentialScore: e.target.value })}
                    disabled={!can("clients.write")}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("client.field.risk")}</label>
                  <select
                    value={extra.financialRisk}
                    onChange={(e) => setExtra({ ...extra, financialRisk: e.target.value })}
                    disabled={!can("clients.write")}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    {["low", "medium", "high"].map((s) => <option key={s} value={s}>{t(`enum.risk.${s}`)}</option>)}
                  </select>
                </div>
              </div>
              <div className="rounded-lg bg-surface px-3 py-2 text-xs text-secondary">
                <p>{t("client.owner")} <strong className="text-on-surface">{c.ownerName}</strong></p>
                <p>{t("client.territory")} <strong className="text-on-surface">{c.territoryLabel}</strong></p>
              </div>
              {can("clients.write") ? (
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => void saveInfo()} disabled={savingInfo}>
                    <Save className="mr-1 h-3.5 w-3.5" /> {savingInfo ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "comments" ? <CommentsThread entityType="client" entityId={c.id} /> : null}

        {tab === "quotes" ? (
          <div className="space-y-2">
            {data.quotes.length === 0 ? (
              <p className="text-sm text-secondary">{t("client.noQuotes")}</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-outline-variant">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container text-xs uppercase text-secondary">
                    <tr>
                      <th className="px-3 py-2 text-left">{t("quotes.col.number")}</th>
                      <th className="px-3 py-2 text-left">{t("quotes.col.status")}</th>
                      <th className="px-3 py-2 text-right">{t("quotes.col.total")}</th>
                      <th className="px-3 py-2 text-left">{t("quotes.col.issued")}</th>
                      <th className="px-3 py-2 text-left">{t("quotes.col.signed")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.quotes.map((q) => (
                      <tr key={q.id} className="border-t border-outline-variant hover:bg-surface-container">
                        <td className="px-3 py-2">
                          <Link to={`/quotes/${q.id}`} className="font-semibold text-on-surface hover:text-primary">
                            {q.number}
                          </Link>
                        </td>
                        <td className="px-3 py-2"><QuoteStatusBadge status={q.status} /></td>
                        <td className="px-3 py-2 text-right font-semibold">{q.total.toFixed(2)} {q.currency}</td>
                        <td className="px-3 py-2 text-xs text-secondary">{q.issuedAt ? new Date(q.issuedAt).toLocaleDateString("fr-FR") : "—"}</td>
                        <td className="px-3 py-2 text-xs text-secondary">{q.signedAt ? new Date(q.signedAt).toLocaleDateString("fr-FR") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {tab === "opportunities" ? (
          <SimpleList
            empty={t("client.empty.opportunities")}
            rows={data.opportunities.map((o) => ({
              key: o.id, primary: t(`enum.stage.${o.stage}`), secondary: t("client.opp.secondary", { close: o.expectedClose, priority: t(`enum.priority.${o.priority}`) }),
              right: `${o.amount.toFixed(2)}`,
            }))}
          />
        ) : null}

        {tab === "orders" ? (
          <SimpleList
            empty={t("client.empty.orders")}
            rows={data.orders.map((o) => ({
              key: o.id, primary: t("client.order.primary", { date: o.date }), secondary: t("client.order.secondary", { status: t(`enum.orderStatus.${o.status}`), approval: t(`enum.approval.${o.approvalStatus}`) }),
              right: `${o.amount.toFixed(2)}`,
            }))}
          />
        ) : null}

        {tab === "visits" ? (
          <SimpleList
            empty={t("client.empty.visits")}
            rows={data.visits.map((v) => ({
              key: v.id, primary: v.objective || t("client.visit.default"), secondary: t("client.visit.secondary", { date: v.scheduledDate, status: t(`enum.visitStatus.${v.status}`) }),
              right: <Link className="text-xs text-primary" to={`/visits/${v.id}`}>{t("client.open")}</Link>,
            }))}
          />
        ) : null}

        {tab === "documents" ? (
          <SimpleList
            empty={t("client.empty.documents")}
            rows={data.documents.map((d) => ({
              key: d.id, primary: d.name, secondary: `${(d.sizeBytes / 1024).toFixed(1)} ${t("client.kb")} · ${new Date(d.createdAt).toLocaleDateString("fr-FR")}`,
              right: <a className="text-xs text-primary" href={d.blobUrl} target="_blank" rel="noreferrer">{t("client.download")}</a>,
            }))}
          />
        ) : null}
      </div>
    </div>
  );
}

function SimpleList({
  rows, empty,
}: {
  rows: Array<{ key: string; primary: React.ReactNode; secondary?: React.ReactNode; right?: React.ReactNode }>;
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-secondary">{empty}</p>;
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between border-b border-outline-variant px-3 py-2.5 last:border-b-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-on-surface">{r.primary}</p>
            {r.secondary ? <p className="mt-0.5 truncate text-xs text-secondary">{r.secondary}</p> : null}
          </div>
          {r.right ? <div className="ml-3 shrink-0">{r.right}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function QuoteStatusBadge({ status }: { status: Quote["status"] }) {
  const { t } = useTranslation();
  const tone: Record<Quote["status"], "default" | "success" | "warning" | "error" | "neutral"> = {
    draft: "neutral",
    sent: "default",
    signed: "success",
    refused: "error",
    expired: "warning",
    cancelled: "neutral",
  };
  return <Badge variant={tone[status]}>{t(`enum.quoteStatus.${status}`)}</Badge>;
}
