import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Pencil, Plus } from "lucide-react";
import type { Opportunity, PipelineStage } from "../types";
import { ApiError, asArray, getJson, patchJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { formatCurrency, opportunityStageTone } from "../lib/labels";
import { addDaysIso } from "../lib/dateDefaults";
import { useWorkspace } from "../context/WorkspaceContext";
import { useTranslation } from "../i18n";

const stages: PipelineStage[] = ["qualification", "proposal", "negotiation", "won", "lost"];
const OPEN_STAGES: PipelineStage[] = ["qualification", "proposal", "negotiation"];
// A deal sitting untouched in a stage beyond this many days is flagged as stalling.
const STALE_DAYS = 10;

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return Number.isFinite(d) ? Math.max(0, d) : null;
}

type EditForm = {
  clientName: string;
  amount: string;
  probability: string;
  priority: string;
  nextAction: string;
  expectedClose: string;
};

export function PipelineView() {
  const { company, can } = useWorkspace();
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newOpp, setNewOpp] = useState({
    clientName: "",
    amount: "",
    stage: "qualification" as PipelineStage,
    priority: "medium",
    nextAction: "",
    expectedClose: addDaysIso(21),
  });
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const loadOpportunities = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<unknown>("/api/v1/opportunities");
      setOpportunities(asArray<Opportunity>(payload));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOpportunities();
  }, []);

  const totals = useMemo(() => {
    return stages.reduce<Record<PipelineStage, number>>(
      (accumulator, stage) => {
        accumulator[stage] = opportunities
          .filter((opportunity) => opportunity.stage === stage)
          .reduce((sum, opportunity) => sum + opportunity.amount, 0);
        return accumulator;
      },
      {
        qualification: 0,
        proposal: 0,
        negotiation: 0,
        won: 0,
        lost: 0,
      },
    );
  }, [opportunities]);

  const forecast = useMemo(() => {
    const open = opportunities.filter((o) => OPEN_STAGES.includes(o.stage));
    const openTotal = open.reduce((sum, o) => sum + o.amount, 0);
    const weighted = open.reduce((sum, o) => sum + o.amount * (o.probability / 100), 0);
    const wonTotal = opportunities
      .filter((o) => o.stage === "won")
      .reduce((sum, o) => sum + o.amount, 0);
    return { openTotal, weighted, wonTotal };
  }, [opportunities]);

  const openEdit = (opportunity: Opportunity) => {
    setEditing(opportunity);
    setEditForm({
      clientName: opportunity.clientName,
      amount: String(opportunity.amount),
      probability: String(opportunity.probability),
      priority: opportunity.priority,
      nextAction: opportunity.nextAction,
      expectedClose: opportunity.expectedClose,
    });
  };

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !editForm) return;
    setSavingEdit(true);
    try {
      await patchJson(`/api/v1/opportunities/${editing.id}`, {
        clientName: editForm.clientName,
        amount: Number(editForm.amount),
        probability: Number(editForm.probability),
        priority: editForm.priority,
        nextAction: editForm.nextAction,
        expectedClose: editForm.expectedClose,
      });
      toast.success(t("pipeline.toast.updated"), { title: editForm.clientName });
      setEditing(null);
      setEditForm(null);
      await loadOpportunities();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : t("pipeline.toast.updateErr"));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await postJson("/api/v1/opportunities", {
        ...newOpp,
        amount: Number(newOpp.amount),
      });
      toast.success(t("pipeline.toast.created"), { title: newOpp.clientName });
      setShowCreate(false);
      setNewOpp({
        clientName: "",
        amount: "",
        stage: "qualification",
        priority: "medium",
        nextAction: "",
        expectedClose: addDaysIso(21),
      });
      await loadOpportunities();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : t("pipeline.toast.createErr"));
    } finally {
      setSaving(false);
    }
  };

  const moveStage = async (opportunity: Opportunity, direction: -1 | 1) => {
    const currentIndex = stages.indexOf(opportunity.stage);
    const nextStage = stages[currentIndex + direction];
    if (!nextStage) {
      return;
    }
    const payload: Record<string, unknown> = { stage: nextStage };
    if (nextStage === "lost") {
      const decision = await confirm({
        title: t("pipeline.lost.title", { name: opportunity.clientName }),
        description: t("pipeline.lost.desc"),
        confirmLabel: t("pipeline.lost.confirm"),
        tone: "danger",
        requireReason: true,
        reasonLabel: t("pipeline.lost.reasonLabel"),
        reasonPlaceholder: t("pipeline.lost.reasonPh"),
      });
      if (!decision.confirmed) return;
      payload.lossReason = decision.reason || t("pipeline.lost.defaultReason");
    }
    try {
      await patchJson(`/api/v1/opportunities/${opportunity.id}/stage`, payload);
      toast.success(t("pipeline.toast.moved", { stage: t(`enum.stage.${nextStage}`) }));
      await loadOpportunities();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : t("pipeline.toast.moveErr"));
    }
  };

  if (!company) {
    return null;
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-secondary">{t("pipeline.subtitle")}</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">{t("pipeline.title")}</h1>
        </div>
        {can("opportunities.write") ? (
          <Button className="self-start gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t("pipeline.new")}
          </Button>
        ) : null}
      </div>

      {!isLoading && opportunities.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <p className="text-xs text-secondary">{t("pipeline.kpi.openTitle")}</p>
            <p className="mt-1 text-2xl font-black text-on-surface">{formatCurrency(forecast.openTotal, company.currency)}</p>
            <p className="text-[11px] text-secondary">{t("pipeline.kpi.openSub")}</p>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-semibold text-primary">{t("pipeline.kpi.weightedTitle")}</p>
            <p className="mt-1 text-2xl font-black text-on-surface">{formatCurrency(forecast.weighted, company.currency)}</p>
            <p className="text-[11px] text-secondary">{t("pipeline.kpi.weightedSub")}</p>
          </div>
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <p className="text-xs text-secondary">{t("pipeline.kpi.wonTitle")}</p>
            <p className="mt-1 text-2xl font-black text-on-surface">{formatCurrency(forecast.wonTotal, company.currency)}</p>
            <p className="text-[11px] text-secondary">{t("pipeline.kpi.wonSub")}</p>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {stages.map((stage) => (
            <div key={stage} className="flex min-h-[520px] flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-sm">
              <div className="border-b border-outline-variant pb-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </div>
              <div className="flex-1 space-y-3 pt-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="space-y-2 rounded-2xl border border-outline-variant bg-surface p-4">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : opportunities.length === 0 ? (
        <EmptyState
          title={t("pipeline.empty.title")}
          description={t("pipeline.empty.desc")}
          action={
            can("opportunities.write") ? (
              <Button className="gap-2" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                Nouvelle opportunité
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {stages.map((stage) => {
            const items = opportunities.filter((opportunity) => opportunity.stage === stage);
            return (
              <div
                key={stage}
                className="flex min-h-[520px] flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-sm"
              >
                <div className="border-b border-outline-variant pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-on-surface">{t(`enum.stage.${stage}`)}</p>
                    <Badge variant={opportunityStageTone(stage)}>{items.length}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-secondary">{formatCurrency(totals[stage], company.currency)}</p>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto pt-3">
                  {items.map((opportunity) => (
                    <div
                      key={opportunity.id}
                      className="space-y-3 rounded-2xl border border-outline-variant bg-surface p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">{opportunity.clientName}</p>
                          <p className="mt-1 text-xs text-secondary">{opportunity.ownerName}</p>
                        </div>
                        <Badge
                          variant={
                            opportunity.priority === "critical"
                              ? "error"
                              : opportunity.priority === "high"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {opportunity.priority}
                        </Badge>
                      </div>
                      <p className="text-lg font-black text-on-surface">
                        {formatCurrency(opportunity.amount, company.currency)}
                      </p>
                      <p className="text-xs text-secondary">{t("pipeline.card.nextAction")} : {opportunity.nextAction}</p>
                      <div className="flex items-center justify-between text-xs text-secondary">
                        <span>{opportunity.probability}%</span>
                        <span>{opportunity.expectedClose}</span>
                      </div>
                      {OPEN_STAGES.includes(stage)
                        ? (() => {
                            const age = daysSince(opportunity.updatedAt);
                            if (age === null) return null;
                            const stale = age >= STALE_DAYS;
                            return (
                              <p className={`text-[11px] font-semibold ${stale ? "text-error" : "text-secondary"}`}>
                                {stale ? t("pipeline.card.staleFor", { days: age }) : t("pipeline.card.updatedAgo", { days: age })}
                              </p>
                            );
                          })()
                        : null}
                      {can("opportunities.write") ? (
                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void moveStage(opportunity, -1)}
                            disabled={stage === "qualification"}
                            aria-label={t("pipeline.card.back")}
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(opportunity)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> {t("pipeline.card.edit")}
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => void moveStage(opportunity, 1)}
                            disabled={stage === "won" || stage === "lost"}
                            aria-label={t("pipeline.card.forward")}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void handleCreate(event)}
            className="w-full max-w-xl space-y-4 rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl"
          >
            <div>
              <p className="text-sm font-bold text-on-surface">{t("pipeline.new")}</p>
              <p className="mt-1 text-xs text-secondary">{t("pipeline.form.newSub")}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder={t("pipeline.form.clientPh")}
                value={newOpp.clientName}
                onChange={(event) => setNewOpp({ ...newOpp, clientName: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="number"
                placeholder={t("pipeline.form.amount")}
                value={newOpp.amount}
                onChange={(event) => setNewOpp({ ...newOpp, amount: event.target.value })}
                required
              />
              <select
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                value={newOpp.stage}
                onChange={(event) => setNewOpp({ ...newOpp, stage: event.target.value as PipelineStage })}
              >
                {stages.slice(0, 3).map((stage) => (
                  <option key={stage} value={stage}>
                    {t(`enum.stage.${stage}`)}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                value={newOpp.priority}
                onChange={(event) => setNewOpp({ ...newOpp, priority: event.target.value })}
              >
                <option value="low">{t("enum.priority.low")}</option>
                <option value="medium">{t("enum.priority.medium")}</option>
                <option value="high">{t("enum.priority.high")}</option>
                <option value="critical">{t("enum.priority.critical")}</option>
              </select>
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="date"
                value={newOpp.expectedClose}
                onChange={(event) => setNewOpp({ ...newOpp, expectedClose: event.target.value })}
              />
              <textarea
                className="min-h-28 rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder={t("pipeline.form.nextActionPh")}
                value={newOpp.nextAction}
                onChange={(event) => setNewOpp({ ...newOpp, nextAction: event.target.value })}
                required
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={saving}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {t("pipeline.form.create")}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {editing && editForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void submitEdit(event)}
            className="w-full max-w-xl space-y-4 rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl"
          >
            <div>
              <p className="text-sm font-bold text-on-surface">{t("pipeline.form.editTitle")}</p>
              <p className="mt-1 text-xs text-secondary">{t("pipeline.form.stageLabel")} : {t(`enum.stage.${editing.stage}`)}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder={t("pipeline.form.clientPh")}
                value={editForm.clientName}
                onChange={(event) => setEditForm({ ...editForm, clientName: event.target.value })}
                required
              />
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-secondary">{t("pipeline.form.amount")}</span>
                <input
                  className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                  type="number"
                  value={editForm.amount}
                  onChange={(event) => setEditForm({ ...editForm, amount: event.target.value })}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-secondary">{t("pipeline.form.probability")}</span>
                <input
                  className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                  type="number"
                  min={0}
                  max={100}
                  value={editForm.probability}
                  onChange={(event) => setEditForm({ ...editForm, probability: event.target.value })}
                />
              </label>
              <select
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                value={editForm.priority}
                onChange={(event) => setEditForm({ ...editForm, priority: event.target.value })}
              >
                <option value="low">{t("enum.priority.low")}</option>
                <option value="medium">{t("enum.priority.medium")}</option>
                <option value="high">{t("enum.priority.high")}</option>
                <option value="critical">{t("enum.priority.critical")}</option>
              </select>
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="date"
                value={editForm.expectedClose}
                onChange={(event) => setEditForm({ ...editForm, expectedClose: event.target.value })}
              />
              <textarea
                className="min-h-24 rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder={t("pipeline.form.nextActionPh")}
                value={editForm.nextAction}
                onChange={(event) => setEditForm({ ...editForm, nextAction: event.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => { setEditing(null); setEditForm(null); }}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={savingEdit}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {t("common.save")}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
