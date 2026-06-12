const faqs = [
  {
    question: "Ou sont stockees les donnees ?",
    answer:
      "La base locale est stockee dans `data/app-db.json`. Les clients, visites, opportunites, commandes, preferences et integrations y restent persistants entre deux redemarrages du serveur.",
  },
  {
    question: "Comment fonctionne l'authentification ?",
    answer:
      "Le login cree une session signee cote serveur et la navigation est ensuite filtree par permissions de role. Un commercial ne voit pas les memes donnees qu'un manager ou qu'un profil finance.",
  },
  {
    question: "Que fait maintenant l'assistant IA ?",
    answer:
      "Il lit le contexte reel de la session: clients visibles, commandes, pipeline, alertes et stock. Sans cle Gemini, il fournit un mode fallback base sur les donnees locales.",
  },
  {
    question: "Qu'est-ce qui reste MVP ?",
    answer:
      "Cette version couvre le socle demande: auth, acces, API, persistance, pipeline, visites, commandes, stock, objectifs, roles et integrations. Le hors-ligne mobile, les webhooks et l'ERP temps reel restent des etapes suivantes.",
  },
];

export function FAQView() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-secondary">Documentation rapide</p>
        <h1 className="text-3xl font-black text-on-surface mt-1">FAQ MVP</h1>
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
