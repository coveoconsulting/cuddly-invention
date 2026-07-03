import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { Button } from "../components/ui";
import { ApiError, postJson } from "../lib/api";

import { useTranslation } from "../i18n";
export function ResetPasswordView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  if (!token) {
    return (
      <div className="min-h-screen bg-surface px-4 py-10">
        <div className="mx-auto max-w-md rounded-2xl border border-outline-variant bg-white p-8 text-center shadow-lg">
          <h2 className="text-xl font-black text-on-surface">{t("resetPassword.auto.lienInvalide")}</h2>
          <p className="mt-2 text-sm text-secondary">
            Aucun jeton de réinitialisation fourni. Demandez un nouveau lien depuis la page de connexion.
          </p>
          <Button variant="outline" className="mt-4 w-full justify-center" onClick={() => navigate("/login")}>
            Retour à la connexion
          </Button>
        </div>
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      await postJson("/api/v1/auth/reset-password", { token, newPassword });
      setStatus("ok");
      setTimeout(() => navigate("/login"), 2000);
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof ApiError ? reason.message : "Reinitialisation impossible");
    }
  };

  return (
    <div className="min-h-screen bg-surface px-4 py-10">
      <form onSubmit={submit} className="mx-auto max-w-md space-y-5 rounded-2xl border border-outline-variant bg-white p-8 shadow-lg">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-black text-on-surface">{t("resetPassword.auto.nouveauMotDePasse")}</h2>
        </div>
        <p className="text-sm text-secondary">{t("resetPassword.auto.choisissezUnMotDe")}</p>

        {status === "ok" ? (
          <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
            Mot de passe mis à jour. Redirection vers la connexion...
          </div>
        ) : (
          <>
            <input
              type="password"
              minLength={12}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={t("resetPassword.auto.nouveauMotDePasse")}
              className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 text-sm"
            />
            <input
              type="password"
              minLength={12}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={t("resetPassword.auto.confirmer")}
              className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 text-sm"
            />
            {error ? <p className="text-xs text-error">{error}</p> : null}
            <Button type="submit" variant="primary" className="w-full justify-center" disabled={status === "saving"}>
              {status === "saving" ? "Mise à jour..." : "Définir le mot de passe"}
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
