import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, MapPinned, Navigation, Save } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { GeoPoint, Visit } from "../types";
import { getJson, patchJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { formatDateTime, visitStatusLabel, visitStatusTone } from "../lib/labels";

async function captureLocation(): Promise<GeoPoint | null> {
  if (!("geolocation" in navigator)) {
    return null;
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000 },
    );
  });
}

export function VisitReportView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [report, setReport] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadVisit = async () => {
    if (!id) {
      return;
    }
    setIsLoading(true);
    try {
      const payload = await getJson<Visit>(`/api/v1/visits/${id}`);
      setVisit(payload);
      setReport(payload.report || "");
      setNextAction(payload.nextAction || "");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVisit();
  }, [id]);

  const handleCheckIn = async () => {
    if (!id) {
      return;
    }
    setIsSubmitting(true);
    try {
      const location = await captureLocation();
      await postJson(`/api/v1/visits/${id}/check-in`, { location });
      await loadVisit();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!id) {
      return;
    }
    setIsSubmitting(true);
    try {
      await patchJson(`/api/v1/visits/${id}`, { report, nextAction });
      await loadVisit();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!id) {
      return;
    }
    setIsSubmitting(true);
    try {
      const location = await captureLocation();
      await postJson(`/api/v1/visits/${id}/check-out`, { location, report, nextAction });
      navigate("/visits");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-secondary">Chargement de la visite...</div>;
  }

  if (!visit) {
    return (
      <div className="p-6">
        <p className="text-error mb-4">Visite introuvable.</p>
        <Link to="/visits" className="text-primary font-semibold">
          Retour a la liste
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/visits" className="text-sm font-semibold text-secondary hover:text-primary flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Retour aux visites
        </Link>
      </div>

      <div className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black text-on-surface">{visit.clientName}</h1>
              <Badge variant={visitStatusTone(visit.status)}>{visitStatusLabel[visit.status]}</Badge>
            </div>
            <p className="text-sm text-secondary mt-2">{visit.objective}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-secondary">
              <span>{visit.scheduledDate}</span>
              <span>{visit.startTime} - {visit.endTime}</span>
              <span>{visit.territoryLabel}</span>
            </div>
          </div>

          <div className="rounded-2xl bg-surface p-4 border border-outline-variant min-w-[260px]">
            <p className="text-xs uppercase tracking-wider text-secondary font-bold">Execution</p>
            <div className="mt-3 space-y-2 text-sm text-secondary">
              <p>Check-in: {formatDateTime(visit.checkInAt)}</p>
              <p>Check-out: {formatDateTime(visit.checkOutAt)}</p>
              <p>Commercial: {visit.ownerName}</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6">
          <div className="rounded-2xl border border-outline-variant bg-surface p-5 space-y-4">
            <p className="text-sm font-bold text-on-surface">Infos terrain</p>
            <div className="space-y-3 text-sm text-secondary">
              <div className="flex items-start gap-2">
                <MapPinned className="w-4 h-4 text-primary mt-0.5" />
                <span>{visit.address}</span>
              </div>
              <div className="flex items-start gap-2">
                <Navigation className="w-4 h-4 text-primary mt-0.5" />
                <span>
                  Check-in geolocalise: {visit.checkInLocation ? `${visit.checkInLocation.lat.toFixed(5)}, ${visit.checkInLocation.lng.toFixed(5)}` : "non disponible"}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <Button onClick={handleCheckIn} disabled={isSubmitting || Boolean(visit.checkInAt)} className="justify-center">
                {visit.checkInAt ? "Check-in deja enregistre" : "Enregistrer le check-in"}
              </Button>
              <Button variant="outline" onClick={handleSaveDraft} disabled={isSubmitting}>
                <Save className="w-4 h-4 mr-2" />
                Sauvegarder le brouillon
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-outline-variant bg-surface p-5 space-y-4">
            <div>
              <p className="text-sm font-bold text-on-surface">Compte rendu</p>
              <p className="text-xs text-secondary mt-1">
                Ces donnees alimentent l'historique client et le suivi visite.
              </p>
            </div>
            <textarea
              value={report}
              onChange={(event) => setReport(event.target.value)}
              className="w-full min-h-40 rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Ce qui a ete vu, negocie, promis ou bloque pendant la visite"
            />
            <textarea
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              className="w-full min-h-28 rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Prochaine action obligatoire"
            />
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => navigate("/visits")}>Fermer</Button>
              <Button onClick={handleComplete} disabled={isSubmitting}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Cloturer la visite
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
