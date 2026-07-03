import { useEffect, useMemo, useState } from "react";
import { Flag, Gauge, Medal, Pencil, Plus, Trash2 } from "lucide-react";
import type { RolesResponse, TargetProgress, UserSummary } from "../types";
import { ApiError, asArray, getJson, patchJson, postJson, requestJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { useConfirm } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { EmptyState } from "../components/EmptyState";
import { formatCurrency } from "../lib/labels";
import { useWorkspace } from "../context/WorkspaceContext";

import { useTranslation } from "../i18n";
type TargetForm = {
  ownerUserId: string;
  periodLabel: string;
  revenueGoal: string;
  visitsGoal: string;
  opportunitiesGoal: string;
  ordersGoal: string;
};

function percentage(actual: number, goal: number) {
  const { t } = useTranslation();
  if (!goal) {
    return 0;
  }
  return Math.min(100, Math.round((actual / goal) * 100));
}

function defaultPeriodLabel() {
  const { t } = useTranslation();
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date());
}

function formFromTarget(target: TargetProgress): TargetForm {
  const { t } = useTranslation();
  return {
    ownerUserId: target.ownerUserId,
    periodLabel: target.periodLabel,
    revenueGoal: String(target.revenueGoal),
    visitsGoal: String(target.visitsGoal),
    opportunitiesGoal: String(target.opportunitiesGoal),
    ordersGoal: String(target.ordersGoal),
  };
}

