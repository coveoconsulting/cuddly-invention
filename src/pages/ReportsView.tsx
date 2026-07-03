import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PipelineStage } from "../types";
import { getJson } from "../lib/api";
import { useWorkspace } from "../context/WorkspaceContext";
import { formatCurrency, pipelineStageLabel } from "../lib/labels";
import { Button } from "../components/ui";
import { buildCsv, downloadCsv } from "../lib/csv";

import { useTranslation } from "../i18n";
type Summary = {
  revenueByTerritory: Array<{ territory: string; revenue: number; clients: number }>;
  pipelineByStage: Array<{ stage: PipelineStage; amount: number; count: number }>;
  revenueByMonth: Array<{ month: string; revenue: number }>;
  visitStats: { total: number; completed: number; cancelled: number; missed: number };
  topClients: Array<{ id: string; name: string; revenue: number }>;
  kpis: { totalClients: number; totalOrders: number; totalRevenue: number; activePipeline: number };
};

const STAGE_COLORS: Record<PipelineStage, string> = {
  qualification: "#9ca3af",
  proposal: "#60a5fa",
  negotiation: "#fbbf24",
  won: "#34d399",
  lost: "#f87171",
};

function isSummary(value: unknown): value is Summary {
  const { t } = useTranslation();
  return Boolean(value) && typeof value === "object" && "kpis" in value;
}

type Forecast = {
  currency: string;
  monthly: Array<{ month: string; gross: number; weighted: number; count: number }>;
  totals: { gross: number; weighted: number; count: number };
};

function isForecast(value: unknown): value is Forecast {
  const { t } = useTranslation();
  return Boolean(value) && typeof value === "object" && "monthly" in value && "totals" in value;
}

