import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Copy, Download, Eye, EyeOff, FileUp, Paperclip, Plus, Save, Send, Trash2, X,
} from "lucide-react";
import { apiUrl, ApiError, getJson, patchJson, postJson, requestJson } from "../lib/api";
import { Button } from "../components/ui";
import { CommentsThread } from "../components/CommentsThread";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Dialog";
import { useWorkspace } from "../context/WorkspaceContext";
import { useTranslation } from "../i18n";
import type { Product, Quote, QuoteAttachment, QuoteLine } from "../types";
import { QuoteStatusBadge } from "./ClientDetailView";

export function QuoteDetailView() {
  const { id } = useParams<{ id: string }>();
  const { can } = useWorkspace();
  const { t } = useTranslation();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: "", clientContact: "", clientEmail: "", clientAddress: "",
    notes: "", terms: "", paymentTerms: "", taxRate: "20", expiresAt: "",
  });
  const [savingHeader, setSavingHeader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [newLine, setNewLine] = useState({ description: "", quantity: "1", unitPrice: "0", discountPercent: "0", productId: "" });
  const [sendEmail, setSendEmail] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getJson<Quote>(`/api/v1/quotes/${id}`);
      setQuote(data);
      setForm({
        title: data.title,
        clientContact: data.clientContact,
        clientEmail: data.clientEmail,
        clientAddress: data.clientAddress,
        notes: data.notes,
        terms: data.terms,
        paymentTerms: data.paymentTerms,
        taxRate: String(data.taxRate),
        expiresAt: data.expiresAt ? data.expiresAt.slice(0, 10) : "",
      });
      setSendEmail(data.clientEmail || "");
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("qd.err.load"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void getJson<Product[]>(`/api/v1/products`).then((p) => setProducts(Array.isArray(p) ? p : [])).catch(() => {});
  }, []);

  const saveHeader = async () => {
    if (!id) return;
    setSavingHeader(true);
    try {
      await patchJson(`/api/v1/quotes/${id}`, {
        title: form.title,
        clientContact: form.clientContact,
        clientEmail: form.clientEmail,
        clientAddress: form.clientAddress,
        notes: form.notes,
        terms: form.terms,
        paymentTerms: form.paymentTerms,
        taxRate: Number(form.taxRate),
        expiresAt: form.expiresAt ? new Date(form.expiresAt + "T23:59:59").toISOString() : undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("qd.err.save"));
    } finally {
      setSavingHeader(false);
    }
  };

  const addLine = async () => {
    if (!id) return;
    const desc = newLine.description.trim() || (products.find((p) => p.id === newLine.productId)?.name ?? "");
    if (!desc) return;
    await postJson(`/api/v1/quotes/${id}/lines`, {
      productId: newLine.productId || undefined,
      description: desc,
      quantity: Number(newLine.quantity) || 1,
      unitPrice: Number(newLine.unitPrice) || 0,
      discountPercent: Number(newLine.discountPercent) || 0,
    });
    setNewLine({ description: "", quantity: "1", unitPrice: "0", discountPercent: "0", productId: "" });
    await load();
  };

  const updateLine = async (line: QuoteLine, patch: Partial<QuoteLine>) => {
    if (!id) return;
    await patchJson(`/api/v1/quotes/${id}/lines/${line.id}`, patch);
    await load();
  };

  const deleteLine = async (line: QuoteLine) => {
    if (!id) return;
    await requestJson(`/api/v1/quotes/${id}/lines/${line.id}`, { method: "DELETE" });
    await load();
  };

  const send = async () => {
    if (!id) return;
    try {
      const r = await postJson<{ link: string }>(`/api/v1/quotes/${id}/send`, { email: sendEmail });
      setLink(r.link);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("qd.err.send"));
    }
  };

  const cancel = async () => {
    if (!id || !quote) return;
    if (!confirm(t("qd.confirmCancel"))) return;
    await postJson(`/api/v1/quotes/${id}/cancel`);
    await load();
  };

  if (loading) return <div className="p-6 text-secondary">{t("common.loading")}</div>;
  if (!quote) {
    return (
      <div className="p-6">
        <p className="text-error">{error || t("qd.notFound")}</p>
        <Link to="/quotes" className="mt-3 inline-block text-sm text-primary">← {t("qd.back")}</Link>
      </div>
    );
  }

  const locked = quote.status === "signed" || quote.status === "cancelled";

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <Link to="/quotes" className="inline-flex items-center gap-1 text-xs text-secondary hover:text-on-surface">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("qd.backToAll")}
      </Link>

      {error ? (
        <div className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-error">{error}</div>
      ) : null}

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-secondary">{t("qd.numberLabel")}</p>
            <h1 className="text-2xl font-black text-on-surface">{quote.number}</h1>
            <p className="mt-1 text-sm text-secondary">
              {quote.clientName} ·{" "}
              {quote.clientId ? (
                <Link to={`/clients/${quote.clientId}`} className="text-primary">{t("qd.viewClient")}</Link>
              ) : quote.prospectId ? (
                <Link to={`/prospects/${quote.prospectId}`} className="text-primary">{t("qd.viewProspect")}</Link>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <QuoteStatusBadge status={quote.status} />
            <a
              href={apiUrl(`/api/v1/quotes/${quote.id}/pdf`)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-1.5 text-xs font-semibold hover:bg-surface"
            >
              <Download className="h-3.5 w-3.5" /> PDF
            </a>
            {!locked && quote.status !== "sent" ? (
              <Button size="sm" variant="outline" onClick={() => void cancel()}>
                {t("common.cancel")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Header / metadata form */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <h3 className="mb-3 text-sm font-bold">{t("qd.header")}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("qd.field.title")} value={form.title} onChange={(v) => setForm({ ...form, title: v })} disabled={locked} />
          <Field label={t("qd.field.contact")} value={form.clientContact} onChange={(v) => setForm({ ...form, clientContact: v })} disabled={locked} />
          <Field label={t("qd.field.email")} value={form.clientEmail} onChange={(v) => setForm({ ...form, clientEmail: v })} disabled={locked} />
          <Field label={t("qd.field.address")} value={form.clientAddress} onChange={(v) => setForm({ ...form, clientAddress: v })} disabled={locked} />
          <Field label={t("qd.field.tax")} type="number" value={form.taxRate} onChange={(v) => setForm({ ...form, taxRate: v })} disabled={locked} />
          <Field label={t("qd.field.validUntil")} type="date" value={form.expiresAt} onChange={(v) => setForm({ ...form, expiresAt: v })} disabled={locked} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TextArea label={t("qd.field.paymentTerms")} value={form.paymentTerms} onChange={(v) => setForm({ ...form, paymentTerms: v })} disabled={locked} />
          <TextArea label={t("qd.field.terms")} value={form.terms} onChange={(v) => setForm({ ...form, terms: v })} disabled={locked} />
        </div>
        <div className="mt-3">
          <TextArea label={t("qd.field.notes")} value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} disabled={locked} />
        </div>
        {!locked && can("orders.write") ? (
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => void saveHeader()} disabled={savingHeader}>
              <Save className="mr-1 h-3.5 w-3.5" /> {savingHeader ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Lines */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <h3 className="mb-3 text-sm font-bold">{t("qd.lines")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-secondary">
              <tr>
                <th className="px-2 py-2 text-left">{t("qd.col.description")}</th>
                <th className="px-2 py-2 text-right">{t("qd.col.qty")}</th>
                <th className="px-2 py-2 text-right">{t("qd.col.unitPrice")}</th>
                <th className="px-2 py-2 text-right">{t("qd.col.discount")}</th>
                <th className="px-2 py-2 text-right">{t("qd.col.total")}</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.length === 0 ? (
                <tr><td colSpan={6} className="px-2 py-4 text-center text-sm text-secondary">{t("qd.noLines")}</td></tr>
              ) : null}
              {quote.lines.map((line) => (
                <tr key={line.id} className="border-t border-outline-variant">
                  <td className="px-2 py-1.5">
                    <input
                      defaultValue={line.description}
                      onBlur={(e) => e.target.value !== line.description && void updateLine(line, { description: e.target.value })}
                      disabled={locked}
                      className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none hover:border-outline-variant focus:border-primary"
                    />
                  </td>
                  <td className="px-2 py-1.5 w-20">
                    <input type="number" step="0.01" defaultValue={line.quantity}
                      onBlur={(e) => Number(e.target.value) !== line.quantity && void updateLine(line, { quantity: Number(e.target.value) })}
                      disabled={locked} className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-right text-sm" />
                  </td>
                  <td className="px-2 py-1.5 w-28">
                    <input type="number" step="0.01" defaultValue={line.unitPrice}
                      onBlur={(e) => Number(e.target.value) !== line.unitPrice && void updateLine(line, { unitPrice: Number(e.target.value) })}
                      disabled={locked} className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-right text-sm" />
                  </td>
                  <td className="px-2 py-1.5 w-20">
                    <input type="number" step="0.1" defaultValue={line.discountPercent}
                      onBlur={(e) => Number(e.target.value) !== line.discountPercent && void updateLine(line, { discountPercent: Number(e.target.value) })}
                      disabled={locked} className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-right text-sm" />
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">{line.lineTotal.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right">
                    {!locked ? (
                      <button onClick={() => void deleteLine(line)} className="text-secondary hover:text-error">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!locked ? (
                <tr className="border-t border-outline-variant bg-surface-container/40">
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <select
                        value={newLine.productId}
                        onChange={(e) => {
                          const p = products.find((x) => x.id === e.target.value);
                          setNewLine({
                            ...newLine,
                            productId: e.target.value,
                            description: p ? p.name : newLine.description,
                            unitPrice: p ? String(p.price) : newLine.unitPrice,
                          });
                        }}
                        className="rounded border border-outline-variant bg-surface px-2 py-1 text-xs"
                      >
                        <option value="">{t("qd.productOptional")}</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.price}</option>)}
                      </select>
                      <input placeholder={t("qd.descriptionPh")} value={newLine.description}
                        onChange={(e) => setNewLine({ ...newLine, description: e.target.value })}
                        className="rounded border border-outline-variant bg-surface px-2 py-1 text-sm" />
                    </div>
                  </td>
                  <td className="px-2 py-2 w-20"><input type="number" step="0.01" value={newLine.quantity} onChange={(e) => setNewLine({ ...newLine, quantity: e.target.value })} className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-right text-sm" /></td>
                  <td className="px-2 py-2 w-28"><input type="number" step="0.01" value={newLine.unitPrice} onChange={(e) => setNewLine({ ...newLine, unitPrice: e.target.value })} className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-right text-sm" /></td>
                  <td className="px-2 py-2 w-20"><input type="number" step="0.1" value={newLine.discountPercent} onChange={(e) => setNewLine({ ...newLine, discountPercent: e.target.value })} className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-right text-sm" /></td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2 text-right">
                    <Button size="sm" onClick={() => void addLine()}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> {t("qd.add")}
                    </Button>
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-outline-variant text-sm">
                <td colSpan={4} className="px-2 py-2 text-right font-semibold">{t("qd.subtotal")}</td>
                <td className="px-2 py-2 text-right">{quote.subtotal.toFixed(2)} {quote.currency}</td>
                <td></td>
              </tr>
              <tr className="text-sm">
                <td colSpan={4} className="px-2 py-1 text-right text-secondary">{t("qd.tax", { rate: quote.taxRate.toFixed(2) })}</td>
                <td className="px-2 py-1 text-right">{quote.taxAmount.toFixed(2)} {quote.currency}</td>
                <td></td>
              </tr>
              <tr className="text-base font-black">
                <td colSpan={4} className="px-2 py-2 text-right">{t("qd.totalUpper")}</td>
                <td className="px-2 py-2 text-right">{quote.total.toFixed(2)} {quote.currency}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Send / signature */}
      {quote.status !== "signed" ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <h3 className="mb-3 text-sm font-bold">{t("qd.sendTitle")}</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-[11px] font-semibold text-secondary">{t("qd.emailClient")}</label>
              <input
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                placeholder={t("qd.emailPh")}
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <Button onClick={() => void send()} disabled={locked || quote.lines.length === 0}>
              <Send className="mr-1 h-4 w-4" /> {t("qd.generateSend")}
            </Button>
          </div>
          {link ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
              <span className="truncate">{link}</span>
              <button onClick={() => { void navigator.clipboard.writeText(link); }} className="ml-auto inline-flex items-center gap-1 rounded bg-white px-2 py-1 font-semibold">
                <Copy className="h-3 w-3" /> {t("qd.copy")}
              </button>
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-secondary">
            {t("qd.linkNote")}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <h3 className="text-sm font-bold">{t("qd.signedTitle")}</h3>
          <p className="text-xs text-secondary">
            {t("qd.signedBy")} <strong>{quote.signedByName}</strong>
            {quote.signedByEmail ? ` (${quote.signedByEmail})` : ""} {t("qd.on")}{" "}
            {quote.signedAt ? new Date(quote.signedAt).toLocaleString("fr-FR") : ""}.
          </p>
          {quote.orderId ? (
            <p className="mt-1 text-xs">
              {t("qd.orderCreated")}{" "}
              <Link to={`/orders`} className="font-semibold text-primary">{quote.orderId}</Link>
            </p>
          ) : null}
        </div>
      )}

      <AttachmentsSection quote={quote} onChange={load} disabled={locked && quote.status !== "signed"} />

      <div>
        <h3 className="mb-2 text-sm font-bold">{t("qd.internalDiscussion")}</h3>
        <CommentsThread entityType="quote" entityId={quote.id} />
      </div>

      {/* kept import used */}
      <div className="hidden"><X /></div>
    </div>
  );
}

function AttachmentsSection({ quote, onChange, disabled }: { quote: Quote; onChange: () => Promise<void>; disabled?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = (typeof document !== "undefined") ? null : null;
  void inputRef;

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/quotes/${quote.id}/attachments`), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Filename": file.name,
          "X-Visible-To-Client": "true",
        },
        body: file,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error || t("qd.uploadFailed", { status: res.status }));
      }
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const toggleVisible = async (att: QuoteAttachment) => {
    await patchJson(`/api/v1/quotes/${quote.id}/attachments/${att.id}`, { visibleToClient: !att.visibleToClient });
    await onChange();
  };

  const remove = async (att: QuoteAttachment) => {
    const decision = await confirm({
      title: t("qd.removeConfirmTitle", { name: att.name }),
      description: t("qd.removeConfirmDesc"),
      confirmLabel: t("qd.remove"),
      tone: "danger",
    });
    if (!decision.confirmed) return;
    await requestJson(`/api/v1/quotes/${quote.id}/attachments/${att.id}`, { method: "DELETE" });
    toast.success(t("qd.removed", { name: att.name }));
    await onChange();
  };

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold inline-flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" /> {t("qd.attachments")}
        </h3>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b4139]">
          <FileUp className="h-3.5 w-3.5" />
          {uploading ? t("qd.uploading") : t("qd.add")}
          <input
            type="file"
            className="hidden"
            disabled={uploading || disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error ? <p className="mb-2 text-xs text-error">{error}</p> : null}
      {quote.attachments.length === 0 ? (
        <p className="text-sm text-secondary">
          {t("qd.noAttachments")}
        </p>
      ) : (
        <ul className="space-y-1">
          {quote.attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface px-3 py-2">
              <a href={a.blobUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface hover:text-primary">
                {a.name}
              </a>
              <span className="shrink-0 text-[10px] text-secondary">{(a.sizeBytes / 1024).toFixed(1)} {t("qd.kb")}</span>
              <button
                type="button"
                onClick={() => void toggleVisible(a)}
                title={a.visibleToClient ? t("qd.visibleTitle") : t("qd.hiddenTitle")}
                className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                  a.visibleToClient ? "bg-primary/20 text-carbon" : "bg-surface-container text-secondary"
                }`}
              >
                {a.visibleToClient ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {a.visibleToClient ? t("qd.visibleClient") : t("qd.internal")}
              </button>
              <button onClick={() => void remove(a)} className="shrink-0 text-secondary hover:text-error" title={t("qd.remove")}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", disabled }: { label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-secondary">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
      />
    </div>
  );
}

function TextArea({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-secondary">{label}</label>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
      />
    </div>
  );
}
