import { useEffect, useMemo, useState } from "react";
import { CalendarClock, FileSignature, Headset, Megaphone, Phone, Plus } from "lucide-react";
import { ApiError, asArray, getJson, patchJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import type {
  CampaignItem,
  CaseItem,
  ContractItem,
  SalesCallItem,
} from "../types";
import type { ComponentType } from "react";
import { formatCurrency, formatDateTime, type BadgeTone } from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";

import { useTranslation } from "../i18n";
type ModuleKind = "contracts" | "cases" | "campaigns" | "calls";
type ModuleItem = ContractItem | CaseItem | CampaignItem | SalesCallItem;

const config = {
  contracts: {
    icon: FileSignature,
    title: "Contrats",
    subtitle: "Souscriptions, renouvellements et montants récurrents.",
    endpoint: "/api/v1/contracts",
    createLabel: "Nouveau contrat",
    statuses: ["draft", "active", "renewal_due", "expired", "cancelled"],
  },
  cases: {
    icon: Headset,
    title: "Service client",
    subtitle: "Dossiers, réclamations, incidents et délais de résolution.",
    endpoint: "/api/v1/cases",
    createLabel: "Nouveau dossier",
    statuses: ["open", "pending", "resolved", "closed"],
  },
  campaigns: {
    icon: Megaphone,
    title: "Campagnes",
    subtitle: "Plans de relance email, SMS, WhatsApp et phoning.",
    endpoint: "/api/v1/campaigns",
    createLabel: "Nouvelle campagne",
    statuses: ["draft", "scheduled", "running", "completed", "paused"],
  },
  calls: {
    icon: Phone,
    title: "Appels",
    subtitle: "File d'appels, relances planifiées et résultats.",
    endpoint: "/api/v1/calls",
    createLabel: "Planifier un appel",
    statuses: ["planned", "completed", "missed"],
  },
} satisfies Record<ModuleKind, {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  endpoint: string;
  createLabel: string;
  statuses: readonly string[];
}>;

function tone(status: string): BadgeTone {
  const { t } = useTranslation();
  if (["active", "running", "completed", "resolved"].includes(status)) return "success";
  if (["renewal_due", "pending", "scheduled", "planned"].includes(status)) return "warning";
  if (["expired", "cancelled", "missed"].includes(status)) return "error";
  return "neutral";
}

function itemTitle(kind: ModuleKind, item: ModuleItem) {
  const { t } = useTranslation();
  if (kind === "contracts") return (item as ContractItem).number;
  if (kind === "cases") return (item as CaseItem).title;
  if (kind === "campaigns") return (item as CampaignItem).name;
  return (item as SalesCallItem).subject;
}

function itemSubtitle(kind: ModuleKind, item: ModuleItem) {
  const { t } = useTranslation();
  if (kind === "contracts") {
    const contract = item as ContractItem;
    return `${contract.clientName} · renouvellement ${contract.renewalDate || contract.endDate}`;
  }
  if (kind === "cases") {
    const supportCase = item as CaseItem;
    return `${supportCase.clientName} · ${supportCase.category || "Général"} · ${supportCase.priority}`;
  }
  if (kind === "campaigns") {
    const campaign = item as CampaignItem;
    return `${campaign.channel.toUpperCase()} · ${campaign.audience || "Audience non définie"}`;
  }
  const call = item as SalesCallItem;
  return `${call.clientName} · ${formatDateTime(call.scheduledAt)}`;
}

function metric(kind: ModuleKind, item: ModuleItem, currency: string) {
  const { t } = useTranslation();
  if (kind === "contracts") return formatCurrency((item as ContractItem).amount, currency);
  if (kind === "campaigns") {
    const campaign = item as CampaignItem;
    return `${campaign.responseCount}/${campaign.sentCount} réponses`;
  }
  if (kind === "calls") {
    const call = item as SalesCallItem;
    return call.durationSeconds > 0 ? `${Math.round(call.durationSeconds / 60)} min` : call.phone || "-";
  }
  return formatDateTime((item as CaseItem).dueAt);
}

function OperationsModule({ kind }: { kind: ModuleKind }) {
  const { t } = useTranslation();
  const module = config[kind];
  const Icon = module.icon;
  const { company, can } = useWorkspace();
  const [items, setItems] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    clientName: "",
    amount: "",
    phone: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const canWrite = can(kind === "contracts" ? "orders.write" : "clients.write");

  const load = async () => {
    setLoading(true);
    try {
      const payload = await getJson<unknown>(module.endpoint);
      setItems(asArray<ModuleItem>(payload));
      setError("");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [kind]);

  const totals = useMemo(() => {
    const open = items.filter((item) => !["closed", "cancelled", "expired", "completed"].includes((item as { status: string }).status)).length;
    const critical = kind === "cases"
      ? items.filter((item) => (item as CaseItem).priority === "critical").length
      : 0;
    return { open, critical };
  }, [items, kind]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload =
      kind === "contracts"
        ? {
            clientName: form.clientName,
            amount: Number(form.amount),
            startDate: form.date,
            endDate: form.date,
            renewalDate: form.date,
            status: "active",
            notes: form.notes,
          }
        : kind === "cases"
          ? {
              title: form.name,
              clientName: form.clientName,
              category: "Support",
              priority: "medium",
              dueAt: new Date(form.date).toISOString(),
              description: form.notes,
            }
          : kind === "campaigns"
            ? {
                name: form.name,
                channel: "email",
                audience: form.clientName || "Tous les contacts",
                scheduledAt: new Date(form.date).toISOString(),
                status: "scheduled",
                notes: form.notes,
              }
            : {
                subject: form.name,
                clientName: form.clientName,
                phone: form.phone,
                scheduledAt: new Date(form.date).toISOString(),
                status: "planned",
                notes: form.notes,
              };
    try {
      await postJson(module.endpoint, payload);
      setShowCreate(false);
      setForm({ name: "", clientName: "", amount: "", phone: "", date: new Date().toISOString().slice(0, 10), notes: "" });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Création impossible");
    }
  };

  const updateStatus = async (item: ModuleItem, status: string) => {
    await patchJson(`${module.endpoint}/${item.id}`, { status });
    await load();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-secondary">{t("module.auto.operationsCommerciales")}</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-black text-on-surface">
            <Icon className="h-7 w-7 text-primary" />
            {module.title}
          </h1>
          <p className="mt-1 text-sm text-secondary">{module.subtitle}</p>
        </div>
        {canWrite ? (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {module.createLabel}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Total" value={items.length} />
        <Stat label="Ouverts" value={totals.open} />
        <Stat label={kind === "cases" ? "Critiques" : "À suivre"} value={kind === "cases" ? totals.critical : totals.open} />
      </div>

      {error ? <div className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-error">{error}</div> : null}

      {loading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">{t("module.auto.chargement")}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center text-secondary">
          Aucun élément pour le moment.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
          {items.map((item) => {
            const currentStatus = (item as { status: string }).status;
            return (
              <div key={item.id} className="flex flex-col gap-3 border-b border-outline-variant p-4 last:border-b-0 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-on-surface">{itemTitle(kind, item)}</p>
                  <p className="mt-1 text-xs text-secondary">{itemSubtitle(kind, item)}</p>
                </div>
                <div className="text-sm font-semibold text-on-surface">{metric(kind, item, company?.currency || "MAD")}</div>
                <Badge variant={tone(currentStatus)}>{currentStatus}</Badge>
                {canWrite ? (
                  <select
                    value={currentStatus}
                    onChange={(event) => void updateStatus(item, event.target.value)}
                    className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs"
                  >
                    {module.statuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={create} className="w-full max-w-lg space-y-3 rounded-2xl border border-outline-variant bg-white p-6 shadow-2xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-secondary">{module.title}</p>
              <h3 className="mt-1 text-xl font-black text-on-surface">{module.createLabel}</h3>
            </div>
            {kind !== "contracts" ? (
              <input className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("module.auto.titreNom")} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            ) : null}
            <input className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("module.auto.clientOuAudience")} value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} required />
            {kind === "contracts" ? (
              <input className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" type="number" placeholder={t("module.auto.montant")} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
            ) : null}
            {kind === "calls" ? (
              <input className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("module.auto.telephone")} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            ) : null}
            <label className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm">
              <CalendarClock className="h-4 w-4 text-secondary" />
              <input className="flex-1 bg-transparent outline-none" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            </label>
            <textarea className="min-h-24 w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm" placeholder={t("module.auto.notes")} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>{t("module.auto.annuler")}</Button>
              <Button type="submit">{t("module.auto.creer")}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <p className="text-xs text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-black text-on-surface">{value}</p>
    </div>
  );
}

export function ContractsView() {
  const { t } = useTranslation();
  return <OperationsModule kind="contracts" />;
}

export function CasesView() {
  const { t } = useTranslation();
  return <OperationsModule kind="cases" />;
}

export function CampaignsView() {
  const { t } = useTranslation();
  return <OperationsModule kind="campaigns" />;
}

export function CallsView() {
  const { t } = useTranslation();
  return <OperationsModule kind="calls" />;
}