export function ReportsView() {
  const { t } = useTranslation();
  const { company } = useWorkspace();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    const suffix = qs ? `?${qs}` : "";
    Promise.all([
      getJson<unknown>(`/api/v1/reports/summary${suffix}`),
      getJson<unknown>(`/api/v1/reports/forecast${suffix}`).catch(() => null),
    ])
      .then(([summaryPayload, forecastPayload]) => {
        if (cancelled) return;
        if (isSummary(summaryPayload)) setSummary(summaryPayload);
        if (isForecast(forecastPayload)) setForecast(forecastPayload);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1380px] space-y-6 p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
              <div className="h-3 w-1/3 animate-pulse rounded bg-surface-container" />
              <div className="mt-3 h-8 w-1/2 animate-pulse rounded bg-surface-container-high" />
            </div>
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
              <div className="h-4 w-1/3 animate-pulse rounded bg-surface-container" />
              <div className="mt-4 h-[260px] animate-pulse rounded-xl bg-surface-container" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!summary || !company) {
    return (
      <div className="p-6">
        <p className="text-sm text-secondary">{t("reports.auto.aucuneDonneeDisponible")}</p>
      </div>
    );
  }

  const visitCompletionRate = summary.visitStats.total
    ? Math.round((summary.visitStats.completed / summary.visitStats.total) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-secondary">{t("reports.auto.pilotage")}</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">{t("reports.auto.rapports")}</h1>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            const monthly = buildCsv(summary.revenueByMonth, [
              { label: "Mois", value: (r) => r.month },
              { label: "Revenu", value: (r) => r.revenue },
            ]);
            const territory = buildCsv(summary.revenueByTerritory, [
              { label: "Territoire", value: (r) => r.territory },
              { label: "Revenu", value: (r) => r.revenue },
              { label: "Clients", value: (r) => r.clients },
            ]);
            const pipeline = buildCsv(summary.pipelineByStage, [
              { label: "Étape", value: (r) => r.stage },
              { label: "Montant", value: (r) => r.amount },
              { label: "Nombre", value: (r) => r.count },
            ]);
            const tops = buildCsv(summary.topClients, [
              { label: "Client", value: (r) => r.name },
              { label: "Revenu", value: (r) => r.revenue },
            ]);
            downloadCsv(
              "rapports",
              `# Revenu par mois\r\n${monthly}\r\n\r\n# Pipeline par étape\r\n${pipeline}\r\n\r\n# Revenu par territoire\r\n${territory}\r\n\r\n# Top clients\r\n${tops}`,
            );
          }}
        >
          <Download className="h-4 w-4" />
          Exporter CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
        <label className="text-xs text-secondary">{t("reports.auto.du")}</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-outline-variant bg-surface px-2 py-1.5 text-sm"
        />
        <label className="text-xs text-secondary">au</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-outline-variant bg-surface px-2 py-1.5 text-sm"
        />
        {(from || to) ? (
          <button
            type="button"
            onClick={() => { setFrom(""); setTo(""); }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Réinitialiser
          </button>
        ) : null}
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Comptes" value={summary.kpis.totalClients.toLocaleString("fr-FR")} />
        <KpiCard label="Commandes" value={summary.kpis.totalOrders.toLocaleString("fr-FR")} />
        <KpiCard label="CA encaissé" value={formatCurrency(summary.kpis.totalRevenue, company.currency)} />
        <KpiCard label="Pipeline actif" value={formatCurrency(summary.kpis.activePipeline, company.currency)} />
      </section>

      {forecast && forecast.monthly.length > 0 ? (
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-on-surface">{t("reports.auto.previsionDeCaPondere")}</p>
              <p className="text-xs text-secondary">{t("reports.auto.brutPipelinePleinPondere")}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-on-surface">
                {formatCurrency(forecast.totals.weighted, company.currency)}
              </p>
              <p className="text-xs text-secondary">
                sur {formatCurrency(forecast.totals.gross, company.currency)} brut · {forecast.totals.count} opp.
              </p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-6">
            {forecast.monthly.map((entry) => (
              <div key={entry.month} className="rounded-xl border border-outline-variant bg-surface p-3">
                <p className="text-[11px] uppercase text-secondary">{entry.month}</p>
                <p className="mt-1 text-sm font-bold text-on-surface">
                  {formatCurrency(entry.weighted, company.currency)}
                </p>
                <p className="text-[10px] text-secondary">{entry.count} opp.</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <ChartCard title={t("reports.auto.revenuParMois")} subtitle={t("reports.auto.12DerniersMois")}>
          {summary.revenueByMonth.length === 0 ? (
            <EmptyChart message="Aucune commande encore" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={summary.revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#6b7280" tick={{ fontSize: 11 }} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value, company.currency)} />
                <Line type="monotone" dataKey="revenue" stroke="#2e7d5b" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={t("reports.auto.pipelineParEtape")} subtitle={t("reports.auto.montantsOuverts")}>
          {summary.pipelineByStage.every((entry) => entry.amount === 0) ? (
            <EmptyChart message="Aucune opportunité encore" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={summary.pipelineByStage}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="stage" tickFormatter={(stage) => pipelineStageLabel[stage as PipelineStage]} stroke="#6b7280" tick={{ fontSize: 11 }} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value, company.currency)} />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {summary.pipelineByStage.map((entry) => (
                    <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={t("reports.auto.revenuParTerritoire")} subtitle={t("reports.auto.tousStatutsConfondus")}>
          {summary.revenueByTerritory.every((entry) => entry.revenue === 0) ? (
            <EmptyChart message="Aucun revenu par territoire" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={summary.revenueByTerritory} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                <YAxis dataKey="territory" type="category" stroke="#6b7280" tick={{ fontSize: 11 }} width={120} />
                <Tooltip formatter={(value: number) => formatCurrency(value, company.currency)} />
                <Bar dataKey="revenue" fill="#2e7d5b" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={t("reports.auto.visitesTerrain")} subtitle={`Taux de complétion : ${visitCompletionRate}%`}>
          {summary.visitStats.total === 0 ? (
            <EmptyChart message="Aucune visite encore" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Terminées", value: summary.visitStats.completed, fill: "#34d399" },
                    { name: "Annulées", value: summary.visitStats.cancelled, fill: "#f87171" },
                    { name: "Manquées", value: summary.visitStats.missed, fill: "#fbbf24" },
                    { name: "À venir", value: Math.max(0, summary.visitStats.total - summary.visitStats.completed - summary.visitStats.cancelled - summary.visitStats.missed), fill: "#9ca3af" },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <h3 className="text-sm font-bold text-on-surface">{t("reports.auto.top10Clients")}</h3>
        {summary.topClients.length === 0 ? (
          <p className="mt-3 text-sm text-secondary">{t("reports.auto.aucuneCommandeClientEncore")}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant text-left text-xs uppercase tracking-wider text-secondary">
                <th className="py-2">#</th>
                <th>{t("reports.auto.client")}</th>
                <th className="text-right">{t("reports.auto.ca")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.topClients.map((client, index) => (
                <tr key={client.id} className="border-b border-outline-variant/40 last:border-b-0">
                  <td className="py-2 text-secondary">{index + 1}</td>
                  <td className="font-semibold text-on-surface">{client.name}</td>
                  <td className="text-right font-bold text-on-surface">{formatCurrency(client.revenue, company.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-secondary">{label}</p>
      <p className="mt-2 text-2xl font-black text-on-surface">{value}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-on-surface">{title}</h3>
        <p className="text-xs text-secondary">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface text-sm text-secondary">
      {message}
    </div>
  );
}
