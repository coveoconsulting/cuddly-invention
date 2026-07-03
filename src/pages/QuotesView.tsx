import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileText } from "lucide-react";
import { asArray, getJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import { useTranslation } from "../i18n";
import type { Quote, QuoteStatus } from "../types";
import { QuoteStatusBadge } from "./ClientDetailView";
import { buildCsv, downloadCsv } from "../lib/csv";

// Filter labels resolve to i18n keys quotes.filter.* at render.
const STATUSES: Array<{ id: "" | QuoteStatus; labelKey: string }> = [
  { id: "", labelKey: "quotes.filter.all" },
  { id: "draft", labelKey: "quotes.filter.draft" },
  { id: "sent", labelKey: "quotes.filter.sent" },
  { id: "signed", labelKey: "quotes.filter.signed" },
  { id: "refused", labelKey: "quotes.filter.refused" },
  { id: "expired", labelKey: "quotes.filter.expired" },
  { id: "cancelled", labelKey: "quotes.filter.cancelled" },
];

export function QuotesView() {
  const { t } = useTranslation();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"" | QuoteStatus>("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getJson<unknown>(`/api/v1/quotes${filter ? `?status=${filter}` : ""}`);
      setQuotes(asArray<Quote>(data));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((x) =>
      x.number.toLowerCase().includes(q) || x.clientName.toLowerCase().includes(q),
    );
  }, [quotes, query]);

  const totals = useMemo(() => {
    const signed = quotes.filter((q) => q.status === "signed").reduce((s, q) => s + q.total, 0);
    const sent = quotes.filter((q) => q.status === "sent").reduce((s, q) => s + q.total, 0);
    return { signed, sent };
  }, [quotes]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div>
        <p className="text-sm text-secondary">{t("quotes.eyebrow")}</p>
        <h1 className="text-3xl font-black text-on-surface">{t("quotes.title")}</h1>
        <p className="mt-1 text-sm text-secondary">
          {t("quotes.subtitle")}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label={t("quotes.stat.sent")} value={`${totals.sent.toFixed(2)}`} />
        <Stat label={t("quotes.stat.signed")} value={`${totals.signed.toFixed(2)}`} />
        <Stat label={t("quotes.stat.total")} value={`${quotes.length}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("quotes.searchPh")}
          className="flex-1 min-w-[220px] rounded-full border border-outline-variant bg-surface px-4 py-2 text-sm outline-none focus:border-primary"
        />
        <Button
          variant="outline"
          className="gap-2"
          onClick={() =>
            downloadCsv(
              "devis",
              buildCsv(filtered, [
                { label: t("quotes.col.number"), value: (q) => q.number },
                { label: t("quotes.col.client"), value: (q) => q.clientName },
                { label: t("quotes.col.status"), value: (q) => q.status },
                { label: t("quotes.col.total"), value: (q) => q.total },
                { label: t("quotes.col.currency"), value: (q) => q.currency },
                { label: t("quotes.col.issued"), value: (q) => q.issuedAt ?? "" },
                { label: t("quotes.col.expires"), value: (q) => q.expiresAt ?? "" },
                { label: t("quotes.col.signed"), value: (q) => q.signedAt ?? "" },
                { label: t("quotes.col.owner"), value: (q) => q.ownerName },
              ]),
            )
          }
        >
          <Download className="h-4 w-4" />
          {t("quotes.exportCsv")}
        </Button>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s.id || "all"}
              onClick={() => setFilter(s.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                filter === s.id ? "bg-ink text-white" : "bg-surface text-secondary hover:bg-surface-container"
              }`}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-secondary">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <EmptyState title={t("quotes.empty.title")} description={t("quotes.empty.desc")} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-sm">
            <thead className="bg-surface-container text-xs uppercase text-secondary">
              <tr>
                <th className="px-3 py-2 text-left">{t("quotes.col.number")}</th>
                <th className="px-3 py-2 text-left">{t("quotes.col.client")}</th>
                <th className="px-3 py-2 text-left">{t("quotes.col.status")}</th>
                <th className="px-3 py-2 text-right">{t("quotes.col.total")}</th>
                <th className="px-3 py-2 text-left">{t("quotes.col.issued")}</th>
                <th className="px-3 py-2 text-left">{t("quotes.col.expires")}</th>
                <th className="px-3 py-2 text-left">{t("quotes.col.owner")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id} className="border-t border-outline-variant hover:bg-surface-container">
                  <td className="px-3 py-2">
                    <Link to={`/quotes/${q.id}`} className="inline-flex items-center gap-1.5 font-semibold text-on-surface hover:text-primary">
                      <FileText className="h-3.5 w-3.5" /> {q.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{q.clientName}</td>
                  <td className="px-3 py-2"><QuoteStatusBadge status={q.status} /></td>
                  <td className="px-3 py-2 text-right font-semibold">{q.total.toFixed(2)} {q.currency}</td>
                  <td className="px-3 py-2 text-xs text-secondary">{q.issuedAt ? new Date(q.issuedAt).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="px-3 py-2 text-xs text-secondary">{q.expiresAt ? new Date(q.expiresAt).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="px-3 py-2 text-xs text-secondary">{q.ownerName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <p className="text-xs text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-black text-on-surface">{value}</p>
    </div>
  );
}

// kept import used
void Badge;
