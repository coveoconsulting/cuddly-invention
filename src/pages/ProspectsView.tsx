import { useEffect, useMemo, useState } from "react";
import { ArrowRightCircle, Trash2, UserPlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type {
  Prospect,
  ProspectLeadSource,
  ProspectPotential,
  ProspectStatus,
} from "../types";
import { FIELD_LEAD_SOURCES, PROSPECT_POTENTIALS } from "../types";
import { apiUrl, ApiError, asArray, getJson, patchJson, postJson, requestJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { CallButton } from "../components/CallButton";
import { SkeletonCard } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { useWorkspace } from "../context/WorkspaceContext";
import { useTranslation } from "../i18n";

const STATUS_TONE: Record<ProspectStatus, "default" | "neutral" | "warning" | "success" | "error"> = {
  new: "neutral",
  contacted: "default",
  qualified: "default",
  quoted: "warning",
  negotiation: "warning",
  converted: "success",
  lost: "error",
};

// Funnel order (left → right). "converted" is reached automatically when a quote is signed.
const COLUMNS: ProspectStatus[] = ["new", "contacted", "qualified", "quoted", "negotiation", "converted", "lost"];

type ProspectForm = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  leadSource: ProspectLeadSource;
  source: string;
  need: string;
  notes: string;
  // Field (terrain)
  address: string;
  zone: string;
  establishmentType: string;
  potential: ProspectPotential | "";
  competitor: string;
  nextVisitAt: string;
};

const EMPTY_FORM: ProspectForm = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  leadSource: "societe",
  source: "",
  need: "",
  notes: "",
  address: "",
  zone: "",
  establishmentType: "",
  potential: "",
  competitor: "",
  nextVisitAt: "",
};

