import { useEffect, useMemo, useState } from "react";
import { Map, Shuffle } from "lucide-react";
import type { Visit } from "../types";
import { asArray, getJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import { VisitsMap } from "../components/VisitsMap";
import { visitStatusLabel, visitStatusTone } from "../lib/labels";

function visitPoint(visit: Visit) {
  return visit.checkInLocation || visit.checkOutLocation || null;
}

function distanceMeters(left: NonNullable<Visit["checkInLocation"]>, right: NonNullable<Visit["checkInLocation"]>) {
  const radius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(right.lat - left.lat);
  const dLng = toRad(right.lng - left.lng);
  const lat1 = toRad(left.lat);
  const lat2 = toRad(right.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function chronological(left: Visit, right: Visit) {
  const dateCompare = left.scheduledDate.localeCompare(right.scheduledDate);
  return dateCompare !== 0 ? dateCompare : left.startTime.localeCompare(right.startTime);
}

function optimizeRoute(visits: Visit[]) {
  const base = [...visits].sort(chronological);
  const withGps = base.filter((visit) => visitPoint(visit));
  const withoutGps = base.filter((visit) => !visitPoint(visit));
  if (withGps.length < 2) {
    return base;
  }

  const route: Visit[] = [];
  const remaining = [...withGps];
  let current = remaining.shift()!;
  route.push(current);

  while (remaining.length > 0) {
    const currentPoint = visitPoint(current)!;
    let nextIndex = 0;
    let nextDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const candidatePoint = visitPoint(candidate)!;
      const distance = distanceMeters(currentPoint, candidatePoint);
      if (distance < nextDistance) {
        nextDistance = distance;
        nextIndex = index;
      }
    });
    current = remaining.splice(nextIndex, 1)[0];
    route.push(current);
  }

  return [...route, ...withoutGps];
}

export function RoutesView() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [optimized, setOptimized] = useState(false);

  const loadVisits = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<unknown>("/api/v1/visits");
      setVisits(asArray<Visit>(payload));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadVisits();
  }, []);

  const routeVisits = useMemo(() => {
    if (optimized) {
      return optimizeRoute(visits);
    }
    return [...visits].sort(chronological);
  }, [optimized, visits]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-secondary">Préparation terrain</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">Tournées</h1>
        </div>
        <Button variant="outline" className="self-start gap-2" onClick={() => setOptimized((value) => !value)}>
          <Shuffle className="h-4 w-4" />
          {optimized ? "Revenir a l'ordre initial" : "Optimiser par GPS"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Map className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-on-surface">Ordre de passage</h2>
          </div>
          {isLoading ? (
            <div className="text-secondary">Chargement des visites...</div>
          ) : routeVisits.length === 0 ? (
            <EmptyState
              title="Aucune tournée disponible"
              description="Les arrêts s'organiseront ici dès qu'une visite sera planifiée."
            />
          ) : (
            <div className="space-y-3">
              {routeVisits.map((visit, index) => (
                <div
                  key={visit.id}
                  className="flex items-start gap-4 rounded-2xl border border-outline-variant bg-surface p-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary font-black text-on-primary">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-on-surface">{visit.clientName}</p>
                      <Badge variant={visitStatusTone(visit.status)}>{visitStatusLabel[visit.status]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-secondary">
                      {visit.scheduledDate} | {visit.startTime} - {visit.endTime}
                    </p>
                    <p className="mt-1 text-xs text-secondary">{visit.objective}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-outline-variant bg-white shadow-sm">
            <VisitsMap visits={routeVisits} className="h-[480px] w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
              <p className="text-xs uppercase tracking-wider text-secondary">Arrêts</p>
              <p className="mt-1 text-2xl font-black text-on-surface">{routeVisits.length}</p>
            </div>
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
              <p className="text-xs uppercase tracking-wider text-secondary">Avec GPS</p>
              <p className="mt-1 text-2xl font-black text-on-surface">
                {routeVisits.filter((visit) => visit.checkInLocation || visit.checkOutLocation).length}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
