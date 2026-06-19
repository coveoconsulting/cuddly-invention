import { Link } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { Logo } from "../components/Logo";

type Tier = {
  id: "essentiel" | "professionnel" | "enterprise" | "sur_mesure";
  name: string;
  price: string;
  priceHint: string;
  tagline: string;
  highlight?: string;
  features: string[];
  cta: string;
  ctaHref: string;
  popular?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "essentiel",
    name: "Essentiel",
    price: "15–30 €",
    priceHint: "par utilisateur / mois",
    tagline: "Parfait pour débuter",
    features: [
      "Gestion des contacts et sociétés",
      "Suivi des opportunités",
      "Accès mobile natif",
      "Support par email",
    ],
    cta: "Demander une démo",
    ctaHref: "mailto:contact@coveoconsulting.ma?subject=D%C3%A9mo%20Essentiel",
  },
  {
    id: "professionnel",
    name: "Professionnel",
    price: "30–60 €",
    priceHint: "par utilisateur / mois",
    tagline: "Pour accélérer la vente",
    highlight: "Populaire",
    popular: true,
    features: [
      "Tout du niveau Essentiel",
      "Gestion des devis et factures",
      "Click-to-call intégré",
      "Intégration WhatsApp",
      "Support prioritaire",
    ],
    cta: "Démarrer gratuitement",
    ctaHref: "/login",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "60–120 €",
    priceHint: "par utilisateur / mois",
    tagline: "Pour les équipes exigeantes",
    highlight: "Avancé",
    features: [
      "Tout du niveau Professionnel",
      "Automatisations avancées",
      "Prévisions et IA",
      "API et intégrations illimitées",
      "Support 24/7 dédié",
    ],
    cta: "Contacter l'équipe",
    ctaHref: "mailto:contact@coveoconsulting.ma?subject=Enterprise",
  },
  {
    id: "sur_mesure",
    name: "Sur mesure",
    price: "Devis personnalisé",
    priceHint: "selon votre stratégie",
    tagline: "Personnalisé",
    features: [
      "Configuration totalement personnalisée",
      "Intégrations sur mesure",
      "Formation d'équipe incluse",
      "Accompagnement stratégique",
      "Accès à l'expertise Coveo",
    ],
    cta: "Demander un devis",
    ctaHref: "mailto:contact@coveoconsulting.ma?subject=Devis%20sur%20mesure",
  },
];

export function PricingView() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo className="h-12 w-auto" />
          <Link
            to="/login"
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4139]"
          >
            Se connecter
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-12 text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-carbon">
          <Sparkles className="h-3.5 w-3.5" /> Tarifs transparents
        </p>
        <h1 className="mt-4 text-4xl font-black text-on-surface md:text-5xl">
          Choisissez l'offre adaptée à votre force commerciale
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-secondary md:text-base">
          Tous les plans incluent l'accès mobile, la sécurité par défaut et les mises à jour continues.
          Augmentez ou réduisez à tout moment selon la taille de votre équipe.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`relative flex flex-col rounded-2xl border bg-surface-container-lowest p-6 shadow-sm ${
                tier.popular ? "border-primary ring-2 ring-primary/30" : "border-outline-variant"
              }`}
            >
              {tier.highlight ? (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  tier.popular ? "bg-primary text-carbon" : "bg-ink text-white"
                }`}>
                  {tier.highlight}
                </span>
              ) : null}
              <h3 className="text-lg font-bold text-on-surface">{tier.name}</h3>
              <p className="mt-1 text-xs text-secondary">{tier.tagline}</p>
              <div className="mt-4">
                <p className="text-3xl font-black text-on-surface">{tier.price}</p>
                <p className="text-[11px] text-secondary">{tier.priceHint}</p>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-on-surface">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={tier.ctaHref}
                className={`mt-6 block w-full rounded-full px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                  tier.popular
                    ? "bg-primary text-carbon hover:bg-[#c3fb7c]"
                    : "border border-outline-variant bg-white text-on-surface hover:bg-surface"
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 text-center text-sm text-secondary">
          <p>
            Besoin d'un déploiement multi-pays, d'une intégration ERP spécifique ou d'un onboarding sur le terrain ?{" "}
            <a href="mailto:contact@coveoconsulting.ma" className="font-semibold text-primary hover:underline">
              Contactez notre équipe
            </a>{" "}
            — nous construisons l'offre avec vous.
          </p>
        </div>
      </section>
    </div>
  );
}
