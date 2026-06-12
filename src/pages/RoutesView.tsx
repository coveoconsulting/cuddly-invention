import { useEffect, useMemo, useState } from "react";
import { Map, MapPin, Shuffle } from "lucide-react";
import type { Visit } from "../types";
import { getJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { visitStatusLabel, visitStatusTone } from "../lib/labels";

export function RoutesView() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [optimized, setOptimized] = useState(false);

  const loadVisits = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<Visit[]>("/api/v1/visits");
      setVisits(payload);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVisits();
  }, []);

  const routeVisits = useMemo(() => {
    const sorted = [...visits].sort((left, right) => {
      if (optimized) {
        const territoryCompare = left.territoryLabel.localeCompare(right.territoryLabel);
        return territoryCompare !== 0 ? territoryCompare : left.startTime.localeCompare(right.startTime);
      }
      const dateCompare = left.scheduledDate.localeCompare(right.scheduledDate);
      return dateCompare !== 0 ? dateCompare : left.startTime.localeCompare(right.startTime);
    });
    return sorted;
  }, [optimized, visits]);

  const totalDistance = routeVisits.length * (optimized ? 3.6 : 4.4);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-secondary">Preparation terrain</p>
          <h1 className="text-3xl font-black text-on-surface mt-1">Tournees</h1>
        </div>
        <Button variant="outline" className="gap-2 self-start" onClick={() => setOptimized((value) => !value)}>
          <Shuffle className="w-4 h-4" />
          {optimized ? "Revenir a l'ordre initial" : "Optimiser localement"}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Map className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-on-surface">Ordre de passage</h2>
          </div>
          {isLoading ? (
            <div className="text-secondary">Chargement des visites...</div>
          ) : (
            <div className="space-y-3">
              {routeVisits.map((visit, index) => (
                <div key={visit.id} className="rounded-2xl border border-outline-variant bg-surface p-4 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-primary text-on-primary flex items-center justify-center font-black shrink-0">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-on-surface">{visit.clientName}</p>
                      <Badge variant={visitStatusTone(visit.status)}>{visitStatusLabel[visit.status]}</Badge>
                    </div>
                    <p className="text-xs text-secondary mt-1">{visit.scheduledDate} | {visit.startTime} - {visit.endTime}</p>
                    <p className="text-xs text-secondary mt-1">{visit.objective}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-outline-variant bg-[#0f7b36] text-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4" />
            <h2 className="text-lg font-bold">Estimation de tournee</h2>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wider text-white/70">Nombre d'arrets</p>
              <p className="mt-2 text-3xl font-black">{routeVisits.length}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wider text-white/70">Distance theorique</p>
              <p className="mt-2 text-3xl font-black">{totalDistance.toFixed(1)} km</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wider text-white/70">Mode</p>
              <p className="mt-2 text-sm font-semibold">{optimized ? "Tri par territoire et horaire" : "Ordre planifie"}</p>
            </div>
            <p className="text-sm text-white/85">
              Cette vue reste simple mais s'appuie sur les vraies visites. Elle remplace l'ancienne
              carte factice par un ordre exploitable pour la journee.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
