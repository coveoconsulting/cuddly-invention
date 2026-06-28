import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui";
import { Logo } from "../components/Logo";
import { ApiError, postJson } from "../lib/api";
import { useWorkspace } from "../context/WorkspaceContext";

export function LoginView() {
  const navigate = useNavigate();
  const { signIn } = useWorkspace();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "sending" | "sent">("idle");
  // Space chooser: this app is the field-sales product; the call center is a separate app.
  const [chosen, setChosen] = useState(false);
  const CALL_CENTER_URL = "https://cc.coveoconsulting.com";

  const handleForgot = async (event: React.FormEvent) => {
    event.preventDefault();
    setForgotStatus("sending");
    try {
      await postJson("/api/v1/auth/forgot-password", { email: forgotEmail });
    } catch {
      // noop — endpoint is intentionally tolerant
    }
    setForgotStatus("sent");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      await signIn(email, password);
      navigate("/dashboard", { replace: true });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Connexion impossible");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_38%),linear-gradient(180deg,#f8fbf7_0%,#eef4ec_100%)] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md flex-col items-center justify-center gap-6">
        <Logo className="h-24 w-full max-w-[420px]" />

        {!chosen ? (
          <div className="w-full overflow-hidden rounded-lg border border-outline-variant bg-white shadow-lg">
            <div className="border-b border-outline-variant bg-surface-container-low px-6 py-4">
              <h2 className="text-lg font-bold text-on-surface">Choisir un espace</h2>
            </div>
            <div className="space-y-3 p-6">
              <button
                type="button"
                onClick={() => { window.location.href = CALL_CENTER_URL; }}
                className="block w-full rounded-xl border border-outline-variant bg-surface px-5 py-4 text-left transition hover:border-primary hover:bg-primary/5"
              >
                <span className="block text-base font-bold text-on-surface">Centre d'appel</span>
                <span className="mt-0.5 block text-xs text-secondary">Prospection téléphonique · cc.coveoconsulting.com</span>
              </button>
              <button
                type="button"
                onClick={() => setChosen(true)}
                className="block w-full rounded-xl border border-primary bg-primary/10 px-5 py-4 text-left transition hover:bg-primary/15"
              >
                <span className="block text-base font-bold text-primary">Terrain</span>
                <span className="mt-0.5 block text-xs text-secondary">Force de vente terrain · cet espace</span>
              </button>
            </div>
          </div>
        ) : (
        <div className="w-full overflow-hidden rounded-lg border border-outline-variant bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-6 py-4">
            <h2 className="text-lg font-bold text-on-surface">Connexion · Terrain</h2>
            <button type="button" onClick={() => setChosen(false)} className="text-xs font-semibold text-primary hover:underline">
              Changer d'espace
            </button>
          </div>

          <div className="space-y-6 p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-on-surface">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="nom@entreprise.com"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-on-surface">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Votre mot de passe"
                  required
                />
              </div>

              {error ? (
                <div className="flex items-start gap-2 rounded-lg border border-error/20 bg-error-container px-4 py-3 text-sm text-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <Button type="submit" variant="primary" className="w-full justify-center" loading={isSubmitting}>
                Se connecter
              </Button>

              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setShowForgot(true);
                  setForgotStatus("idle");
                }}
                className="block w-full text-center text-xs font-semibold text-primary hover:underline"
              >
                Mot de passe oublié ?
              </button>
            </form>
          </div>
        </div>
        )}
      </div>

      {showForgot ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={handleForgot}
            className="w-full max-w-md space-y-4 rounded-2xl border border-outline-variant bg-white p-6 shadow-2xl"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-secondary">Réinitialisation</p>
              <h3 className="mt-1 text-xl font-black text-on-surface">Mot de passe oublié</h3>
            </div>
            {forgotStatus === "sent" ? (
              <div className="space-y-3">
                <p className="text-sm text-on-surface">
                  Si un compte existe pour <strong>{forgotEmail}</strong>, un email contenant un lien de réinitialisation vient d'être envoyé. Vérifiez votre boîte (et vos spams).
                </p>
                <Button type="button" variant="outline" className="w-full justify-center" onClick={() => setShowForgot(false)}>
                  Fermer
                </Button>
              </div>
            ) : (
              <>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  required
                  placeholder="nom@entreprise.com"
                  className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 text-sm"
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1 justify-center" onClick={() => setShowForgot(false)}>
                    Annuler
                  </Button>
                  <Button type="submit" variant="primary" className="flex-1 justify-center" loading={forgotStatus === "sending"}>
                    Envoyer le lien
                  </Button>
                </div>
              </>
            )}
          </form>
        </div>
      ) : null}
    </div>
  );
}
