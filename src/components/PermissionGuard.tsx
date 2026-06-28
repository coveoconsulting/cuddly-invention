import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";
import type { PermissionKey } from "../types";
import { Button } from "./ui";

/** Full-page "access denied" screen — shown when a user reaches a route their role can't use. */
export function AccessDenied() {
  const { currentUser } = useWorkspace();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-error-container">
        <ShieldAlert className="h-7 w-7 text-error" />
      </div>
      <h1 className="mt-4 text-xl font-black text-on-surface">Accès refusé</h1>
      <p className="mt-2 text-sm text-secondary">
        Votre profil{currentUser?.roleLabel ? ` « ${currentUser.roleLabel} »` : ""} n'a pas accès à cette section.
        Rapprochez-vous d'un administrateur si vous pensez que c'est une erreur.
      </p>
      <Link to="/dashboard" className="mt-5">
        <Button>Retour au tableau de bord</Button>
      </Link>
    </div>
  );
}

/** Wrap a route element so direct-URL access respects role permissions (defence in depth). */
export function PermissionGuard({ permission, children }: { permission: PermissionKey; children: ReactNode }) {
  const { can } = useWorkspace();
  if (!can(permission)) return <AccessDenied />;
  return <>{children}</>;
}
