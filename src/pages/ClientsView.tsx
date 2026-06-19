import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus2, Download, Mail, MapPin, Phone, Plus, Search, ShieldAlert, Trash2, User2 } from "lucide-react";
import type { Client } from "../types";
import { ApiError, asArray, getJson, postJson, requestJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import { SkeletonGrid } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { formatDate, riskLabel } from "../lib/labels";
import { toLocalIsoDate } from "../lib/dateDefaults";
import { useWorkspace } from "../context/WorkspaceContext";
import { buildCsv, downloadCsv } from "../lib/csv";

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

function createVisitFormDefaults() {
  return {
    objective: "",
    scheduledDate: toLocalIsoDate(),
    startTime: "09:00",
    endTime: "10:00",
  };
}

export function ClientsView() {
  const { can } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "client" | "prospect">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showVisitFor, setShowVisitFor] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyClientForm);
  const [visitForm, setVisitForm] = useState(createVisitFormDefaults);
  const [savingClient, setSavingClient] = useState(false);
  const [savingVisit, setSavingVisit] = useState(false);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);

  const removeClient = async (client: Client) => {
    if (busyDelete) return;
    const decision = await confirm({
      title: `Supprimer ${client.name} ?`,
      description: "Le compte sera retiré de la base. Préférez la désactivation si vous voulez conserver l'historique.",
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (!decision.confirmed) return;
    setBusyDelete(client.id);
    setClients((current) => current.filter((entry) => entry.id !== client.id));
    try {
      await requestJson(`/api/v1/clients/${client.id}`, { method: "DELETE" });
      toast.success(`${client.name} supprimé`);
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "Suppression impossible");
      await loadClients();
    } finally {
      setBusyDelete(null);
    }
  };

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<unknown>("/api/v1/clients");
      setClients(asArray<Client>(payload));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadClients();
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
    setSavingClient(true);
    try {
      await postJson("/api/v1/clients", {
        ...form,
        potentialScore: Number(form.potentialScore),
      });
      setForm(emptyClientForm);
      setShowCreate(false);
      toast.success("Compte créé", { title: form.name });
      await loadClients();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "Création impossible");
    } finally {
      setSavingClient(false);
    }
  };

  const handleCreateVisit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!showVisitFor) {
      return;
    }
    setSavingVisit(true);
    try {
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
      toast.success("Visite planifiée", { title: showVisitFor.name });
      setShowVisitFor(null);
      setVisitForm(createVisitFormDefaults());
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "Création impossible");
    } finally {
      setSavingVisit(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-secondary">Base clients et prospects</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">Comptes terrain</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              downloadCsv(
                "comptes",
                buildCsv(filteredClients, [
                  { label: "Nom", value: (c) => c.name },
                  { label: "Type", value: (c) => c.type },
                  { label: "Segment", value: (c) => c.segment },
                  { label: "Statut", value: (c) => c.status },
                  { label: "Ville", value: (c) => c.city },
                  { label: "Zone", value: (c) => c.zone },
                  { label: "Territoire", value: (c) => c.territoryLabel },
                  { label: "Propriétaire", value: (c) => c.ownerName },
                  { label: "Contact", value: (c) => c.contactName },
                  { label: "Téléphone", value: (c) => c.phone },
                  { label: "Email", value: (c) => c.email },
                  { label: "Potentiel", value: (c) => c.potentialScore },
                  { label: "Risque", value: (c) => c.financialRisk },
                  { label: "Dernière visite", value: (c) => c.lastVisit ?? "" },
                ]),
              )
            }
          >
            <Download className="h-4 w-4" />
            Exporter CSV
          </Button>
          {can("clients.write") ? (
            <Button className="self-start gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Nouveau compte
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-secondary" />
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
        <SkeletonGrid count={6} />
      ) : filteredClients.length === 0 ? (
        <EmptyState
          title="Aucun compte disponible"
          description="Commencez par créer un compte pour alimenter le portefeuille, les visites et le pipeline."
          action={
            can("clients.write") ? (
              <Button className="gap-2" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                Nouveau compte
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => (
            <div
              key={client.id}
              className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/clients/${client.id}`} className="text-lg font-bold text-on-surface hover:text-primary">
                      {client.name}
                    </Link>
                    <Badge variant={client.type === "client" ? "success" : "default"}>
                      {client.type === "client" ? "Client" : "Prospect"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-secondary">
                    Segment {client.segment} | {client.territoryLabel}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {client.financialRisk === "high" ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-error-container text-error">
                      <ShieldAlert className="h-4 w-4" />
                    </div>
                  ) : null}
                  {can("clients.delete") ? (
                    <button
                      type="button"
                      onClick={() => void removeClient(client)}
                      disabled={busyDelete === client.id}
                      title="Supprimer"
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant bg-white text-secondary transition-colors hover:border-error/30 hover:bg-error-container hover:text-error disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2 text-sm text-secondary">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{client.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User2 className="h-4 w-4 shrink-0 text-primary" />
                  <span>{client.contactName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-primary" />
                  <span>{client.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{client.email}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-outline-variant bg-surface p-3">
                  <p className="text-secondary">Potentiel</p>
                  <p className="mt-1 text-lg font-black text-on-surface">{client.potentialScore}/100</p>
                </div>
                <div className="rounded-xl border border-outline-variant bg-surface p-3">
                  <p className="text-secondary">Risque</p>
                  <p className="mt-1 text-lg font-black text-on-surface">{riskLabel[client.financialRisk]}</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-outline-variant pt-2 text-xs text-secondary">
                <div>
                  <p>Dernière visite: {formatDate(client.lastVisit)}</p>
                  <p>Prochaine visite: {formatDate(client.nextVisit)}</p>
                </div>
                {can("visits.write") ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowVisitFor(client)}
                  >
                    <CalendarPlus2 className="h-3.5 w-3.5" />
                    Planifier
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void handleCreateClient(event)}
            className="w-full max-w-xl space-y-4 rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl"
          >
            <div>
              <p className="text-sm font-bold text-on-surface">Creation d'un compte</p>
              <p className="mt-1 text-xs text-secondary">Ce compte sera enregistré immédiatement.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder="Nom du compte"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder="Contact principal"
                value={form.contactName}
                onChange={(event) => setForm({ ...form, contactName: event.target.value })}
                required
              />
              <select
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as "client" | "prospect" })}
              >
                <option value="client">Client</option>
                <option value="prospect">Prospect</option>
              </select>
              <select
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                value={form.segment}
                onChange={(event) => setForm({ ...form, segment: event.target.value as "A" | "B" | "C" })}
              >
                <option value="A">Segment A</option>
                <option value="B">Segment B</option>
                <option value="C">Segment C</option>
              </select>
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder="Adresse"
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder="Ville"
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder="Zone commerciale"
                value={form.zone}
                onChange={(event) => setForm({ ...form, zone: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder="Téléphone"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder="Email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder="Potentiel /100"
                type="number"
                min="0"
                max="100"
                value={form.potentialScore}
                onChange={(event) => setForm({ ...form, potentialScore: event.target.value })}
              />
              <textarea
                className="min-h-28 rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder="Notes"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={savingClient}>Enregistrer</Button>
            </div>
          </form>
        </div>
      ) : null}

      {showVisitFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void handleCreateVisit(event)}
            className="w-full max-w-lg space-y-4 rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl"
          >
            <div>
              <p className="text-sm font-bold text-on-surface">Planifier une visite</p>
              <p className="mt-1 text-xs text-secondary">{showVisitFor.name}</p>
            </div>
            <textarea
              className="min-h-24 w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              placeholder="Objectif de la visite"
              value={visitForm.objective}
              onChange={(event) => setVisitForm({ ...visitForm, objective: event.target.value })}
              required
            />
            <div className="grid gap-4 md:grid-cols-3">
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="date"
                value={visitForm.scheduledDate}
                onChange={(event) => setVisitForm({ ...visitForm, scheduledDate: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="time"
                value={visitForm.startTime}
                onChange={(event) => setVisitForm({ ...visitForm, startTime: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="time"
                value={visitForm.endTime}
                onChange={(event) => setVisitForm({ ...visitForm, endTime: event.target.value })}
                required
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowVisitFor(null)}>
                Annuler
              </Button>
              <Button type="submit" loading={savingVisit}>Planifier</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
