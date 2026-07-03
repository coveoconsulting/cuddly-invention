import { useTranslation } from "../i18n";

const faqs = [
  {
    question: "Comment créer un compte client ?",
    answer:
      "Menu Comptes → bouton Nouveau compte. Renseignez le nom, l'adresse, le contact et le territoire. Le commercial responsable est automatiquement vous-même, sauf si vous êtes manager ou admin (vous pouvez alors choisir un autre propriétaire).",
  },
  {
    question: "Comment planifier une visite terrain ?",
    answer:
      "Depuis Visites → Nouvelle visite. Choisissez le client (ou laissez vide pour une prospection), la date, le créneau et l'objectif. Sur le terrain, ouvrez la fiche visite, faites Check-in pour démarrer puis Check-out pour clôturer avec votre compte rendu.",
  },
  {
    question: "Comment convertir un prospect en client ?",
    answer:
      "Depuis Prospects, ouvrez la fiche du lead et cliquez sur Convertir. Un compte client est créé automatiquement avec les informations du prospect, le statut du prospect passe à converti. L'opération est tracée dans l'audit log.",
  },
  {
    question: "Que voient les différents rôles ?",
    answer:
      "Commercial : ses comptes, visites, opportunités et commandes. Manager : tout son équipe + validation des remises. Directeur et finance : périmètre global, validation des commandes sensibles. Admin : tout + gestion des utilisateurs.",
  },
  {
    question: "Comment générer le PDF d'une commande ?",
    answer:
      "Depuis Commandes, ouvrez la commande concernée et cliquez sur Télécharger PDF. Le document reprend le client, le montant, la remise, le statut et le commercial.",
  },
  {
    question: "Comment réinitialiser mon mot de passe ?",
    answer:
      "Sur la page de connexion, cliquez sur Mot de passe oublié. Un lien de réinitialisation est envoyé à votre email. Il reste valable 1 heure. Vous pouvez aussi changer votre mot de passe depuis Paramètres une fois connecté.",
  },
  {
    question: "Pourquoi je ne vois pas certains comptes ?",
    answer:
      "Les comptes sont filtrés par votre périmètre (votre équipe et vos territoires). Si vous attendez de voir un compte qui n'apparaît pas, vérifiez avec votre manager qu'il est bien rattaché à votre périmètre.",
  },
];

export function FAQView() {
  const { t } = useTranslation();
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-secondary">{t("faq.auto.aide")}</p>
        <h1 className="text-3xl font-black text-on-surface mt-1">{t("faq.auto.questionsFrequentes")}</h1>
      </div>

      <div className="space-y-4">
        {faqs.map((faq) => (
          <div key={faq.question} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
            <p className="text-sm font-bold text-on-surface">{faq.question}</p>
            <p className="text-sm text-secondary mt-3 leading-relaxed">{faq.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
