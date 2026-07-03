import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRightCircle, CalendarPlus, FilePlus, Mail, MapPinned, MessageSquare, Phone, Save, Target,
} from "lucide-react";
import { ApiError, getJson, patchJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { CommentsThread } from "../components/CommentsThread";
import { CallButton } from "../components/CallButton";
import { VoiceIntake } from "../components/VoiceIntake";
import { useWorkspace } from "../context/WorkspaceContext";
import { useTranslation } from "../i18n";
import type { ProspectDetailPayload, ProspectLeadSource, ProspectStatus, ProspectTeam } from "../types";
import { formatDate } from "../lib/labels";
import { useToast } from "../components/Toast";
import { QuoteStatusBadge } from "./ClientDetailView";

// Status labels resolve to i18n keys prospect.status.* at render.
const STATUS: Array<{ id: ProspectStatus; labelKey: string }> = [
  { id: "new", labelKey: "prospect.status.new" },
  { id: "contacted", labelKey: "prospect.status.contacted" },
  { id: "qualified", labelKey: "prospect.status.qualified" },
  { id: "quoted", labelKey: "prospect.status.quoted" },
  { id: "negotiation", labelKey: "prospect.status.negotiation" },
  { id: "converted", labelKey: "prospect.status.converted" },
  { id: "lost", labelKey: "prospect.status.lost" },
];

// Ordered tunnel stages (excludes the terminal "lost" branch) for the progress stepper.
const FUNNEL: ProspectStatus[] = ["new", "contacted", "qualified", "quoted", "negotiation", "converted"];

export function ProspectDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useWorkspace();
  const { t } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState<ProspectDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"info" | "comments" | "quotes" | "activities">("info");
  const [form, setForm] = useState({
    name: "", contactName: "", phone: "", email: "", source: "",
    team: "field" as ProspectTeam, leadSource: "societe" as ProspectLeadSource,
    need: "", solutionFit: "", notes: "", status: "new" as ProspectStatus, score: 50,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planAt, setPlanAt] = useState("");
  const [planning, setPlanning] = useState(false);

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
        team: payload.prospect.team || "field",
        leadSource: payload.prospect.leadSource || "societe",
        need: payload.prospect.need || "",
        solutionFit: payload.prospect.solutionFit || "",
        notes: payload.prospect.notes || "",
        status: payload.prospect.status,
        score: payload.prospect.score,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("prospect.err.load"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await patchJson(`/api/v1/prospects/${id}`, form);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("prospect.err.save"));
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
      setError(e instanceof ApiError ? e.message : t("prospect.err.convert"));
    }
  };

  const createQuote = async () => {
    if (!id) return;
    try {
      const q = await postJson<{ id: string }>(`/api/v1/quotes`, { prospectId: id });
      navigate(`/quotes/${q.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("prospect.err.quote"));
    }
  };

  // Schedule a call (call-center) or a field visit (terrain) into the shared agenda.
  const schedule = async () => {
    if (!id || !planAt) return;
    const isField = form.team === "field";
    setPlanning(true);
    try {
      const dueDate = new Date(planAt).toISOString();
      await postJson(`/api/v1/activities`, {
        type: isField ? "meeting" : "call",
        prospectId: id,
        subject: isField ? `Visite terrain — ${form.name}` : `Appel de qualification — ${form.name}`,
        content: form.need ? `Besoin : ${form.need}` : "",
        dueDate,
      });
      // Advance an untouched lead to "contacted" once an action is booked.
      if (form.status === "new") {
        await patchJson(`/api/v1/prospects/${id}`, { status: "contacted" });
      }
      setPlanAt("");
      toast.success(isField ? t("prospect.toast.visitPlanned") : t("prospect.toast.callPlanned"), { title: t("prospect.toast.addedToAgenda") });
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("prospect.err.plan"));
    } finally {
      setPlanning(false);
    }
  };

  if (loading) return <div className="p-6 text-secondary">{t("common.loading")}</div>;
  if (!data) {
    return (
      <div className="p-6">
        <p className="text-error">{error || t("prospect.notFound")}</p>
        <Link to="/prospects" className="mt-3 inline-block text-sm text-primary">← {t("prospect.back")}</Link>
      </div>
    );
  }

  const p = data.prospect;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <Link to="/prospects" className="inline-flex items-center gap-1 text-xs text-secondary hover:text-on-surface">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("prospect.backToAll")}
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
                {t(STATUS.find((s) => s.id === p.status)?.labelKey ?? "")}
              </Badge>
              <Badge variant="neutral">{t("prospect.score")} {p.score}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-secondary">
                {t("prospect.channel")} : {t(`enum.leadSource.${p.leadSource}`)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-secondary">
              {p.contactName ? <span>{p.contactName}</span> : null}
              {p.phone ? <span className="inline-flex items-center gap-2"><span>{p.phone}</span><CallButton phone={p.phone} name={p.name} prospectId={p.id} onLogged={load} /></span> : null}
              {p.email ? <a className="inline-flex items-center gap-1 hover:text-on-surface" href={`mailto:${p.email}`}><Mail className="h-3 w-3" />{p.email}</a> : null}
              {p.source ? <span>{t("prospect.detail")} : {p.source}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can("clients.write") && p.status !== "converted" ? (
              <Button variant="outline" onClick={() => void convert()}>
                <ArrowRightCircle className="mr-1 h-4 w-4" /> {t("prospect.convert")}
              </Button>
            ) : null}
            {can("orders.write") ? (
              <Button onClick={() => void createQuote()}>
                <FilePlus className="mr-1 h-4 w-4" /> {t("prospect.newQuote")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {can("clients.write") && p.status !== "converted" && p.status !== "lost" ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">{t("prospect.voiceTitle")}</p>
          <VoiceIntake
            entityName={p.name}
            prospectId={p.id}
            currency={data.quotes[0]?.currency}
            onApplied={load}
            onCreateQuote={createQuote}
          />
        </div>
      ) : null}

      {p.status !== "lost" ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {FUNNEL.map((stage, idx) => {
              const currentIdx = FUNNEL.indexOf(p.status);
              const done = currentIdx >= 0 && idx <= currentIdx;
              return (
                <div key={stage} className="flex items-center gap-1.5">
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      done ? "bg-primary text-on-primary" : "bg-surface-container text-secondary"
                    }`}
                  >
                    {t(STATUS.find((s) => s.id === stage)?.labelKey ?? "")}
                  </span>
                  {idx < FUNNEL.length - 1 ? <span className="text-secondary">→</span> : null}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-secondary">
            {t("prospect.funnelNote")}
          </p>
        </div>
      ) : null}

      {p.status !== "lost" && p.status !== "converted" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-on-surface">{t("prospect.qualif.title")}</h3>
            </div>
            <p className="mt-1 text-[11px] text-secondary">{t("prospect.qualif.subtitle")}</p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("prospect.qualif.need")}</label>
                <textarea
                  rows={2}
                  value={form.need}
                  onChange={(e) => setForm({ ...form, need: e.target.value })}
                  disabled={!can("clients.write")}
                  placeholder={t("prospect.qualif.needPh")}
                  className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("prospect.qualif.fit")}</label>
                <textarea
                  rows={2}
                  value={form.solutionFit}
                  onChange={(e) => setForm({ ...form, solutionFit: e.target.value })}
                  disabled={!can("clients.write")}
                  placeholder={t("prospect.qualif.fitPh")}
                  className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              {can("clients.write") ? (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => void save()} disabled={saving}>
                    <Save className="mr-1 h-3.5 w-3.5" /> {saving ? "…" : t("common.save")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="flex items-center gap-2">
              {form.team === "field" ? <MapPinned className="h-4 w-4 text-primary" /> : <Phone className="h-4 w-4 text-primary" />}
              <h3 className="text-sm font-bold text-on-surface">
                {form.team === "field" ? t("prospect.plan.visitTitle") : t("prospect.plan.callTitle")}
              </h3>
            </div>
            <p className="mt-1 text-[11px] text-secondary">
              {form.team === "field" ? t("prospect.plan.visitHint") : t("prospect.plan.callHint")}
            </p>
            {can("visits.write") ? (
              <div className="mt-3 space-y-2">
                <input
                  type="datetime-local"
                  value={planAt}
                  onChange={(e) => setPlanAt(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <Button size="sm" onClick={() => void schedule()} disabled={!planAt || planning} className="w-full justify-center">
                  <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                  {planning ? t("prospect.plan.planning") : form.team === "field" ? t("prospect.plan.visitBtn") : t("prospect.plan.callBtn")}
                </Button>
                <Link to="/agenda" className="block text-center text-[11px] text-primary hover:underline">
                  {t("prospect.plan.seeAgenda")}
                </Link>
              </div>
            ) : (
              <p className="mt-3 text-xs text-secondary">{t("prospect.plan.noRight")}</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-outline-variant">
        {(["info", "comments", "quotes", "activities"] as const).map((tt) => (
          <button
            key={tt}
            onClick={() => setTab(tt)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 ${
              tab === tt ? "border-primary text-on-surface" : "border-transparent text-secondary"
            }`}
          >
            {tt === "info" ? t("prospect.tab.info") : tt === "comments" ? t("prospect.tab.comments") : tt === "quotes" ? `${t("prospect.tab.quotes")} (${data.quotes.length})` : `${t("prospect.tab.activities")} (${data.activities.length})`}
          </button>
        ))}
      </div>

      {tab === "info" ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="grid gap-3 md:grid-cols-2">
            {([
              ["name", "prospect.field.name"],
              ["contactName", "prospect.field.contact"],
              ["phone", "prospect.field.phone"],
              ["email", "prospect.field.email"],
              ["source", "prospect.field.source"],
            ] as Array<["name" | "contactName" | "phone" | "email" | "source", string]>).map(([k, l]) => (
              <div key={k}>
                <label className="mb-1 block text-[11px] font-semibold text-secondary">{t(l)}</label>
                <input
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  disabled={!can("clients.write")}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("prospect.field.status")}</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ProspectStatus })}
                disabled={!can("clients.write")}
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {STATUS.map((s) => <option key={s.id} value={s.id}>{t(s.labelKey)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("prospect.field.score")}</label>
              <input
                type="number" min={0} max={100}
                value={form.score}
                onChange={(e) => setForm({ ...form, score: Number(e.target.value) })}
                disabled={!can("clients.write")}
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">{t("prospect.fieldReport")}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {p.address ? <IntakeField label={t("prospect.intake.address")} value={p.address} /> : null}
              {p.zone ? <IntakeField label={t("prospect.intake.zone")} value={p.zone} /> : null}
              {p.establishmentType ? <IntakeField label={t("prospect.intake.establishment")} value={p.establishmentType} /> : null}
              {p.potential ? <IntakeField label={t("prospect.intake.potential")} value={t(`enum.potential.${p.potential}`)} /> : null}
              {p.competitor ? <IntakeField label={t("prospect.intake.competitor")} value={p.competitor} /> : null}
              {p.nextVisitAt ? <IntakeField label={t("prospect.intake.nextVisit")} value={formatDate(p.nextVisitAt)} /> : null}
            </dl>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("prospect.notes")}</label>
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
                <Save className="mr-1 h-3.5 w-3.5" /> {saving ? t("prospect.saving") : t("common.save")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "comments" ? <CommentsThread entityType="prospect" entityId={p.id} /> : null}

      {tab === "quotes" ? (
        data.quotes.length === 0 ? (
          <p className="text-sm text-secondary">{t("prospect.noQuotes")}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-outline-variant">
            <table className="w-full text-sm">
              <thead className="bg-surface-container text-xs uppercase text-secondary">
                <tr><th className="px-3 py-2 text-left">{t("prospect.quoteCol.number")}</th><th className="px-3 py-2 text-left">{t("prospect.quoteCol.status")}</th><th className="px-3 py-2 text-right">{t("prospect.quoteCol.total")}</th><th className="px-3 py-2 text-left">{t("prospect.quoteCol.signed")}</th></tr>
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
          <p className="text-sm text-secondary">{t("prospect.noActivities")}</p>
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

function IntakeField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-secondary">{label}</dt>
      <dd className="font-semibold text-on-surface">{value}</dd>
    </div>
  );
}

// keep import used
void MessageSquare;
