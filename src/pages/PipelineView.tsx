import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Plus } from "lucide-react";
import type { Opportunity, PipelineStage } from "../types";
import { getJson, patchJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { formatCurrency, opportunityStageTone, pipelineStageLabel } from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";

const stages: PipelineStage[] = ["qualification", "proposal", "negotiation", "won", "lost"];

export function PipelineView() {
  const { company, can } = useWorkspace();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newOpp, setNewOpp] = useState({
    clientName: "",
    amount: "",
    stage: "qualification" as PipelineStage,
    priority: "medium",
    nextAction: "",
    expectedClose: "2026-06-30",
  });

  const loadOpportunities = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<Opportunity[]>("/api/v1/opportunities");
      setOpportunities(payload);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOpportunities();
  }, []);

  const totals = useMemo(() => {
    return stages.reduce<Record<PipelineStage, number>>((accumulator, stage) => {
      accumulator[stage] = opportunities
        .filter((opportunity) => opportunity.stage === stage)
        .reduce((sum, opportunity) => sum + opportunity.amount, 0);
      return accumulator;
    }, {
      qualification: 0,
      proposal: 0,
      negotiation: 0,
      won: 0,
      lost: 0,
    });
  }, [opportunities]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    await postJson("/api/v1/opportunities", {
      ...newOpp,
      amount: Number(newOpp.amount),
    });
    setShowCreate(false);
    setNewOpp({
      clientName: "",
      amount: "",
      stage: "qualification",
      priority: "medium",
      nextAction: "",
      expectedClose: "2026-06-30",
    });
    await loadOpportunities();
  };

  const moveStage = async (opportunity: Opportunity, direction: -1 | 1) => {
    const currentIndex = stages.indexOf(opportunity.stage);
    const nextStage = stages[currentIndex + direction];
    if (!nextStage) {
      return;
    }
    const payload: Record<string, unknown> = { stage: nextStage };
    if (nextStage === "lost") {
      payload.lossReason = window.prompt("Raison de perte obligatoire", opportunity.lossReason || "") || "Motif non precise";
    }
    await patchJson(`/api/v1/opportunities/${opportunity.id}/stage`, payload);
    await loadOpportunities();
  };

  if (!company) {
    return null;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-secondary">Pipeline commercial</p>
          <h1 className="text-3xl font-black text-on-surface mt-1">Opportunites par etape</h1>
        </div>
        {can("opportunities.write") ? (
          <Button className="gap-2 self-start" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            Nouvelle opportunite
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center text-secondary">
          Chargement du pipeline...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {stages.map((stage) => {
            const items = opportunities.filter((opportunity) => opportunity.stage === stage);
            return (
              <div key={stage} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-sm min-h-[520px] flex flex-col">
                <div className="pb-3 border-b border-outline-variant">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-on-surface">{pipelineStageLabel[stage]}</p>
                    <Badge variant={opportunityStageTone(stage)}>{items.length}</Badge>
                  </div>
                  <p className="text-xs text-secondary mt-1">{formatCurrency(totals[stage], company.currency)}</p>
                </div>
                <div className="pt-3 space-y-3 flex-1 overflow-y-auto">
                  {items.map((opportunity) => (
                    <div key={opportunity.id} className="rounded-2xl border border-outline-variant bg-surface p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">{opportunity.clientName}</p>
                          <p className="text-xs text-secondary mt-1">{opportunity.ownerName}</p>
                        </div>
                        <Badge variant={opportunity.priority === "critical" ? "error" : opportunity.priority === "high" ? "warning" : "neutral"}>
                          {opportunity.priority}
                        </Badge>
                      </div>
                      <p className="text-lg font-black text-on-surface">{formatCurrency(opportunity.amount, company.currency)}</p>
                      <p className="text-xs text-secondary">Prochaine action: {opportunity.nextAction}</p>
                      <div className="flex items-center justify-between text-xs text-secondary">
                        <span>{opportunity.probability}%</span>
                        <span>{opportunity.expectedClose}</span>
                      </div>
                      {can("opportunities.write") ? (
                        <div className="flex items-center justify-between gap-2 pt-2">
                          <Button variant="outline" size="sm" onClick={() => moveStage(opportunity, -1)} disabled={stage === "qualification"}>
                            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                            Retour
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => moveStage(opportunity, 1)} disabled={stage === "won" || stage === "lost"}>
                            Avancer
                            <ArrowRight className="w-3.5 h-3.5 ml-1" />
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
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="w-full max-w-xl rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl space-y-4">
            <div>
              <p className="text-sm font-bold text-on-surface">Nouvelle opportunite</p>
              <p className="text-xs text-secondary mt-1">Creation dans le pipeline persisté</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2" placeholder="Client ou prospect" value={newOpp.clientName} onChange={(event) => setNewOpp({ ...newOpp, clientName: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" type="number" placeholder="Montant" value={newOpp.amount} onChange={(event) => setNewOpp({ ...newOpp, amount: event.target.value })} required />
              <select className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={newOpp.stage} onChange={(event) => setNewOpp({ ...newOpp, stage: event.target.value as PipelineStage })}>
                {stages.slice(0, 3).map((stage) => (
                  <option key={stage} value={stage}>{pipelineStageLabel[stage]}</option>
                ))}
              </select>
              <select className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={newOpp.priority} onChange={(event) => setNewOpp({ ...newOpp, priority: event.target.value })}>
                <option value="low">Faible</option>
                <option value="medium">Moyenne</option>
                <option value="high">Haute</option>
                <option value="critical">Critique</option>
              </select>
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" type="date" value={newOpp.expectedClose} onChange={(event) => setNewOpp({ ...newOpp, expectedClose: event.target.value })} />
              <textarea className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2 min-h-28" placeholder="Prochaine action" value={newOpp.nextAction} onChange={(event) => setNewOpp({ ...newOpp, nextAction: event.target.value })} required />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
              <Button type="submit">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Creer
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
