import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Download, FileText, Paperclip, X } from "lucide-react";
import { apiUrl, ApiError, asArray, getJson, postJson } from "../lib/api";
import { Button } from "../components/ui";
import { SignaturePad } from "../components/SignaturePad";
import type { Quote } from "../types";

type PublicAttachment = { id: string; name: string; blobUrl: string; sizeBytes: number; contentType: string };

export function QuoteSignatureView() {
  const { id, token } = useParams<{ id: string; token: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [attachments, setAttachments] = useState<PublicAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [refusing, setRefusing] = useState(false);

  const load = useCallback(async () => {
    if (!id || !token) return;
    setLoading(true);
    try {
      const data = await getJson<Quote>(`/api/public/quotes/${id}?token=${encodeURIComponent(token)}`);
      setQuote(data);
      const att = await getJson<unknown>(`/api/public/quotes/${id}/attachments?token=${encodeURIComponent(token)}`).catch(() => []);
      setAttachments(asArray<PublicAttachment>(att));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Lien invalide");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { void load(); }, [load]);

  const sign = async () => {
    if (!id || !token) return;
    if (!name.trim() || !signature || !accepted) return;
    setSubmitting(true);
    try {
      await postJson(`/api/public/quotes/${id}/sign`, {
        token, signedByName: name.trim(), signedByEmail: email.trim(), signatureDataUrl: signature,
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Signature impossible");
    } finally {
      setSubmitting(false);
    }
  };

  const refuse = async (reason: string) => {
    if (!id || !token) return;
    try {
      await postJson(`/api/public/quotes/${id}/refuse`, { token, reason });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Refus impossible");
    }
  };

  if (loading) return <div className="p-10 text-center text-secondary">Chargement…</div>;

  if (error && !quote) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <X className="mx-auto mb-3 h-12 w-12 text-error" />
        <p className="text-lg font-bold text-on-surface">Lien invalide ou expiré</p>
        <p className="mt-2 text-sm text-secondary">{error}</p>
      </div>
    );
  }

  if (!quote) return null;

  if (success || quote.status === "signed") {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-primary" />
        <h1 className="text-2xl font-black text-on-surface">Merci !</h1>
        <p className="mt-2 text-sm text-secondary">
          {quote.status === "signed" || success
            ? "Le devis a bien été signé. Une copie vous sera envoyée par email."
            : "Votre réponse a bien été enregistrée."}
        </p>
        <a
          href={apiUrl(`/api/public/quotes/${id}/pdf?token=${encodeURIComponent(token || "")}`)}
          target="_blank" rel="noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
        >
          <Download className="h-4 w-4" /> Télécharger le PDF
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-secondary">Devis</p>
              <h1 className="text-2xl font-black">{quote.title || quote.number}</h1>
              <p className="text-sm text-secondary">N° {quote.number}</p>
            </div>
            <a
              href={apiUrl(`/api/public/quotes/${id}/pdf?token=${encodeURIComponent(token || "")}`)}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1.5 text-xs font-semibold"
            >
              <FileText className="h-3.5 w-3.5" /> PDF complet
            </a>
          </div>
          <div className="mt-3 text-sm text-secondary">
            <p>Adressé à : <strong className="text-on-surface">{quote.clientName}</strong></p>
            {quote.clientAddress ? <p>{quote.clientAddress}</p> : null}
            {quote.expiresAt ? <p>Valable jusqu'au : <strong className="text-on-surface">{new Date(quote.expiresAt).toLocaleDateString("fr-FR")}</strong></p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-secondary">
              <tr>
                <th className="px-2 py-2 text-left">Description</th>
                <th className="px-2 py-2 text-right">Qté</th>
                <th className="px-2 py-2 text-right">PU</th>
                <th className="px-2 py-2 text-right">Rem%</th>
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((l) => (
                <tr key={l.id} className="border-t border-outline-variant">
                  <td className="px-2 py-2">{l.description}</td>
                  <td className="px-2 py-2 text-right">{l.quantity}</td>
                  <td className="px-2 py-2 text-right">{l.unitPrice.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right">{l.discountPercent.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right font-semibold">{l.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-outline-variant">
                <td colSpan={4} className="px-2 py-2 text-right text-sm">Sous-total</td>
                <td className="px-2 py-2 text-right text-sm">{quote.subtotal.toFixed(2)} {quote.currency}</td>
              </tr>
              <tr>
                <td colSpan={4} className="px-2 py-1 text-right text-xs text-secondary">TVA ({quote.taxRate.toFixed(2)}%)</td>
                <td className="px-2 py-1 text-right text-xs">{quote.taxAmount.toFixed(2)} {quote.currency}</td>
              </tr>
              <tr className="text-base font-black">
                <td colSpan={4} className="px-2 py-2 text-right">TOTAL</td>
                <td className="px-2 py-2 text-right">{quote.total.toFixed(2)} {quote.currency}</td>
              </tr>
            </tfoot>
          </table>
          {quote.paymentTerms ? <p className="mt-3 text-xs text-secondary"><strong>Paiement :</strong> {quote.paymentTerms}</p> : null}
          {quote.terms ? <p className="mt-1 text-xs text-secondary"><strong>Conditions :</strong> {quote.terms}</p> : null}
        </div>

        {attachments.length > 0 ? (
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold">
              <Paperclip className="h-4 w-4" /> Pièces jointes
            </h2>
            <ul className="space-y-1">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2">
                  <a href={a.blobUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface hover:text-primary">
                    {a.name}
                  </a>
                  <span className="shrink-0 text-[10px] text-secondary">{(a.sizeBytes / 1024).toFixed(1)} Ko</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <h2 className="text-base font-bold">Signer le devis</h2>
          <p className="mt-1 text-xs text-secondary">
            En signant ci-dessous, vous acceptez le devis et ses conditions. Une commande sera créée automatiquement.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-secondary">Nom et prénom *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-secondary">Email (optionnel)</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-semibold text-secondary">Signature *</label>
            <SignaturePad onChange={setSignature} />
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs text-secondary">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
            <span>J'ai lu et j'accepte le devis et les conditions générales associées.</span>
          </label>
          {error ? <p className="mt-2 text-xs text-error">{error}</p> : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setRefusing(true)}
              className="text-xs text-secondary underline hover:text-error"
            >
              Je préfère refuser ce devis
            </button>
            <Button onClick={() => void sign()} disabled={!name.trim() || !signature || !accepted || submitting}>
              {submitting ? "Signature…" : "Signer le devis"}
            </Button>
          </div>
        </div>
      </div>

      {refusing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-5">
            <h3 className="text-base font-bold">Refuser le devis</h3>
            <p className="mt-1 text-xs text-secondary">Vous pouvez préciser une raison (optionnel) :</p>
            <textarea id="refuseReason" rows={3} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRefusing(false)}>Annuler</Button>
              <Button size="sm" onClick={() => {
                const v = (document.getElementById("refuseReason") as HTMLTextAreaElement | null)?.value ?? "";
                setRefusing(false);
                void refuse(v);
              }}>Confirmer le refus</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
