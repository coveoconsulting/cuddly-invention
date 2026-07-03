import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus2, Download, Mail, MapPin, Phone, Plus, Search, ShieldAlert, Trash2, User2 } from "lucide-react";
import type { Client } from "../types";
import { ApiError, asArray, getJson, postJson, requestJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { CallButton } from "../components/CallButton";
import { EmptyState } from "../components/EmptyState";
import { SkeletonGrid } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { formatDate } from "../lib/labels";
import { toLocalIsoDate } from "../lib/dateDefaults";
import { useWorkspace } from "../context/WorkspaceContext";
import { useTranslation } from "../i18n";
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
  const { t } = useTranslation();
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
      title: t("clients.deleteConfirmTitle", { name: client.name }),
      description: t("clients.deleteConfirmDesc"),
      confirmLabel: t("clients.delete"),
      tone: "danger",
    });
    if (!decision.confirmed) return;
    setBusyDelete(client.id);
    setClients((current) => current.filter((entry) => entry.id !== client.id));
    try {
      await requestJson(`/api/v1/clients/${client.id}`, { method: "DELETE" });
      toast.success(t("clients.deleted", { name: client.name }));
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : t("clients.err.delete"));
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
      toast.success(t("clients.toast.created"), { title: form.name });
      await loadClients();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : t("clients.err.create"));
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
      toast.success(t("clients.toast.visitPlanned"), { title: showVisitFor.name });
      setShowVisitFor(null);
      setVisitForm(createVisitFormDefaults());
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : t("clients.err.create"));
    } finally {
      setSavingVisit(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-secondary">{t("clients.eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">{t("clients.title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              downloadCsv(
                "comptes",
                buildCsv(filteredClients, [
                  { label: t("clients.csv.name"), value: (c) => c.name },
                  { label: t("clients.csv.type"), value: (c) => c.type },
                  { label: t("clients.csv.segment"), value: (c) => c.segment },
                  { label: t("clients.csv.status"), value: (c) => c.status },
                  { label: t("clients.csv.city"), value: (c) => c.city },
                  { label: t("clients.csv.zone"), value: (c) => c.zone },
                  { label: t("clients.csv.territory"), value: (c) => c.territoryLabel },
                  { label: t("clients.csv.owner"), value: (c) => c.ownerName },
                  { label: t("clients.csv.contact"), value: (c) => c.contactName },
                  { label: t("clients.csv.phone"), value: (c) => c.phone },
                  { label: t("clients.csv.email"), value: (c) => c.email },
                  { label: t("clients.csv.potential"), value: (c) => c.potentialScore },
                  { label: t("clients.csv.risk"), value: (c) => c.financialRisk },
                  { label: t("clients.csv.lastVisit"), value: (c) => c.lastVisit ?? "" },
                ]),
              )
            }
          >
            <Download className="h-4 w-4" />
            {t("clients.exportCsv")}
          </Button>
          {can("clients.write") ? (
            <Button className="self-start gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {t("clients.new")}
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
            placeholder={t("clients.searchPh")}
          />
        </div>
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as "all" | "client" | "prospect")}
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
        >
          <option value="all">{t("clients.filter.all")}</option>
          <option value="client">{t("clients.filter.clients")}</option>
          <option value="prospect">{t("clients.filter.prospects")}</option>
        </select>
      </div>

      {isLoading ? (
        <SkeletonGrid count={6} />
      ) : filteredClients.length === 0 ? (
        <EmptyState
          title={t("clients.empty.title")}
          description={t("clients.empty.desc")}
          action={
            can("clients.write") ? (
              <Button className="gap-2" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                {t("clients.new")}
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
                      {t(`enum.clientType.${client.type}`)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-secondary">
                    {t("clients.card.segTerritory", { seg: client.segment, territory: client.territoryLabel })}
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
                      title={t("clients.delete")}
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
                  {client.phone ? (
                    <CallButton phone={client.phone} name={client.name} clientId={client.id} onLogged={loadClients} />
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{client.email}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-outline-variant bg-surface p-3">
                  <p className="text-secondary">{t("clients.card.potential")}</p>
                  <p className="mt-1 text-lg font-black text-on-surface">{client.potentialScore}/100</p>
                </div>
                <div className="rounded-xl border border-outline-variant bg-surface p-3">
                  <p className="text-secondary">{t("clients.card.risk")}</p>
                  <p className="mt-1 text-lg font-black text-on-surface">{t(`enum.risk.${client.financialRisk}`)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-outline-variant pt-2 text-xs text-secondary">
                <div>
                  <p>{t("clients.card.lastVisit", { date: formatDate(client.lastVisit) })}</p>
                  <p>{t("clients.card.nextVisit", { date: formatDate(client.nextVisit) })}</p>
                </div>
                {can("visits.write") ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowVisitFor(client)}
                  >
                    <CalendarPlus2 className="h-3.5 w-3.5" />
                    {t("clients.card.plan")}
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
              <p className="text-sm font-bold text-on-surface">{t("clients.form.title")}</p>
              <p className="mt-1 text-xs text-secondary">{t("clients.form.subtitle")}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder={t("clients.form.namePh")}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder={t("clients.form.contactPh")}
                value={form.contactName}
                onChange={(event) => setForm({ ...form, contactName: event.target.value })}
                required
              />
              <select
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as "client" | "prospect" })}
              >
                <option value="client">{t("enum.clientType.client")}</option>
                <option value="prospect">{t("enum.clientType.prospect")}</option>
              </select>
              <select
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                value={form.segment}
                onChange={(event) => setForm({ ...form, segment: event.target.value as "A" | "B" | "C" })}
              >
                <option value="A">{t("clients.form.segmentOpt", { s: "A" })}</option>
                <option value="B">{t("clients.form.segmentOpt", { s: "B" })}</option>
                <option value="C">{t("clients.form.segmentOpt", { s: "C" })}</option>
              </select>
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder={t("clients.form.addressPh")}
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder={t("clients.form.cityPh")}
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder={t("clients.form.zonePh")}
                value={form.zone}
                onChange={(event) => setForm({ ...form, zone: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder={t("clients.form.phonePh")}
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder={t("clients.form.emailPh")}
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder={t("clients.form.potentialPh")}
                type="number"
                min="0"
                max="100"
                value={form.potentialScore}
                onChange={(event) => setForm({ ...form, potentialScore: event.target.value })}
              />
              <textarea
                className="min-h-28 rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm md:col-span-2"
                placeholder={t("clients.form.notesPh")}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={savingClient}>{t("common.save")}</Button>
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
              <p className="text-sm font-bold text-on-surface">{t("clients.visit.title")}</p>
              <p className="mt-1 text-xs text-secondary">{showVisitFor.name}</p>
            </div>
            <textarea
              className="min-h-24 w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
              placeholder={t("clients.visit.objectivePh")}
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
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={savingVisit}>{t("clients.card.plan")}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
