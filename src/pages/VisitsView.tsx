import { useEffect, useMemo, useState } from "react";
import { Clock3, MapPin, Plus, Route, Search } from "lucide-react";
import { Link } from "react-router-dom";
import type { Visit } from "../types";
import { getJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { visitStatusLabel, visitStatusTone } from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";

type VisitFilter = "all" | "today" | "open" | "completed";

export function VisitsView() {
  const { can } = useWorkspace();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<VisitFilter>("all");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    clientName: "",
    address: "",
    city: "",
    objective: "",
    scheduledDate: "2026-06-09",
    startTime: "09:00",
    endTime: "10:00",
  });

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

  const filteredVisits = useMemo(() => {
    return visits.filter((visit) => {
      const matchesQuery =
        visit.clientName.toLowerCase().includes(query.toLowerCase()) ||
        visit.objective.toLowerCase().includes(query.toLowerCase()) ||
        visit.city.toLowerCase().includes(query.toLowerCase());

      const matchesFilter =
        filter === "all"
          ? true
          : filter === "today"
            ? visit.scheduledDate === "2026-06-09"
            : filter === "open"
              ? visit.status === "planned" || visit.status === "in_progress"
              : visit.status === "completed";

      return matchesQuery && matchesFilter;
    });
  }, [filter, query, visits]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    await postJson("/api/v1/visits", form);
    setShowCreate(false);
    setForm({
      clientName: "",
      address: "",
      city: "",
      objective: "",
      scheduledDate: "2026-06-09",
      startTime: "09:00",
      endTime: "10:00",
    });
    await loadVisits();
  };

  return (
    <div className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-secondary">Execution terrain</p>
          <h1 className="text-3xl font-black text-on-surface mt-1">Visites et check-in</h1>
        </div>
        {can("visits.write") ? (
          <Button className="gap-2 self-start" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            Nouvelle visite
          </Button>
        ) : null}
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-secondary" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-outline-variant bg-surface px-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Rechercher par client, objectif ou ville"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "Toutes" },
            { key: "today", label: "Aujourd'hui" },
            { key: "open", label: "A traiter" },
            { key: "completed", label: "Terminees" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key as VisitFilter)}
              className={`rounded-full px-4 py-2 text-sm font-semibold border transition-colors ${
                filter === item.key
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface text-secondary border-outline-variant hover:bg-surface-container"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-on-surface">Liste des visites</p>
              <p className="text-xs text-secondary">Donnees filtrees par permissions utilisateur</p>
            </div>
            <Badge variant="neutral">{filteredVisits.length}</Badge>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-secondary">Chargement des visites...</div>
          ) : (
            <div className="divide-y divide-outline-variant">
              {filteredVisits.map((visit) => (
                <Link
                  key={visit.id}
                  to={`/visits/${visit.id}`}
                  className="block p-5 hover:bg-surface transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-on-surface">{visit.clientName}</p>
                        <Badge variant={visitStatusTone(visit.status)}>
                          {visitStatusLabel[visit.status]}
                        </Badge>
                        <Badge variant="neutral">{visit.territoryLabel}</Badge>
                      </div>
                      <p className="text-xs text-secondary">{visit.objective}</p>
                      <div className="flex flex-wrap gap-4 text-xs text-secondary">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-primary" />
                          {visit.address}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock3 className="w-3.5 h-3.5 text-primary" />
                          {visit.scheduledDate} | {visit.startTime} - {visit.endTime}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-secondary">
                      <p>Responsable: {visit.ownerName}</p>
                      <p>Check-in: {visit.checkInAt ? "Oui" : "Non"}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-outline-variant bg-[#0f7b36] text-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Route className="w-5 h-5" />
            <h2 className="text-lg font-bold">Resume de tournee</h2>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wider text-white/75">Visites a traiter</p>
              <p className="mt-2 text-3xl font-black">
                {visits.filter((visit) => visit.status === "planned" || visit.status === "in_progress").length}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wider text-white/75">Visites terminees</p>
              <p className="mt-2 text-3xl font-black">
                {visits.filter((visit) => visit.status === "completed").length}
              </p>
            </div>
            <p className="text-sm text-white/85 leading-relaxed">
              Les check-in et check-out sont maintenant lies a une vraie visite. Chaque cloture
              enregistre un compte rendu et peut servir de base a une relance, une commande ou une opportunite.
            </p>
          </div>
        </div>
      </div>

      {showCreate ? (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="w-full max-w-2xl rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl space-y-4">
            <div>
              <p className="text-sm font-bold text-on-surface">Planifier une visite</p>
              <p className="text-xs text-secondary mt-1">Creation persistante cote serveur</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Nom du client" value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Ville" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2" placeholder="Adresse" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required />
              <textarea className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2 min-h-24" placeholder="Objectif de visite" value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" type="date" value={form.scheduledDate} onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
              <Button type="submit">Creer la visite</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
