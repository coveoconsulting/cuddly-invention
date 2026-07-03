import { useEffect, useState } from "react";
import { KeySquare, Power, Shield, Trash2, UserPlus, UsersRound } from "lucide-react";
import type { RoleKey, RolesResponse, UserSummary } from "../types";
import { ApiError, asArray, getJson, patchJson, postJson, requestJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { SkeletonCard } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { useWorkspace } from "../context/WorkspaceContext";

import { useTranslation } from "../i18n";
const emptyRolesResponse: RolesResponse = {
  roles: [],
  users: [],
  teams: [],
  currentPermissions: [],
};

function normalizeRolesResponse(payload: unknown): RolesResponse {
  if (!payload || typeof payload !== "object") {
    return emptyRolesResponse;
  }
  const value = payload as Partial<RolesResponse>;
  return {
    roles: asArray(value.roles),
    users: asArray(value.users),
    teams: asArray(value.teams),
    currentPermissions: asArray(value.currentPermissions),
  };
}

export function RolesView() {
  const { t } = useTranslation();
  const { can, currentUser } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const [payload, setPayload] = useState<RolesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const loadRoles = async () => {
    setIsLoading(true);
    try {
      const response = await getJson<unknown>("/api/v1/roles");
      setPayload(normalizeRolesResponse(response));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const toggleActive = async (user: UserSummary) => {
    if (busyId) return;
    setBusyId(user.id);
    setActionError("");
    try {
      await patchJson(`/api/v1/users/${user.id}`, { active: !user.active });
      toast.success(user.active ? `${user.name} désactivé` : `${user.name} réactivé`);
      await loadRoles();
    } catch (reason) {
      const message = reason instanceof ApiError ? reason.message : "Action impossible";
      setActionError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  const removeUser = async (user: UserSummary) => {
    if (busyId) return;
    const decision = await confirm({
      title: `Supprimer ${user.name} ?`,
      description: "Cette action est définitive et supprime aussi l'historique d'accès. Préférez la désactivation si possible.",
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (!decision.confirmed) return;
    setBusyId(user.id);
    setActionError("");
    try {
      await requestJson(`/api/v1/users/${user.id}`, { method: "DELETE" });
      toast.success(`${user.name} supprimé`);
      await loadRoles();
    } catch (reason) {
      const message = reason instanceof ApiError ? reason.message : "Suppression impossible";
      setActionError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading || !payload) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-secondary">{t("roles.auto.securiteApplicative")}</p>
        <h1 className="text-3xl font-black text-on-surface mt-1">{t("roles.auto.rolesEtPermissions")}</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.9fr] gap-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-on-surface">{t("roles.auto.definitionsDeRoles")}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {payload.roles.map((role) => (
              <div key={role.key} className="rounded-2xl border border-outline-variant bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-on-surface">{role.label}</p>
                  <Badge variant="neutral">{role.permissions.length}</Badge>
                </div>
                <p className="text-xs text-secondary">{role.description}</p>
                <div className="flex flex-wrap gap-2">
                  {role.permissions.slice(0, 5).map((permission) => (
                    <Badge key={permission} variant="default">{permission}</Badge>
                  ))}
                  {role.permissions.length > 5 ? (
                    <Badge variant="neutral">+{role.permissions.length - 5}</Badge>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <UsersRound className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-on-surface">{t("roles.auto.utilisateursVisibles")}</h2>
            </div>
            {actionError ? (
              <p className="mb-3 text-xs text-error">{actionError}</p>
            ) : null}
            <div className="space-y-3">
              {payload.users.map((user) => {
                const isSelf = user.id === currentUser?.id;
                return (
                  <div key={user.id} className="rounded-2xl border border-outline-variant bg-surface p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-on-surface truncate">{user.name}</p>
                        {!user.active ? <Badge variant="warning">{t("roles.auto.desactive")}</Badge> : null}
                      </div>
                      <p className="text-xs text-secondary mt-1 truncate">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{user.roleLabel}</Badge>
                      {can("users.write") && !isSelf ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void toggleActive(user)}
                            disabled={busyId === user.id}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant bg-white hover:bg-surface disabled:opacity-50"
                            title={user.active ? "Désactiver" : "Réactiver"}
                          >
                            <Power className={`h-3.5 w-3.5 ${user.active ? "text-secondary" : "text-error"}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeUser(user)}
                            disabled={busyId === user.id || user.role === "super_admin"}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant bg-white hover:bg-surface disabled:opacity-50"
                            title={t("roles.auto.supprimer")}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-secondary" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <CreateUserCard roles={payload.roles.map((role) => ({ key: role.key, label: role.label }))} onCreated={loadRoles} />

          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <KeySquare className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-on-surface">{t("roles.auto.permissionsEffectives")}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {payload.currentPermissions.map((permission) => (
                <Badge key={permission} variant="default">{permission}</Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateUserCard({
  roles,
  onCreated,
}: {
  roles: Array<{ key: RoleKey; label: string }>;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const { can } = useWorkspace();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleKey>("sales_rep");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  if (!can("users.write")) {
    return null;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("saving");
    setError("");
    try {
      await postJson("/api/v1/users", { name, email, password, role });
      setStatus("ok");
      setName("");
      setEmail("");
      setPassword("");
      setRole("sales_rep");
      toast.success("Invitation envoyée", { title: name });
      onCreated();
    } catch (reason) {
      setStatus("error");
      const message = reason instanceof ApiError ? reason.message : "Creation impossible";
      setError(message);
      toast.error(message);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-on-surface">{t("roles.auto.inviterUnUtilisateur")}</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
          placeholder={t("roles.auto.nomComplet")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <input
          type="email"
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
          placeholder={t("roles.auto.emailEntrepriseCom")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          type="password"
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
          placeholder={t("roles.auto.motDePasseInitial")}
          minLength={12}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <select
          className="rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm"
          value={role}
          onChange={(event) => setRole(event.target.value as RoleKey)}
        >
          {roles.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {status === "ok" ? <p className="text-xs text-primary">{t("roles.auto.utilisateurCree")}</p> : null}
      {status === "error" && error ? <p className="text-xs text-error">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" loading={status === "saving"}>
          Créer l'utilisateur
        </Button>
      </div>
    </form>
  );
}