export function TargetsView() {
  const { t } = useTranslation();
  const { company, currentUser, can } = useWorkspace();
  const confirm = useConfirm();
  const toast = useToast();
  const [targets, setTargets] = useState<TargetProgress[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<TargetProgress | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<TargetForm>({
    ownerUserId: "",
    periodLabel: defaultPeriodLabel(),
    revenueGoal: "",
    visitsGoal: "",
    opportunitiesGoal: "",
    ordersGoal: "",
  });

  const canWriteTargets = can("targets.write");

  const loadTargets = async () => {
    setIsLoading(true);
    try {
      const payload = await getJson<unknown>("/api/v1/targets");
      setTargets(asArray<TargetProgress>(payload));
      if (can("roles.read")) {
        const rolesPayload = await getJson<RolesResponse>("/api/v1/roles");
        setUsers(rolesPayload.users.filter((user) => user.active));
      } else if (currentUser) {
        setUsers([currentUser]);
      }
      setError("");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Chargement impossible");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTargets();
  }, [currentUser?.id]);

  const myTarget = useMemo(
    () => targets.find((target) => target.ownerUserId === currentUser?.id) || targets[0],
    [currentUser?.id, targets],
  );

  const ownerOptions = users.length > 0 ? users : currentUser ? [currentUser] : [];

  const openCreate = () => {
    setEditing(null);
    setForm({
      ownerUserId: currentUser?.id || ownerOptions[0]?.id || "",
      periodLabel: defaultPeriodLabel(),
      revenueGoal: "",
      visitsGoal: "",
      opportunitiesGoal: "",
      ordersGoal: "",
    });
    setShowForm(true);
    setError("");
  };

  const openEdit = (target: TargetProgress) => {
    setEditing(target);
    setForm(formFromTarget(target));
    setShowForm(true);
    setError("");
  };

  const saveTarget = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ownerUserId: form.ownerUserId,
      periodLabel: form.periodLabel.trim(),
      revenueGoal: Number(form.revenueGoal) || 0,
      visitsGoal: Number(form.visitsGoal) || 0,
      opportunitiesGoal: Number(form.opportunitiesGoal) || 0,
      ordersGoal: Number(form.ordersGoal) || 0,
    };
    try {
      if (editing) {
        await patchJson(`/api/v1/targets/${editing.id}`, payload);
      } else {
        await postJson("/api/v1/targets", payload);
      }
      setShowForm(false);
      setEditing(null);
      await loadTargets();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const deleteTarget = async (target: TargetProgress) => {
    const decision = await confirm({
      title: `Supprimer l'objectif ${target.periodLabel} ?`,
      description: `L'objectif de ${target.ownerName} sera supprime definitivement.`,
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (!decision.confirmed) return;
    await requestJson(`/api/v1/targets/${target.id}`, { method: "DELETE" });
    toast.success("Objectif supprime");
    await loadTargets();
  };

  if (!company || !currentUser) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm text-secondary">{t("targets.auto.objectifsCommerciaux")}</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">{t("targets.auto.suiviDesObjectifs")}</h1>
        </div>
        {canWriteTargets ? (
          <Button className="self-start gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouvel objectif
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-error">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center text-secondary">
          Chargement des objectifs...
        </div>
      ) : !myTarget ? (
        <EmptyState
          title={t("targets.auto.aucunObjectifDefini")}
          description="Ajoutez des objectifs de chiffre d'affaires, de visites, d'opportunites et de commandes pour suivre l'execution."
          action={canWriteTargets ? <Button onClick={openCreate}>{t("targets.auto.creerLePremierObjectif")}</Button> : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <TargetCard
              label="CA"
              value={formatCurrency(myTarget.revenueActual, company.currency)}
              detail={`Objectif: ${formatCurrency(myTarget.revenueGoal, company.currency)}`}
              progress={percentage(myTarget.revenueActual, myTarget.revenueGoal)}
              color="bg-primary"
            />
            <TargetCard
              label="Visites"
              value={`${myTarget.visitsActual} / ${myTarget.visitsGoal}`}
              detail="Execution terrain"
              progress={percentage(myTarget.visitsActual, myTarget.visitsGoal)}
              color="bg-emerald-500"
            />
            <TargetCard
              label="Opportunites"
              value={`${myTarget.opportunitiesActual} / ${myTarget.opportunitiesGoal}`}
              detail="Pipeline actif"
              progress={percentage(myTarget.opportunitiesActual, myTarget.opportunitiesGoal)}
              color="bg-amber-500"
            />
            <TargetCard
              label="Commandes"
              value={`${myTarget.ordersActual} / ${myTarget.ordersGoal}`}
              detail={myTarget.periodLabel}
              progress={percentage(myTarget.ordersActual, myTarget.ordersGoal)}
              color="bg-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold text-on-surface">{t("targets.auto.capATenir")}</h2>
                </div>
                {canWriteTargets ? (
                  <Button variant="outline" size="sm" onClick={() => openEdit(myTarget)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Modifier
                  </Button>
                ) : null}
              </div>
              <div className="rounded-2xl border border-outline-variant bg-surface p-4">
                <p className="text-sm font-semibold text-on-surface">{myTarget.periodLabel}</p>
                <p className="mt-2 text-xs leading-relaxed text-secondary">
                  Objectif affecte a {myTarget.ownerName}. Suivez le chiffre d'affaires,
                  les visites terminees, les opportunites ouvertes et les commandes saisies.
                </p>
              </div>
              <div className="rounded-2xl border border-outline-variant bg-primary/5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <Gauge className="h-4 w-4 text-primary" />
                  Score de progression
                </p>
                <p className="mt-2 text-3xl font-black text-on-surface">
                  {Math.round(
                    (percentage(myTarget.revenueActual, myTarget.revenueGoal) +
                      percentage(myTarget.visitsActual, myTarget.visitsGoal) +
                      percentage(myTarget.opportunitiesActual, myTarget.opportunitiesGoal) +
                      percentage(myTarget.ordersActual, myTarget.ordersGoal)) /
                      4,
                  )}
                  %
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold text-on-surface">
                  <Medal className="h-4 w-4 text-primary" />
                  Vue equipe
                </h2>
                <Badge variant="neutral">{targets.length} profils</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant text-left text-secondary">
                      <th className="py-2 pr-4 font-semibold">{t("targets.auto.profil")}</th>
                      <th className="py-2 pr-4 font-semibold">{t("targets.auto.ca")}</th>
                      <th className="py-2 pr-4 font-semibold">{t("targets.auto.visites")}</th>
                      <th className="py-2 pr-4 font-semibold">{t("targets.auto.opportunites")}</th>
                      <th className="py-2 pr-4 font-semibold">{t("targets.auto.commandes")}</th>
                      {canWriteTargets ? <th className="py-2 font-semibold">{t("targets.auto.action")}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map((target) => (
                      <tr key={target.id} className="border-b border-outline-variant/60">
                        <td className="py-3 pr-4 font-semibold text-on-surface">
                          <span>{target.ownerName}</span>
                          <span className="ml-2 text-[10px] font-normal text-secondary">{target.periodLabel}</span>
                        </td>
                        <td className="py-3 pr-4 text-secondary">
                          {formatCurrency(target.revenueActual, company.currency)} / {formatCurrency(target.revenueGoal, company.currency)}
                        </td>
                        <td className="py-3 pr-4 text-secondary">
                          {target.visitsActual}/{target.visitsGoal}
                        </td>
                        <td className="py-3 pr-4 text-secondary">
                          {target.opportunitiesActual}/{target.opportunitiesGoal}
                        </td>
                        <td className="py-3 pr-4 text-secondary">
                          {target.ordersActual}/{target.ordersGoal}
                        </td>
                        {canWriteTargets ? (
                          <td className="flex gap-1 py-3">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(target)}>
                              Modifier
                            </Button>
                            <Button variant="ghost" size="sm" className="text-error" onClick={() => void deleteTarget(target)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void saveTarget(event)}
            className="w-full max-w-xl space-y-4 rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl"
          >
            <div>
              <p className="text-sm font-bold text-on-surface">
                {editing ? "Modifier l'objectif" : "Nouvel objectif"}
              </p>
              <p className="mt-1 text-xs text-secondary">
                Les realises sont calcules automatiquement depuis visites, pipeline et commandes.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <select
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                value={form.ownerUserId}
                onChange={(event) => setForm({ ...form, ownerUserId: event.target.value })}
                required
              >
                {ownerOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} - {user.roleLabel}
                  </option>
                ))}
              </select>
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                placeholder={t("targets.auto.periodeExJuin2026")}
                value={form.periodLabel}
                onChange={(event) => setForm({ ...form, periodLabel: event.target.value })}
                required
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="number"
                min="0"
                placeholder={t("targets.auto.objectifCa")}
                value={form.revenueGoal}
                onChange={(event) => setForm({ ...form, revenueGoal: event.target.value })}
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="number"
                min="0"
                placeholder={t("targets.auto.objectifVisites")}
                value={form.visitsGoal}
                onChange={(event) => setForm({ ...form, visitsGoal: event.target.value })}
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="number"
                min="0"
                placeholder={t("targets.auto.objectifOpportunites")}
                value={form.opportunitiesGoal}
                onChange={(event) => setForm({ ...form, opportunitiesGoal: event.target.value })}
              />
              <input
                className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
                type="number"
                min="0"
                placeholder={t("targets.auto.objectifCommandes")}
                value={form.ordersGoal}
                onChange={(event) => setForm({ ...form, ordersGoal: event.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function TargetCard({
  label,
  value,
  detail,
  progress,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  progress: number;
  color: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-secondary">{label}</p>
      <p className="mt-2 text-2xl font-black text-on-surface">{value}</p>
      <p className="mt-1 text-xs text-secondary">{detail}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-container">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
