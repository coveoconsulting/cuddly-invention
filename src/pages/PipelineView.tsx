import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Plus } from "lucide-react";
import type { Opportunity, PipelineStage } from "../types";
import { ApiError, asArray, getJson, patchJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { formatCurrency, opportunityStageTone, pipelineStageLabel } from "../lib/labels";
import { addDaysIso } from "../lib/dateDefaults";
import { useWorkspace } from "../context/WorkspaceContext";

const stages: PipelineStage[] = ["qualification", "proposal", "negotiation", "won", "lost"];

export function PipelineView() {
  const { company, can } = useWorkspace();
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

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await postJson("/api/v1/opportunities", {
        ...newOpp,
        amount: Number(newOpp.amount),
      });
      toast.success("Opportunité créée", { title: newOpp.clientName });
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
      toast.error(reason instanceof ApiError ? reason.message : "Création impossible");
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
        title: `Marquer "${opportunity.clientName}" comme perdue ?`,
        description: "Cette étape requiert un motif. L'opportunité sortira du pipeline actif.",
        confirmLabel: "Marquer perdue",
        tone: "danger",
        requireReason: true,
        reasonLabel: "Raison de perte",
        reasonPlaceholder: "Concurrence, budget, timing…",
      });
      if (!decision.confirmed) return;
      payload.lossReason = decision.reason || "Motif non précisé";
    }
    try {
      await patchJson(`/api/v1/opportunities/${opportunity.id}/stage`, payload);
      toast.success(`Déplacée vers ${pipelineStageLabel[nextStage]}`);
      await loadOpportunities();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "Déplacement impossible");
    }
  };

  if (!company) {
    return null;
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-secondary">Pipeline commercial</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">Opportunités par étape</h1>
        </div>
        {can("opportunities.write") ? (
          <Button className="self-start gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle opportunité
          </Button>
        ) : null}
      </div>

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
          title="Aucune opportunité en cours"
          description="Créez une opportunité pour suivre la qualification, la proposition, la négociation et le résultat."
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
                    <p className="font-bold text-on-surface">{pipelineStageLabel[stage]}</p>
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
                      <p className="text-xs text-secondary">Prochaine action : {opportunity.nextAction}</p>
                      <div className="flex items-center justify-between text-xs text-secondary">
                        <span>{opportunity.probability}%</span>
                        <span>{opportunity.expectedClose}</span>
                      </div>
                      {can("opportunities.write") ? (
                        <div className="flex items-center justify-between gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void moveStage(opportunity, -1)}
                            disabled={stage === "qualification"}
                          >
                            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                            Retour
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => void moveStage(opportunity, 1)}
                            disabled={stage === "won" || stage === "lost"}
                          >
                            Avancer
                            <ArrowRight className="ml-1 h-3.5 w-3.5" />
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
              <p className="text-sm font-bold text-on-surface">Nouvelle opportunité</p>
              <p className="mt-1 text-xs text-secondary">Création dans le pipeline persisté</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder="Client ou prospect"
                value={newOpp.clientName}
                onChange={(event) => setNewOpp({ ...newOpp, clientName: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="number"
                placeholder="Montant"
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
                    {pipelineStageLabel[stage]}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                value={newOpp.priority}
                onChange={(event) => setNewOpp({ ...newOpp, priority: event.target.value })}
              >
                <option value="low">Faible</option>
                <option value="medium">Moyenne</option>
                <option value="high">Haute</option>
                <option value="critical">Critique</option>
              </select>
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="date"
                value={newOpp.expectedClose}
                onChange={(event) => setNewOpp({ ...newOpp, expectedClose: event.target.value })}
              />
              <textarea
                className="min-h-28 rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder="Prochaine action"
                value={newOpp.nextAction}
                onChange={(event) => setNewOpp({ ...newOpp, nextAction: event.target.value })}
                required
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={saving}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Créer
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
