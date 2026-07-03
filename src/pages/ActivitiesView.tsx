import { useEffect, useMemo, useState } from "react";
import {
  Boxes, CheckSquare, ClipboardList, FileSignature, HandCoins, Mail, Notebook,
  Phone, Plus, ShoppingCart, Trash2, Truck, Undo2, Users, Wallet,
} from "lucide-react";
import type { Activity, ActivityType, Client, Opportunity } from "../types";
import { ApiError, asArray, getJson, patchJson, postJson, requestJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { formatDateTime } from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";
import { useTranslation } from "../i18n";

// Ordered activity types (labels resolved via t(`enum.activityType.*`)).
const TYPE_KEYS: ActivityType[] = [
  "call", "email", "note", "task", "meeting", "quote", "order",
  "delivery", "payment", "collection", "stock", "return", "visit_report",
];

const TYPE_ICON: Record<ActivityType, typeof Phone> = {
  call: Phone,
  email: Mail,
  note: Notebook,
  task: CheckSquare,
  meeting: Users,
  quote: FileSignature,
  order: ShoppingCart,
  delivery: Truck,
  payment: Wallet,
  collection: HandCoins,
  stock: Boxes,
  return: Undo2,
  visit_report: ClipboardList,
};

export function ActivitiesView() {
  const { can } = useWorkspace();
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<ActivityType | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "note" as ActivityType,
    subject: "",
    content: "",
    clientId: "",
    opportunityId: "",
    dueDate: "",
  });
  const [error, setError] = useState("");

  const load = async () => {
    setIsLoading(true);
    try {
      const [activitiesPayload, clientsPayload, oppsPayload] = await Promise.all([
        getJson<unknown>("/api/v1/activities"),
        getJson<unknown>("/api/v1/clients"),
        getJson<unknown>("/api/v1/opportunities"),
      ]);
      setActivities(asArray<Activity>(activitiesPayload));
      setClients(asArray<Client>(clientsPayload));
      setOpportunities(asArray<Opportunity>(oppsPayload));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return activities;
    return activities.filter((entry) => entry.type === typeFilter);
  }, [activities, typeFilter]);

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await postJson("/api/v1/activities", {
        ...form,
        clientId: form.clientId || undefined,
        opportunityId: form.opportunityId || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      });
      toast.success(t("activities.toast.created"));
      setShowCreate(false);
      setForm({ type: "note", subject: "", content: "", clientId: "", opportunityId: "", dueDate: "" });
      await load();
    } catch (reason) {
      const message = reason instanceof ApiError ? reason.message : t("activities.err.create");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (activity: Activity) => {
    try {
      await patchJson(`/api/v1/activities/${activity.id}`, {
        completedAt: activity.completedAt ? null : new Date().toISOString(),
      });
      await load();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : t("activities.err.action"));
    }
  };

  const remove = async (activity: Activity) => {
    if (busyId) return;
    const decision = await confirm({
      title: t("activities.deleteConfirmTitle", { subject: activity.subject }),
      confirmLabel: t("prospects.delete"),
      tone: "danger",
    });
    if (!decision.confirmed) return;
    setBusyId(activity.id);
    setActivities((current) => current.filter((entry) => entry.id !== activity.id));
    try {
      await requestJson(`/api/v1/activities/${activity.id}`, { method: "DELETE" });
      toast.success(t("activities.toast.deleted"));
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : t("activities.err.delete"));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-secondary">{t("activities.eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">{t("activities.title")}</h1>
          <p className="mt-1 text-sm text-secondary">{t("activities.subtitle")}</p>
        </div>
        {can("visits.write") ? (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("activities.new")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTypeFilter("all")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            typeFilter === "all" ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-white text-secondary"
          }`}
        >
          {t("activities.filterAll", { count: activities.length })}
        </button>
        {TYPE_KEYS.map((type) => {
          const count = activities.filter((entry) => entry.type === type).length;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                typeFilter === type ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-white text-secondary"
              }`}
            >
              {t(`enum.activityType.${type}`)} ({count})
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">
          {t("common.loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center text-secondary">
          {t("activities.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const Icon = TYPE_ICON[entry.type];
            const isCompleted = Boolean(entry.completedAt);
            return (
              <div key={entry.id} className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isCompleted ? "bg-primary/10 text-primary" : "bg-surface text-secondary"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-sm font-semibold ${isCompleted ? "text-secondary line-through" : "text-on-surface"}`}>{entry.subject}</p>
                    <Badge variant="neutral">{t(`enum.activityType.${entry.type}`)}</Badge>
                    {entry.dueDate && !isCompleted ? (
                      <Badge variant="warning">{t("activities.dueBadge", { date: entry.dueDate.slice(0, 10) })}</Badge>
                    ) : null}
                  </div>
                  {entry.content ? <p className="mt-1 text-xs text-secondary">{entry.content}</p> : null}
                  <p className="mt-2 text-[11px] text-secondary">
                    {entry.ownerName} · {formatDateTime(entry.createdAt)}
                  </p>
                </div>
                {entry.type === "task" && can("visits.write") ? (
                  <button
                    type="button"
                    onClick={() => void toggleComplete(entry)}
                    className="shrink-0 rounded-full border border-outline-variant px-3 py-1 text-xs font-semibold text-secondary hover:bg-surface"
                  >
                    {isCompleted ? t("activities.reopen") : t("activities.markDone")}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={submitCreate} className="w-full max-w-xl space-y-3 rounded-2xl border border-outline-variant bg-white p-6 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-secondary">{t("activities.form.eyebrow")}</p>
              <h3 className="mt-1 text-xl font-black text-on-surface">{t("activities.form.title")}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ActivityType })}>
                {TYPE_KEYS.map((type) => (
                  <option key={type} value={type}>{t(`enum.activityType.${type}`)}</option>
                ))}
              </select>
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("activities.form.subjectPh")} value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
              <select className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })}>
                <option value="">{t("activities.form.noClient")}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
              <select className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={form.opportunityId} onChange={(event) => setForm({ ...form, opportunityId: event.target.value })}>
                <option value="">{t("activities.form.noOpp")}</option>
                {opportunities.map((opp) => (
                  <option key={opp.id} value={opp.id}>{opp.clientName} — {opp.amount.toLocaleString("fr-FR")}</option>
                ))}
              </select>
              {form.type === "task" ? (
                <input type="date" className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
              ) : null}
            </div>
            <textarea className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" rows={4} placeholder={t("activities.form.detailsPh")} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
            {error ? <p className="text-xs text-error">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
              <Button type="submit">{t("common.save")}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
