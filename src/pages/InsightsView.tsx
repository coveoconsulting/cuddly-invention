import { useEffect, useState } from "react";
import { ChartNoAxesCombined, ShieldAlert, Users } from "lucide-react";
import type { ManagerOverview } from "../types";
import { getJson } from "../lib/api";
import { Badge } from "../components/ui";
import {
  approvalStatusLabel,
  approvalTone,
  formatCurrency,
  pipelineStageLabel,
} from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";

export function InsightsView() {
  const { company, can } = useWorkspace();
  const canSeeInsights = can("insights.read");
  const [overview, setOverview] = useState<ManagerOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadOverview = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<ManagerOverview>("/api/v1/manager/overview");
      setOverview(payload);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canSeeInsights) {
      loadOverview();
    } else {
      setIsLoading(false);
    }
  }, [canSeeInsights]);

  if (!company) {
    return null;
  }

  if (!canSeeInsights) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">
          Votre role ne dispose pas d'acces aux insights manager.
        </div>
      </div>
    );
  }

  if (isLoading || !overview) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">
          Chargement des insights manager...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-secondary">Pilotage equipe</p>
        <h1 className="text-3xl font-black text-on-surface mt-1">Manager insight</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Performance equipe
            </h2>
            <Badge variant="neutral">{overview.teamMembers.length} membres</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-secondary border-b border-outline-variant">
                  <th className="py-2 pr-4 font-semibold">Nom</th>
                  <th className="py-2 pr-4 font-semibold">Role</th>
                  <th className="py-2 pr-4 font-semibold">Visites</th>
                  <th className="py-2 pr-4 font-semibold">CA</th>
                  <th className="py-2 font-semibold">Pipeline</th>
                </tr>
              </thead>
              <tbody>
                {overview.teamMembers.map((member) => (
                  <tr key={member.userId} className="border-b border-outline-variant/60">
                    <td className="py-3 pr-4 font-semibold text-on-surface">{member.name}</td>
                    <td className="py-3 pr-4 text-secondary">{member.roleLabel}</td>
                    <td className="py-3 pr-4 text-secondary">{member.visitsCompleted}</td>
                    <td className="py-3 pr-4 text-secondary">{formatCurrency(member.ordersAmount, company.currency)}</td>
                    <td className="py-3 text-secondary">{formatCurrency(member.pipelineAmount, company.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-on-surface">Commandes a approuver</h2>
            </div>
            <div className="space-y-3">
              {overview.pendingApprovals.length === 0 ? (
                <p className="text-sm text-secondary">Aucune commande en attente.</p>
              ) : (
                overview.pendingApprovals.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-outline-variant bg-surface p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{order.clientName}</p>
                        <p className="text-xs text-secondary mt-1">{order.id}</p>
                      </div>
                      <Badge variant={approvalTone(order.approvalStatus)}>
                        {approvalStatusLabel[order.approvalStatus]}
                      </Badge>
                    </div>
                    <p className="text-xs text-secondary mt-2">
                      {formatCurrency(order.amount, company.currency)} avec remise de {order.discount}%.
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <ChartNoAxesCombined className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-on-surface">Couverture par territoire</h2>
            </div>
            <div className="space-y-3">
              {overview.territoryCoverage.map((territory) => (
                <div key={territory.territoryLabel} className="rounded-2xl border border-outline-variant bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-on-surface">{territory.territoryLabel}</p>
                    <p className="text-sm font-black text-on-surface">{formatCurrency(territory.revenue, company.currency)}</p>
                  </div>
                  <p className="text-xs text-secondary mt-2">
                    {territory.clients} clients | {territory.visits} visites
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <h2 className="text-sm font-bold text-on-surface mb-4">Opportunites a risque</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {overview.blockedOpportunities.map((opportunity) => (
            <div key={opportunity.id} className="rounded-2xl border border-outline-variant bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-on-surface">{opportunity.clientName}</p>
                <Badge variant={opportunity.priority === "critical" ? "error" : "warning"}>
                  {opportunity.priority}
                </Badge>
              </div>
              <p className="text-xs text-secondary mt-2">{pipelineStageLabel[opportunity.stage]}</p>
              <p className="text-sm font-black text-on-surface mt-3">{formatCurrency(opportunity.amount, company.currency)}</p>
              <p className="text-xs text-secondary mt-2">{opportunity.nextAction}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
