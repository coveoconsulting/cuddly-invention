import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, Sparkles, Users } from "lucide-react";
import { ApiError, getJson, patchJson, postJson } from "../lib/api";
import { Button } from "../components/ui";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  PLAN_FEATURES,
  PLAN_LABELS,
  type PlanFeature,
  type SubscriptionPlan,
} from "../types";

const FEATURE_LABELS: Record<PlanFeature, string> = {
  contacts: "Prospects & Comptes",
  pipeline: "Pipeline commercial",
  visits: "Visites & Tournées",
  orders: "Commandes",
  quotes: "Devis & Signature électronique",
  whatsapp: "Messagerie WhatsApp",
  click_to_call: "Click-to-call",
  assistant_ai: "Assistant IA",
  advanced_reports: "Rapports avancés",
  automations: "Automatisations",
  unlimited_integrations: "Intégrations illimitées",
};

const PLAN_ORDER: SubscriptionPlan[] = ["essentiel", "professionnel", "enterprise", "sur_mesure"];

const PLAN_PRICE: Record<SubscriptionPlan, string> = {
  essentiel: "15–30 €",
  professionnel: "30–60 €",
  enterprise: "60–120 €",
  sur_mesure: "Devis sur mesure",
};

type Billing = {
  plan: SubscriptionPlan;
  planSeats: number;
  planStartedAt: string | null;
  planNotes: string;
};

export function BillingView() {
  const { currentUser } = useWorkspace();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState<SubscriptionPlan | null>(null);
  const [seatsInput, setSeatsInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getJson<Billing>(`/api/v1/billing/plan`);
      setBilling(data);
      setSeatsInput(String(data.planSeats));
      setNotesInput(data.planNotes || "");
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startCheckout = async (plan: SubscriptionPlan) => {
    if (!isAdmin) return;
    setSavingPlan(plan);
    try {
      const checkout = await postJson<{ url: string }>(`/api/v1/billing/checkout`, {
        plan,
        quantity: Math.max(1, Number(seatsInput) || billing?.planSeats || 1),
      });
      window.location.assign(checkout.url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Checkout Stripe impossible");
    } finally {
      setSavingPlan(null);
    }
  };

  const saveSeatsAndNotes = async () => {
    if (!isAdmin || !billing) return;
    try {
      await patchJson(`/api/v1/billing/plan`, {
        plan: billing.plan,
        planSeats: Math.max(1, Number(seatsInput) || 1),
        planNotes: notesInput,
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Enregistrement impossible");
    }
  };

  if (loading) return <div className="p-6 text-secondary">Chargement…</div>;
  if (!billing) {
    return (
      <div className="p-6">
        <p className="text-error">{error || "Impossible de charger l'abonnement"}</p>
      </div>
    );
  }

  const currentFeatures = PLAN_FEATURES[billing.plan];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div>
        <p className="text-xs text-secondary">Plateforme</p>
        <h1 className="text-3xl font-black text-on-surface">Abonnement</h1>
        <p className="mt-1 text-sm text-secondary">
          Gérez votre plan, vos sièges et les fonctions activées pour votre équipe.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-error">{error}</div>
      ) : null}

      {/* current plan card */}
      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1 text-xs font-semibold text-carbon">
              <Sparkles className="h-3.5 w-3.5" /> Plan actuel
            </p>
            <h2 className="mt-1 text-2xl font-black text-on-surface">{PLAN_LABELS[billing.plan]}</h2>
            <p className="text-xs text-secondary">
              Actif depuis : {billing.planStartedAt ? new Date(billing.planStartedAt).toLocaleDateString("fr-FR") : "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-secondary">Sièges</p>
            <p className="text-2xl font-black text-on-surface">{billing.planSeats}</p>
          </div>
        </div>

        {isAdmin ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-secondary">Nombre de sièges</label>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-secondary" />
                <input
                  type="number" min={1}
                  value={seatsInput}
                  onChange={(e) => setSeatsInput(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-secondary">Notes internes</label>
              <input
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="N° contrat, date renouvellement…"
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button size="sm" onClick={() => void saveSeatsAndNotes()}>Enregistrer</Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* features included */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
        <h3 className="text-sm font-bold text-on-surface">Fonctions incluses dans votre plan</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(FEATURE_LABELS) as PlanFeature[]).map((f) => {
            const included = currentFeatures.includes(f);
            return (
              <div
                key={f}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  included ? "border-primary/40 bg-primary/10 text-on-surface" : "border-outline-variant bg-surface text-secondary"
                }`}
              >
                <Check className={`h-4 w-4 shrink-0 ${included ? "text-primary" : "text-outline-variant"}`} />
                <span className={included ? "" : "line-through opacity-60"}>{FEATURE_LABELS[f]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* plan comparison + upgrade */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-on-surface">Changer de plan</h3>
        {!isAdmin ? (
          <p className="text-xs text-secondary">Seuls les administrateurs peuvent modifier le plan.</p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((p) => {
            const isCurrent = p === billing.plan;
            return (
              <div
                key={p}
                className={`flex flex-col rounded-2xl border bg-surface-container-lowest p-4 ${
                  isCurrent ? "border-primary ring-2 ring-primary/30" : "border-outline-variant"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold text-on-surface">{PLAN_LABELS[p]}</h4>
                  {isCurrent ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-carbon">Actuel</span> : null}
                </div>
                <p className="mt-1 text-xs text-secondary">{PLAN_PRICE[p]}</p>
                <ul className="mt-3 space-y-1 text-xs">
                  {PLAN_FEATURES[p].slice(0, 5).map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{FEATURE_LABELS[f]}</span>
                    </li>
                  ))}
                  {PLAN_FEATURES[p].length > 5 ? (
                    <li className="text-[11px] text-secondary">+ {PLAN_FEATURES[p].length - 5} autres</li>
                  ) : null}
                </ul>
                <div className="mt-4">
                  {p === "sur_mesure" ? (
                    <a
                      href="mailto:contact@coveoconsulting.ma?subject=Devis%20sur%20mesure"
                      className="block w-full rounded-full border border-outline-variant bg-white px-3 py-2 text-center text-xs font-semibold hover:bg-surface"
                    >
                      Contacter
                    </a>
                  ) : isCurrent ? (
                    <button disabled className="w-full rounded-full bg-surface-container px-3 py-2 text-xs font-semibold text-secondary">
                      Plan actuel
                    </button>
                  ) : (
                    <button
                      onClick={() => void startCheckout(p)}
                      disabled={!isAdmin || savingPlan !== null}
                      className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-ink px-3 py-2 text-xs font-semibold text-white hover:bg-[#1b4139] disabled:opacity-50"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      {savingPlan === p ? "Ouverture..." : "Passer au paiement"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
