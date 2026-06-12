import { useState } from "react";
import { AlertCircle, Database, KeyRound, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui";
import { ApiError } from "../lib/api";
import { useWorkspace } from "../context/WorkspaceContext";

const demoAccounts = [
  { label: "Commercial terrain", email: "terrain@atlas.local" },
  { label: "Manager commercial", email: "manager@atlas.local" },
  { label: "Admin entreprise", email: "admin@atlas.local" },
  { label: "Finance", email: "finance@atlas.local" },
];

export function LoginView() {
  const navigate = useNavigate();
  const { signIn } = useWorkspace();
  const showDemoAccounts = import.meta.env.DEV;
  const [email, setEmail] = useState(showDemoAccounts ? "terrain@atlas.local" : "");
  const [password, setPassword] = useState(showDemoAccounts ? "demo123" : "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

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
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-center min-h-[calc(100vh-80px)]">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/70 px-3 py-1 text-xs font-semibold text-primary">
            <Database className="w-3.5 h-3.5" />
            Base locale persistante
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-on-surface max-w-2xl">
              Force commerciale terrain avec auth, roles, API et donnees persistantes.
            </h1>
            <p className="text-base text-secondary max-w-2xl leading-relaxed">
              Cette version remplace la demo trompeuse par un vrai socle MVP: session utilisateur,
              permissions par role, base locale JSON et endpoints metier pour le pipeline, les visites,
              les commandes, le stock et les objectifs.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-outline-variant bg-white/80 p-4">
              <ShieldCheck className="w-5 h-5 text-primary mb-3" />
              <p className="font-semibold text-sm text-on-surface">Controle d'acces</p>
              <p className="text-xs text-secondary mt-1">Roles, permissions et filtrage des donnees par utilisateur.</p>
            </div>
            <div className="rounded-2xl border border-outline-variant bg-white/80 p-4">
              <Database className="w-5 h-5 text-primary mb-3" />
              <p className="font-semibold text-sm text-on-surface">BDD locale</p>
              <p className="text-xs text-secondary mt-1">Le fichier `data/app-db.json` conserve les donnees entre redemarrages.</p>
            </div>
            <div className="rounded-2xl border border-outline-variant bg-white/80 p-4">
              <KeyRound className="w-5 h-5 text-primary mb-3" />
              <p className="font-semibold text-sm text-on-surface">
                {showDemoAccounts ? "Comptes de test" : "Session securisee"}
              </p>
              <p className="text-xs text-secondary mt-1">
                {showDemoAccounts
                  ? "Mot de passe commun: `demo123` pour les profils seeds."
                  : "Connexion reservee aux utilisateurs provisionnes sur l'instance."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-outline-variant bg-white shadow-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-outline-variant bg-surface-container-low">
            <p className="text-xs uppercase tracking-wider text-secondary font-bold">Connexion</p>
            <h2 className="text-2xl font-black text-on-surface mt-1">Acceder au workspace</h2>
          </div>

          <div className="p-6 space-y-6">
            {showDemoAccounts ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-on-surface">Comptes precharges</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {demoAccounts.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => {
                        setEmail(account.email);
                        setPassword("demo123");
                      }}
                      className="text-left rounded-xl border border-outline-variant bg-surface px-3 py-3 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                    >
                      <p className="text-sm font-semibold text-on-surface">{account.label}</p>
                      <p className="text-xs text-secondary mt-1">{account.email}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder={showDemoAccounts ? "terrain@atlas.local" : "admin@your-company.com"}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder={showDemoAccounts ? "demo123" : "Votre mot de passe"}
                  required
                />
              </div>

              {error ? (
                <div className="rounded-xl border border-error/20 bg-error-container px-4 py-3 text-sm text-error flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <Button type="submit" variant="primary" className="w-full justify-center" disabled={isSubmitting}>
                {isSubmitting ? "Connexion..." : "Se connecter"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