export function ProspectsView() {
  const navigate = useNavigate();
  const { can } = useWorkspace();
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM }));
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
      toast.success(t("prospects.toast.created"), { title: form.name });
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (reason) {
      const message = reason instanceof ApiError ? reason.message : t("prospects.err.create");
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
      toast.error(reason instanceof ApiError ? reason.message : t("prospects.err.update"));
    }
  };

  const convert = async (prospect: Prospect) => {
    const decision = await confirm({
      title: t("prospects.convertConfirmTitle", { name: prospect.name }),
      description: t("prospects.convertConfirmDesc"),
      confirmLabel: t("prospects.convert"),
    });
    if (!decision.confirmed) return;
    try {
      const result = await postJson<{ client: { id: string } }>(`/api/v1/prospects/${prospect.id}/convert`);
      toast.success(t("prospects.toast.converted"), { title: prospect.name });
      await load();
      if (result?.client?.id) {
        navigate(`/clients`);
      }
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : t("prospects.err.convert"));
    }
  };

  const remove = async (prospect: Prospect) => {
    if (busyId) return;
    const decision = await confirm({
      title: t("prospects.deleteConfirmTitle", { name: prospect.name }),
      description: t("prospects.deleteConfirmDesc"),
      confirmLabel: t("prospects.delete"),
      tone: "danger",
    });
    if (!decision.confirmed) return;
    setBusyId(prospect.id);
    setProspects((current) => current.filter((entry) => entry.id !== prospect.id));
    try {
      await requestJson(`/api/v1/prospects/${prospect.id}`, { method: "DELETE" });
      toast.success(t("prospects.deleted", { name: prospect.name }));
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : t("prospects.err.delete"));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1580px] space-y-5 p-4 md:p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-secondary">{t("prospects.eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">{t("prospects.title")}</h1>
          <p className="mt-1 text-sm text-secondary">{t("prospects.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={apiUrl("/api/v1/prospects?format=csv")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm font-semibold text-on-surface hover:bg-surface"
          >
            {t("prospects.exportCsv")}
          </a>
          {can("clients.write") ? (
            <Button onClick={() => setShowCreate(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              {t("prospects.new")}
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {COLUMNS.map((status) => {
            const items = grouped.get(status) || [];
            return (
              <div key={status} className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-low p-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-secondary">{t(`prospect.status.${status}`)}</p>
                  <Badge variant={STATUS_TONE[status]}>{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-outline-variant bg-white/40 px-3 py-4 text-center text-xs text-secondary">
                      {t("prospects.empty")}
                    </p>
                  ) : (
                    items.map((prospect) => (
                      <div key={prospect.id} className="space-y-2 rounded-xl border border-outline-variant bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link to={`/prospects/${prospect.id}`} className="truncate text-sm font-bold text-on-surface hover:text-primary">
                              {prospect.name}
                            </Link>
                            <p className="truncate text-xs text-secondary">{prospect.contactName || prospect.email || t("prospects.noContact")}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="neutral">{prospect.score}</Badge>
                            {can("prospects.delete") ? (
                              <button
                                type="button"
                                onClick={() => void remove(prospect)}
                                disabled={busyId === prospect.id}
                                title={t("prospects.delete")}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-secondary hover:bg-error-container hover:text-error disabled:opacity-50"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="rounded-full bg-surface-container px-1.5 py-0.5 text-[10px] font-semibold text-secondary">
                            {t(`enum.leadSource.${prospect.leadSource}`)}
                          </span>
                          {prospect.source ? (
                            <span className="text-[10px] text-secondary">· {prospect.source}</span>
                          ) : null}
                        </div>
                        {prospect.phone ? (
                          <CallButton phone={prospect.phone} name={prospect.name} prospectId={prospect.id} onLogged={load} />
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
                                → {t(`prospect.status.${target}`)}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => void convert(prospect)}
                              className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-on-primary"
                            >
                              <ArrowRightCircle className="h-3 w-3" />
                              {t("prospects.convert")}
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
              <p className="text-xs font-bold uppercase tracking-wider text-secondary">{t("prospects.form.eyebrow")}</p>
              <h3 className="mt-1 text-xl font-black text-on-surface">{t("prospects.form.title")}</h3>
            </div>
            <input className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("prospects.form.namePh")} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold text-secondary">{t("prospects.form.leadSource")}</p>
                <select className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={form.leadSource} onChange={(event) => setForm({ ...form, leadSource: event.target.value as ProspectLeadSource })}>
                  {FIELD_LEAD_SOURCES.map((src) => (
                    <option key={src} value={src}>{t(`enum.leadSource.${src}`)}</option>
                  ))}
                </select>
              </div>
              <input className="self-end rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("prospects.form.sourcePh")} value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("prospects.form.contactPh")} value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("prospects.form.phonePh")} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              <input className="col-span-2 rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("prospects.form.emailPh")} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </div>

            <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">{t("prospects.form.fieldReport")}</p>
              <input className="w-full rounded-xl border border-outline-variant bg-white px-4 py-3 text-sm" placeholder={t("prospects.form.addressPh")} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input className="rounded-xl border border-outline-variant bg-white px-4 py-3 text-sm" placeholder={t("prospects.form.zonePh")} value={form.zone} onChange={(event) => setForm({ ...form, zone: event.target.value })} />
                <input className="rounded-xl border border-outline-variant bg-white px-4 py-3 text-sm" placeholder={t("prospects.form.establishmentPh")} value={form.establishmentType} onChange={(event) => setForm({ ...form, establishmentType: event.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select className="rounded-xl border border-outline-variant bg-white px-4 py-3 text-sm" value={form.potential} onChange={(event) => setForm({ ...form, potential: event.target.value as ProspectPotential | "" })}>
                  <option value="">{t("prospects.form.potentialPh")}</option>
                  {PROSPECT_POTENTIALS.map((level) => (
                    <option key={level} value={level}>{t(`enum.potential.${level}`)}</option>
                  ))}
                </select>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-secondary">{t("prospects.form.nextVisit")}</span>
                  <input type="date" className="w-full rounded-xl border border-outline-variant bg-white px-4 py-2.5 text-sm" value={form.nextVisitAt} onChange={(event) => setForm({ ...form, nextVisitAt: event.target.value })} />
                </label>
              </div>
              <input className="w-full rounded-xl border border-outline-variant bg-white px-4 py-3 text-sm" placeholder={t("prospects.form.competitorPh")} value={form.competitor} onChange={(event) => setForm({ ...form, competitor: event.target.value })} />
            </div>

            <textarea className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("prospects.form.needPh")} value={form.need} onChange={(event) => setForm({ ...form, need: event.target.value })} rows={2} />
            <textarea className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("prospects.form.notesPh")} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} />
            {error ? <p className="text-xs text-error">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
              <Button type="submit" loading={saving}>{t("prospects.form.create")}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
