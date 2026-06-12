import { useEffect, useMemo, useState } from "react";
import { CalendarPlus2, Mail, MapPin, Phone, Plus, Search, ShieldAlert, User2 } from "lucide-react";
import type { Client } from "../types";
import { getJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { formatDate, riskLabel } from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";

type ClientForm = {
  name: string;
  type: "client" | "prospect";
  segment: "A" | "B" | "C";
  address: string;
  city: string;
  zone: string;
  contactName: string;
  phone: string;
  email: string;
  potentialScore: string;
  notes: string;
};

const emptyClientForm: ClientForm = {
  name: "",
  type: "client",
  segment: "B",
  address: "",
  city: "",
  zone: "",
  contactName: "",
  phone: "",
  email: "",
  potentialScore: "60",
  notes: "",
};

export function ClientsView() {
  const { can } = useWorkspace();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "client" | "prospect">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showVisitFor, setShowVisitFor] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyClientForm);
  const [visitForm, setVisitForm] = useState({
    objective: "",
    scheduledDate: "2026-06-09",
    startTime: "09:00",
    endTime: "10:00",
  });

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<Client[]>("/api/v1/clients");
      setClients(payload);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const matchesQuery =
        client.name.toLowerCase().includes(query.toLowerCase()) ||
        client.contactName.toLowerCase().includes(query.toLowerCase()) ||
        client.city.toLowerCase().includes(query.toLowerCase());
      const matchesType = typeFilter === "all" || client.type === typeFilter;
      return matchesQuery && matchesType;
    });
  }, [clients, query, typeFilter]);

  const handleCreateClient = async (event: React.FormEvent) => {
    event.preventDefault();
    await postJson("/api/v1/clients", {
      ...form,
      potentialScore: Number(form.potentialScore),
    });
    setForm(emptyClientForm);
    setShowCreate(false);
    await loadClients();
  };

  const handleCreateVisit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!showVisitFor) {
      return;
    }
    await postJson("/api/v1/visits", {
      clientId: showVisitFor.id,
      clientName: showVisitFor.name,
      address: showVisitFor.address,
      city: showVisitFor.city,
      objective: visitForm.objective,
      scheduledDate: visitForm.scheduledDate,
      startTime: visitForm.startTime,
      endTime: visitForm.endTime,
    });
    setShowVisitFor(null);
    setVisitForm({
      objective: "",
      scheduledDate: "2026-06-09",
      startTime: "09:00",
      endTime: "10:00",
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-secondary">Base clients et prospects</p>
          <h1 className="text-3xl font-black text-on-surface mt-1">Comptes terrain</h1>
        </div>
        {can("clients.write") ? (
          <Button className="gap-2 self-start" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            Nouveau compte
          </Button>
        ) : null}
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-secondary" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-outline-variant bg-surface px-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Rechercher un client, un contact ou une ville"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as "all" | "client" | "prospect")}
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
        >
          <option value="all">Tous les comptes</option>
          <option value="client">Clients</option>
          <option value="prospect">Prospects</option>
        </select>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center text-secondary">
          Chargement des comptes...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredClients.map((client) => (
            <div key={client.id} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-on-surface">{client.name}</h2>
                    <Badge variant={client.type === "client" ? "success" : "default"}>
                      {client.type === "client" ? "Client" : "Prospect"}
                    </Badge>
                  </div>
                  <p className="text-xs text-secondary mt-1">
                    Segment {client.segment} | {client.territoryLabel}
                  </p>
                </div>
                {client.financialRisk === "high" ? (
                  <div className="w-10 h-10 rounded-2xl bg-error-container text-error flex items-center justify-center">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 text-sm text-secondary">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <span>{client.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User2 className="w-4 h-4 text-primary shrink-0" />
                  <span>{client.contactName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary shrink-0" />
                  <span>{client.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate">{client.email}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-surface p-3 border border-outline-variant">
                  <p className="text-secondary">Potentiel</p>
                  <p className="mt-1 text-lg font-black text-on-surface">{client.potentialScore}/100</p>
                </div>
                <div className="rounded-xl bg-surface p-3 border border-outline-variant">
                  <p className="text-secondary">Risque</p>
                  <p className="mt-1 text-lg font-black text-on-surface">{riskLabel[client.financialRisk]}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-secondary pt-2 border-t border-outline-variant">
                <div>
                  <p>Derniere visite: {formatDate(client.lastVisit)}</p>
                  <p>Prochaine visite: {formatDate(client.nextVisit)}</p>
                </div>
                {can("visits.write") ? (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowVisitFor(client)}>
                    <CalendarPlus2 className="w-3.5 h-3.5" />
                    Planifier
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate ? (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateClient} className="w-full max-w-xl rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl space-y-4">
            <div>
              <p className="text-sm font-bold text-on-surface">Creation d'un compte</p>
              <p className="text-xs text-secondary mt-1">Ce compte sera persiste dans la base locale.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Nom du compte" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Contact principal" value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} required />
              <select className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as "client" | "prospect" })}>
                <option value="client">Client</option>
                <option value="prospect">Prospect</option>
              </select>
              <select className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value as "A" | "B" | "C" })}>
                <option value="A">Segment A</option>
                <option value="B">Segment B</option>
                <option value="C">Segment C</option>
              </select>
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2" placeholder="Adresse" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Ville" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Zone commerciale" value={form.zone} onChange={(event) => setForm({ ...form, zone: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Telephone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder="Potentiel /100" type="number" min="0" max="100" value={form.potentialScore} onChange={(event) => setForm({ ...form, potentialScore: event.target.value })} />
              <textarea className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2 min-h-28" placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </div>
      ) : null}

      {showVisitFor ? (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateVisit} className="w-full max-w-lg rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl space-y-4">
            <div>
              <p className="text-sm font-bold text-on-surface">Planifier une visite</p>
              <p className="text-xs text-secondary mt-1">{showVisitFor.name}</p>
            </div>
            <textarea className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm min-h-24" placeholder="Objectif de la visite" value={visitForm.objective} onChange={(event) => setVisitForm({ ...visitForm, objective: event.target.value })} required />
            <div className="grid md:grid-cols-3 gap-4">
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" type="date" value={visitForm.scheduledDate} onChange={(event) => setVisitForm({ ...visitForm, scheduledDate: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" type="time" value={visitForm.startTime} onChange={(event) => setVisitForm({ ...visitForm, startTime: event.target.value })} required />
              <input className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" type="time" value={visitForm.endTime} onChange={(event) => setVisitForm({ ...visitForm, endTime: event.target.value })} required />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowVisitFor(null)}>Annuler</Button>
              <Button type="submit">Planifier</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
