import { useEffect, useState } from "react";
import { KeySquare, Shield, UsersRound } from "lucide-react";
import type { RolesResponse } from "../types";
import { getJson } from "../lib/api";
import { Badge } from "../components/ui";

export function RolesView() {
  const [payload, setPayload] = useState<RolesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadRoles = async () => {
    setIsLoading(true);
    try {
      const response = await getJson<RolesResponse>("/api/v1/roles");
      setPayload(response);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  if (isLoading || !payload) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">
          Chargement de la matrice de roles...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-secondary">Securite applicative</p>
        <h1 className="text-3xl font-black text-on-surface mt-1">Roles et permissions</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.9fr] gap-6">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-on-surface">Definitions de roles</h2>
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
              <h2 className="text-sm font-bold text-on-surface">Utilisateurs visibles</h2>
            </div>
            <div className="space-y-3">
              {payload.users.map((user) => (
                <div key={user.id} className="rounded-2xl border border-outline-variant bg-surface p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{user.name}</p>
                    <p className="text-xs text-secondary mt-1">{user.email}</p>
                  </div>
                  <Badge variant="neutral">{user.roleLabel}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <KeySquare className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-on-surface">Permissions effectives</h2>
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
