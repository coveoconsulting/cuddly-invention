import { useEffect, useMemo, useState } from "react";
import { Flag, Gauge, Medal } from "lucide-react";
import type { TargetProgress } from "../types";
import { getJson } from "../lib/api";
import { Badge } from "../components/ui";
import { formatCurrency } from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";

function percentage(actual: number, goal: number) {
  if (!goal) {
    return 0;
  }
  return Math.min(100, Math.round((actual / goal) * 100));
}

export function TargetsView() {
  const { company, currentUser } = useWorkspace();
  const [targets, setTargets] = useState<TargetProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTargets = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<TargetProgress[]>("/api/v1/targets");
      setTargets(payload);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTargets();
  }, []);

  const myTarget = useMemo(
    () => targets.find((target) => target.ownerUserId === currentUser?.id) || targets[0],
    [currentUser?.id, targets],
  );

  if (!company || !currentUser) {
    return null;
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-secondary">Objectifs commerciaux</p>
        <h1 className="text-3xl font-black text-on-surface mt-1">Suivi des objectifs</h1>
      </div>

      {isLoading || !myTarget ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center text-secondary">
          Chargement des objectifs...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wider text-secondary font-bold">CA</p>
              <p className="mt-2 text-2xl font-black text-on-surface">{formatCurrency(myTarget.revenueActual, company.currency)}</p>
              <p className="mt-1 text-xs text-secondary">Objectif: {formatCurrency(myTarget.revenueGoal, company.currency)}</p>
              <div className="mt-4 h-2 rounded-full bg-surface-container overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${percentage(myTarget.revenueActual, myTarget.revenueGoal)}%` }} />
              </div>
            </div>
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wider text-secondary font-bold">Visites</p>
              <p className="mt-2 text-2xl font-black text-on-surface">{myTarget.visitsActual} / {myTarget.visitsGoal}</p>
              <p className="mt-1 text-xs text-secondary">Execution terrain</p>
              <div className="mt-4 h-2 rounded-full bg-surface-container overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${percentage(myTarget.visitsActual, myTarget.visitsGoal)}%` }} />
              </div>
            </div>
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wider text-secondary font-bold">Opportunites</p>
              <p className="mt-2 text-2xl font-black text-on-surface">{myTarget.opportunitiesActual} / {myTarget.opportunitiesGoal}</p>
              <p className="mt-1 text-xs text-secondary">Pipeline actif</p>
              <div className="mt-4 h-2 rounded-full bg-surface-container overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${percentage(myTarget.opportunitiesActual, myTarget.opportunitiesGoal)}%` }} />
              </div>
            </div>
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wider text-secondary font-bold">Commandes</p>
              <p className="mt-2 text-2xl font-black text-on-surface">{myTarget.ordersActual} / {myTarget.ordersGoal}</p>
              <p className="mt-1 text-xs text-secondary">{myTarget.periodLabel}</p>
              <div className="mt-4 h-2 rounded-full bg-surface-container overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${percentage(myTarget.ordersActual, myTarget.ordersGoal)}%` }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-on-surface">Cap a tenir</h2>
              </div>
              <div className="rounded-2xl border border-outline-variant bg-surface p-4">
                <p className="text-sm font-semibold text-on-surface">{myTarget.periodLabel}</p>
                <p className="text-xs text-secondary mt-2 leading-relaxed">
                  Votre profil doit solder ses actions prioritaires: accelerer le pipeline actif,
                  convertir les visites prevues en comptes rendus exploitables et traiter les commandes
                  avec remise avant toute promesse terrain supplementaire.
                </p>
              </div>
              <div className="rounded-2xl border border-outline-variant bg-primary/5 p-4">
                <p className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-primary" />
                  Score de progression
                </p>
                <p className="mt-2 text-3xl font-black text-on-surface">
                  {Math.round(
                    (percentage(myTarget.revenueActual, myTarget.revenueGoal) +
                      percentage(myTarget.visitsActual, myTarget.visitsGoal) +
                      percentage(myTarget.opportunitiesActual, myTarget.opportunitiesGoal) +
                      percentage(myTarget.ordersActual, myTarget.ordersGoal)) /
                      4,
                  )}%
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <Medal className="w-4 h-4 text-primary" />
                  Vue equipe
                </h2>
                <Badge variant="neutral">{targets.length} profils</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-secondary border-b border-outline-variant">
                      <th className="py-2 pr-4 font-semibold">Profil</th>
                      <th className="py-2 pr-4 font-semibold">CA</th>
                      <th className="py-2 pr-4 font-semibold">Visites</th>
                      <th className="py-2 pr-4 font-semibold">Opportunites</th>
                      <th className="py-2 font-semibold">Commandes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map((target) => (
                      <tr key={target.id} className="border-b border-outline-variant/60">
                        <td className="py-3 pr-4 font-semibold text-on-surface">{target.ownerName}</td>
                        <td className="py-3 pr-4 text-secondary">{formatCurrency(target.revenueActual, company.currency)}</td>
                        <td className="py-3 pr-4 text-secondary">{target.visitsActual}/{target.visitsGoal}</td>
                        <td className="py-3 pr-4 text-secondary">{target.opportunitiesActual}/{target.opportunitiesGoal}</td>
                        <td className="py-3 text-secondary">{target.ordersActual}/{target.ordersGoal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
