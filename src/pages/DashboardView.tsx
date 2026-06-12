import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  CircleAlert,
  Download,
  MoveRight,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import type {
  Client,
  DashboardSnapshot,
  Opportunity,
  Order,
  Product,
  TargetProgress,
} from "../types";
import { getJson } from "../lib/api";
import { formatCurrency } from "../lib/labels";
import { Badge, Button } from "../components/ui";
import { useWorkspace } from "../context/WorkspaceContext";

type TimelinePoint = {
  label: string;
  value: number;
  detail: string;
};

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekLabels = ["W1", "W2", "W3", "W4"];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function sumOrderAmounts(orders: Order[]) {
  return orders
    .filter((order) => order.status !== "cancelled")
    .reduce((total, order) => total + order.amount, 0);
}

function monthIndex(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getMonth();
}

function buildProjectedAnnualSeries(anchorRevenue: number, pipelineAmount: number) {
  const base = Math.max(anchorRevenue, pipelineAmount * 0.42, 18000);
  const pattern = [0.44, 0.38, 0.6, 0.54, 0.82, 0.96, 1.18, 0.9, 1.22, 0.74, 0.58, 0.86];
  return monthLabels.map((label, index) => ({
    label,
    value: Math.round(base * pattern[index]),
    detail: `${Math.round(pattern[index] * 100)}% du tempo annuel`,
  }));
}

function buildAnnualRevenueSeries(orders: Order[], opportunities: Opportunity[], anchorRevenue: number) {
  const totals = Array.from({ length: 12 }, () => 0);

  orders
    .filter((order) => order.status !== "cancelled")
    .forEach((order) => {
      const index = monthIndex(order.date);
      if (index >= 0) {
        totals[index] += order.amount;
      }
    });

  opportunities
    .filter((opportunity) => opportunity.stage !== "lost")
    .forEach((opportunity) => {
      const index = monthIndex(opportunity.expectedClose);
      if (index >= 0) {
        totals[index] += Math.round(opportunity.amount * (opportunity.probability / 100) * 0.18);
      }
    });

  const populatedMonths = totals.filter((value) => value > 0).length;
  if (populatedMonths < 4) {
    const projected = buildProjectedAnnualSeries(anchorRevenue, opportunities.reduce((total, item) => total + item.amount, 0));
    return projected.map((point, index) => ({
      ...point,
      value: Math.round(Math.max(point.value, totals[index])),
      detail: totals[index] > 0 ? "Signal reel + projection" : point.detail,
    }));
  }

  return monthLabels.map((label, index) => ({
    label,
    value: Math.round(totals[index]),
    detail: "Performance consolidee",
  }));
}

function buildMonthlyRevenueSeries(monthlyRevenue: number, completedVisits: number, activeOpportunities: number) {
  const anchor = Math.max(monthlyRevenue, 14000);
  const opportunityPulse = Math.max(activeOpportunities, 1) * 720;
  const visitLift = Math.max(completedVisits, 1) * 380;
  const weights = [0.18, 0.24, 0.27, 0.31];

  return weekLabels.map((label, index) => ({
    label,
    value: Math.round(anchor * weights[index] + opportunityPulse * 0.18 + visitLift * (index / 5)),
    detail: `Momentum ${label}`,
  }));
}

function buildAnnualPipelineSeries(opportunities: Opportunity[], fallbackAmount: number) {
  const totals = Array.from({ length: 12 }, () => 0);

  opportunities
    .filter((opportunity) => opportunity.stage !== "won" && opportunity.stage !== "lost")
    .forEach((opportunity) => {
      const index = monthIndex(opportunity.expectedClose);
      if (index >= 0) {
        totals[index] += Math.round(opportunity.amount * (opportunity.probability / 100));
      }
    });

  const populatedMonths = totals.filter((value) => value > 0).length;
  if (populatedMonths < 4) {
    const projected = buildProjectedAnnualSeries(fallbackAmount * 0.76, fallbackAmount);
    return projected.map((point) => ({
      ...point,
      value: Math.round(point.value * 0.82),
      detail: "Pipeline projete",
    }));
  }

  return monthLabels.map((label, index) => ({
    label,
    value: Math.round(totals[index]),
    detail: "Forecast pipeline",
  }));
}

function buildMonthlyPipelineSeries(pipelineAmount: number, activeOpportunities: number) {
  const anchor = Math.max(pipelineAmount, 16000);
  const weights = [0.16, 0.22, 0.28, 0.34];

  return weekLabels.map((label, index) => ({
    label,
    value: Math.round(anchor * weights[index] + activeOpportunities * 680),
    detail: `${activeOpportunities} opportunites ouvertes`,
  }));
}

function growthBetween(currentValue: number, previousValue: number) {
  if (previousValue <= 0) {
    return currentValue > 0 ? 100 : 0;
  }
  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
}

function compactCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function satisfactionNarrative(score: number) {
  if (score >= 88) {
    return "Feedback premium sur la reactivite et la precision du suivi terrain.";
  }
  if (score >= 78) {
    return "La relation client reste solide, avec un bon ressenti sur la cadence de service.";
  }
  return "La satisfaction reste correcte mais demande plus de suivi proactif sur les comptes clefs.";
}

export function DashboardView() {
  const { company, currentUser } = useWorkspace();
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [targets, setTargets] = useState<TargetProgress[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<"monthly" | "yearly">("yearly");
  const [chartMode, setChartMode] = useState<"revenue" | "pipeline">("revenue");
  const [activePoint, setActivePoint] = useState<number | null>(null);

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const [
        dashboardPayload,
        ordersPayload,
        opportunitiesPayload,
        targetsPayload,
        clientsPayload,
        productsPayload,
      ] = await Promise.all([
        getJson<DashboardSnapshot>("/api/v1/dashboard"),
        getJson<Order[]>("/api/v1/orders"),
        getJson<Opportunity[]>("/api/v1/opportunities"),
        getJson<TargetProgress[]>("/api/v1/targets"),
        getJson<Client[]>("/api/v1/clients"),
        getJson<Product[]>("/api/v1/products"),
      ]);

      setDashboard(dashboardPayload);
      setOrders(ordersPayload);
      setOpportunities(opportunitiesPayload);
      setTargets(targetsPayload);
      setClients(clientsPayload);
      setProducts(productsPayload);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (!company || !currentUser) {
    return null;
  }

  if (isLoading || !dashboard) {
    return (
      <div className="bento-card mx-auto max-w-[1560px] p-10 text-center text-secondary">
        Chargement du Sales Command Center...
      </div>
    );
  }

  const myTarget = targets.find((target) => target.ownerUserId === currentUser.id) || targets[0] || null;
  const activeOpportunities = opportunities.filter(
    (opportunity) => opportunity.stage !== "won" && opportunity.stage !== "lost",
  );
  const closedOpportunities = opportunities.filter(
    (opportunity) => opportunity.stage === "won" || opportunity.stage === "lost",
  );
  const wonOpportunities = opportunities.filter((opportunity) => opportunity.stage === "won").length;
  const conversionRate = closedOpportunities.length
    ? Math.round((wonOpportunities / closedOpportunities.length) * 100)
    : 64;

  const lowRiskRatio = clients.length
    ? clients.filter((client) => client.financialRisk === "low").length / clients.length
    : 0.62;
  const completionRatio = dashboard.kpis.todayVisits
    ? dashboard.kpis.completedVisits / dashboard.kpis.todayVisits
    : 0.74;
  const satisfactionScore = Math.round(
    clamp(72 + lowRiskRatio * 16 + completionRatio * 10 + conversionRate * 0.12, 58, 96),
  );
  const satisfactionPositiveShare = clamp(Math.round(satisfactionScore * 0.78), 42, 92);
  const satisfactionNeutralShare = 100 - satisfactionPositiveShare;

  const revenueActual = myTarget?.revenueActual ?? dashboard.kpis.monthlyOrdersAmount;
  const revenueGoal = myTarget?.revenueGoal ?? Math.max(revenueActual * 1.28, dashboard.kpis.pipelineAmount);
  const pipelineCoverage = Math.min(Math.max(revenueGoal - revenueActual, 0), dashboard.kpis.pipelineAmount);
  const revenueGap = Math.max(revenueGoal - revenueActual - pipelineCoverage, 0);
  const goalCompletion = revenueGoal > 0 ? Math.round((revenueActual / revenueGoal) * 100) : 0;
  const visitsProgress = myTarget?.visitsGoal
    ? Math.round((myTarget.visitsActual / myTarget.visitsGoal) * 100)
    : dashboard.kpis.todayVisits > 0
      ? Math.round((dashboard.kpis.completedVisits / dashboard.kpis.todayVisits) * 100)
      : 72;
  const ordersProgress = myTarget?.ordersGoal
    ? Math.round((myTarget.ordersActual / myTarget.ordersGoal) * 100)
    : Math.max(28, Math.round((conversionRate / 100) * 84));

  const yearlyRevenueSeries = buildAnnualRevenueSeries(orders, opportunities, revenueGoal);
  const monthlyRevenueSeries = buildMonthlyRevenueSeries(
    dashboard.kpis.monthlyOrdersAmount,
    dashboard.kpis.completedVisits,
    dashboard.kpis.activeOpportunities,
  );
  const yearlyPipelineSeries = buildAnnualPipelineSeries(opportunities, dashboard.kpis.pipelineAmount);
  const monthlyPipelineSeries = buildMonthlyPipelineSeries(
    dashboard.kpis.pipelineAmount,
    dashboard.kpis.activeOpportunities,
  );

  const chartSeries: TimelinePoint[] =
    chartMode === "revenue"
      ? timeframe === "yearly"
        ? yearlyRevenueSeries
        : monthlyRevenueSeries
      : timeframe === "yearly"
        ? yearlyPipelineSeries
        : monthlyPipelineSeries;

  const chartCurrent = chartSeries[chartSeries.length - 1]?.value ?? 0;
  const chartPrevious = chartSeries[chartSeries.length - 2]?.value ?? chartCurrent;
  const revenueGrowth = growthBetween(chartCurrent, chartPrevious);

  const totalRevenue = timeframe === "yearly" ? sumOrderAmounts(orders) || revenueActual : dashboard.kpis.monthlyOrdersAmount;
  const totalOrders = timeframe === "yearly"
    ? orders.filter((order) => order.status !== "cancelled").length
    : myTarget?.ordersActual ?? dashboard.recentOrders.length;
  const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : totalRevenue;
  const topProduct = [...products].sort((left, right) => left.stock - right.stock)[0];
  const strongestOpportunity =
    [...activeOpportunities].sort((left, right) => right.amount - left.amount)[0] ||
    dashboard.focusOpportunities[0];
  const topPoint = chartSeries.reduce((best, point) => (point.value > best.value ? point : best), chartSeries[0]);

  return (
    <div className="mx-auto flex max-w-[1580px] flex-col gap-5">
      <section className="flex flex-col gap-5 px-1 pt-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="signal-pill w-fit">
            <Sparkles className="h-3.5 w-3.5 text-teal" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary">
              Revenue Intelligence
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="[font-family:var(--font-display)] text-4xl font-bold tracking-[-0.08em] text-on-surface md:text-6xl">
              Sales Command Center
            </h2>
            <p className="max-w-3xl text-sm leading-relaxed text-secondary md:text-base">
              Track growth, forecast revenue and understand customer momentum across your field pipeline.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="signal-pill p-1">
            {(["monthly", "yearly"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTimeframe(item)}
                className={
                  item === timeframe
                    ? "rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(21,52,46,0.16)]"
                    : "rounded-full px-4 py-2 text-sm font-semibold text-secondary transition-colors hover:text-on-surface"
                }
              >
                {item === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>

          <Button variant="outline" size="md" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>

          <Button variant="secondary" size="md" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Advanced filter
          </Button>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-12">
        <article className="bento-card bento-accent xl:col-span-5">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#c9ff87_0%,#b6f36a_44%,#90db52_100%)]" />
          <div className="cutout-orb">
            <ArrowUpRight className="h-5 w-5 text-carbon" />
          </div>
          <div className="relative flex h-full flex-col justify-between gap-10 px-6 py-6 md:px-7 md:py-7">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-carbon/65">
                    Total revenue
                  </p>
                  <h3 className="[font-family:var(--font-display)] mt-3 text-4xl font-bold tracking-[-0.08em] text-carbon md:text-[3.6rem]">
                    {formatCurrency(totalRevenue, company.currency)}
                  </h3>
                </div>
                <Badge variant="default" className="bg-carbon/8 text-carbon">
                  {timeframe === "yearly" ? "Yearly view" : "Monthly view"}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-2 text-sm font-semibold text-carbon shadow-[0_10px_24px_rgba(21,33,28,0.08)]">
                  <ArrowUpRight className="h-4 w-4" />
                  +{revenueGrowth}% vs prior cycle
                </span>
                <span className="text-sm font-medium text-carbon/72">
                  {dashboard.kpis.activeOpportunities} open opportunities feeding the next push
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-carbon/8 bg-white/40 px-4 py-3 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.2em] text-carbon/58">Visible clients</p>
                <p className="mt-2 text-xl font-bold text-carbon">{dashboard.kpis.totalClients}</p>
              </div>
              <div className="rounded-[22px] border border-carbon/8 bg-white/40 px-4 py-3 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.2em] text-carbon/58">Pipeline value</p>
                <p className="mt-2 text-xl font-bold text-carbon">{compactCurrency(dashboard.kpis.pipelineAmount, company.currency)}</p>
              </div>
              <div className="rounded-[22px] border border-carbon/8 bg-white/40 px-4 py-3 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.2em] text-carbon/58">Live alerts</p>
                <p className="mt-2 text-xl font-bold text-carbon">{dashboard.alerts.length}</p>
              </div>
            </div>
          </div>
        </article>

        <article className="bento-card xl:col-span-3">
          <div className="cutout-orb">
            <ArrowUpRight className="h-5 w-5 text-carbon" />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.7)_0%,transparent_40%,rgba(29,106,98,0.06)_100%)]" />
          <div className="relative flex h-full flex-col justify-between gap-10 px-6 py-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-secondary">
                Total orders
              </p>
              <h3 className="[font-family:var(--font-display)] mt-4 text-4xl font-bold tracking-[-0.08em] text-on-surface md:text-[3.1rem]">
                {totalOrders}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                Average ticket at {formatCurrency(averageTicket, company.currency)} with a clean operational pacing.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="success">+{Math.max(6, Math.round(revenueGrowth * 0.72))}% momentum</Badge>
                <span className="text-sm text-secondary">than last period</span>
              </div>

              <div className="rounded-[24px] border border-outline-variant/80 bg-white/72 px-4 py-4">
                <div className="flex items-center justify-between text-xs text-secondary">
                  <span>Pending approvals</span>
                  <span>{dashboard.kpis.pendingApprovals}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#1d6a62_0%,#59b8b0_100%)]"
                    style={{ width: `${clamp((dashboard.kpis.pendingApprovals / Math.max(totalOrders, 1)) * 100, 10, 84)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="bento-card xl:col-span-4">
          <div className="cutout-orb">
            <Target className="h-5 w-5 text-carbon" />
          </div>
          <div className="relative flex h-full flex-col gap-6 px-6 py-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-secondary">
                Sales target
              </p>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="[font-family:var(--font-display)] text-4xl font-bold tracking-[-0.08em] text-on-surface">
                    {formatCurrency(revenueGoal, company.currency)}
                  </h3>
                  <p className="mt-2 text-sm text-secondary">{goalCompletion}% de l'objectif deja securise</p>
                </div>
                <Badge variant="success">Gap {formatCurrency(revenueGap, company.currency)}</Badge>
              </div>
            </div>

            <div className="space-y-4">
              <div className="h-5 overflow-hidden rounded-full bg-surface-container">
                <div className="flex h-full w-full gap-1 p-1">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#1d6a62_0%,#59b8b0_100%)]"
                    style={{ width: `${clamp((revenueActual / revenueGoal) * 100, 10, 100)}%` }}
                  />
                  <div
                    className="chart-stripes h-full rounded-full bg-primary"
                    style={{
                      width: `${clamp((pipelineCoverage / revenueGoal) * 100, 4, 100)}%`,
                    }}
                  />
                  <div
                    className="h-full rounded-full bg-lime-soft"
                    style={{ width: `${clamp((revenueGap / revenueGoal) * 100, 3, 100)}%` }}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[22px] bg-surface-container-low px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-secondary">Revenue</p>
                  <p className="mt-2 text-lg font-bold text-on-surface">{goalCompletion}%</p>
                </div>
                <div className="rounded-[22px] bg-surface-container-low px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-secondary">Visits</p>
                  <p className="mt-2 text-lg font-bold text-on-surface">{clamp(visitsProgress, 0, 160)}%</p>
                </div>
                <div className="rounded-[22px] bg-surface-container-low px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-secondary">Orders</p>
                  <p className="mt-2 text-lg font-bold text-on-surface">{clamp(ordersProgress, 0, 160)}%</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-secondary">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal" />
                  Secured revenue
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  Pipeline cover
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-lime-soft" />
                  Remaining target
                </span>
              </div>
            </div>
          </div>
        </article>

        <article className="bento-card xl:col-span-3">
          <div className="cutout-orb">
            <CircleAlert className="h-5 w-5 text-carbon" />
          </div>
          <div className="relative flex h-full flex-col gap-5 px-6 py-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-secondary">
                Customer satisfaction
              </p>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-secondary">
                Signal built from visit completion, account quality and close consistency.
              </p>
            </div>

            <div className="relative mx-auto h-52 w-52">
              {Array.from({ length: 14 }).map((_, index) => {
                const activeSegments = Math.round((satisfactionScore / 100) * 14);
                const angle = -110 + index * 17;
                const isActive = index < activeSegments;

                return (
                  <span
                    key={index}
                    className={isActive ? "absolute h-14 w-3 rounded-full bg-teal shadow-[0_10px_24px_rgba(29,106,98,0.16)]" : "absolute h-14 w-3 rounded-full bg-surface-container-high"}
                    style={{
                      left: "50%",
                      top: "54%",
                      transform: `translateX(-50%) rotate(${angle}deg) translateY(-78px)`,
                      background: isActive
                        ? index > activeSegments - 3
                          ? "linear-gradient(180deg, #8cf0d9 0%, #59b8b0 100%)"
                          : "linear-gradient(180deg, #1d6a62 0%, #59b8b0 100%)"
                        : undefined,
                    }}
                  />
                );
              })}

              <div className="absolute inset-x-0 bottom-2 text-center">
                <p className="[font-family:var(--font-display)] text-5xl font-bold tracking-[-0.08em] text-on-surface">
                  {satisfactionScore}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.24em] text-secondary">CSAT signal</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <span className="inline-flex items-center gap-2 text-secondary">
                <span className="h-2.5 w-2.5 rounded-full bg-teal" />
                Positive {satisfactionPositiveShare}%
              </span>
              <span className="inline-flex items-center gap-2 text-secondary">
                <span className="h-2.5 w-2.5 rounded-full bg-surface-container-highest" />
                Neutral {satisfactionNeutralShare}%
              </span>
            </div>

            <div className="rounded-[24px] border border-outline-variant/80 bg-surface-container-low px-4 py-4">
              <div className="flex items-center gap-3">
                <Badge variant="success">+{Math.max(4, Math.round(completionRatio * 9))} pts</Badge>
                <p className="text-sm font-medium text-on-surface">{satisfactionNarrative(satisfactionScore)}</p>
              </div>
            </div>
          </div>
        </article>

        <article className="bento-card xl:col-span-6">
          <div className="absolute right-[-8%] top-[-12%] h-44 w-44 rounded-full bg-primary/16 blur-3xl" />
          <div className="relative flex h-full flex-col gap-6 px-6 py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-secondary">
                  Statistics
                </p>
                <h3 className="[font-family:var(--font-display)] mt-2 text-3xl font-bold tracking-[-0.08em] text-on-surface">
                  Annual performance matrix
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChartMode("revenue")}
                  className={
                    chartMode === "revenue"
                      ? "signal-pill bg-ink px-4 py-2 text-sm font-semibold text-white"
                      : "signal-pill px-4 py-2 text-sm font-semibold text-secondary"
                  }
                >
                  Revenue
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("pipeline")}
                  className={
                    chartMode === "pipeline"
                      ? "signal-pill bg-ink px-4 py-2 text-sm font-semibold text-white"
                      : "signal-pill px-4 py-2 text-sm font-semibold text-secondary"
                  }
                >
                  Pipeline
                </button>
                <span className="signal-pill text-sm font-semibold text-on-surface">
                  {timeframe === "yearly" ? "Yearly" : "Monthly"}
                  <ChevronDown className="h-4 w-4 text-secondary" />
                </span>
              </div>
            </div>

            <div className="grid flex-1 gap-4 lg:grid-cols-[88px_minmax(0,1fr)]">
              <div className="hidden flex-col justify-between pb-8 pt-4 text-xs text-secondary lg:flex">
                {[100, 75, 50, 25, 0].map((step) => (
                  <span key={step}>{compactCurrency((topPoint?.value || 0) * (step / 100), company.currency)}</span>
                ))}
              </div>

              <div className="relative grid min-h-[320px] grid-cols-4 items-end gap-3 rounded-[28px] border border-outline-variant/70 bg-white/55 px-4 pb-5 pt-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] sm:grid-cols-6 lg:grid-cols-12">
                <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.24)_0%,transparent_44%)]" />
                {[0, 1, 2, 3].map((line) => (
                  <span
                    key={line}
                    className="pointer-events-none absolute left-4 right-4 border-t border-dashed border-outline-variant/70"
                    style={{ top: `${22 + line * 22}%` }}
                  />
                ))}

                {chartSeries.map((point, index) => {
                  const height = topPoint?.value ? Math.max(14, (point.value / topPoint.value) * 100) : 14;
                  const isActive = activePoint === index;

                  return (
                    <div
                      key={point.label}
                      className="relative flex h-full flex-col justify-end"
                      onMouseEnter={() => setActivePoint(index)}
                      onMouseLeave={() => setActivePoint(null)}
                    >
                      {isActive ? (
                        <div className="pointer-events-none absolute -top-2 left-1/2 z-20 w-36 -translate-x-1/2 rounded-[20px] border border-outline-variant/70 bg-white px-4 py-3 shadow-[0_20px_48px_rgba(21,33,28,0.12)]">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-secondary">{point.label}</p>
                          <p className="mt-1 text-lg font-bold text-on-surface">
                            {compactCurrency(point.value, company.currency)}
                          </p>
                          <p className="mt-1 text-[11px] text-secondary">{point.detail}</p>
                        </div>
                      ) : null}

                      <div
                        className={
                          chartMode === "revenue"
                            ? "chart-stripes relative rounded-[18px_18px_10px_10px] bg-[linear-gradient(180deg,#b6f36a_0%,#93e354_100%)] shadow-[0_18px_34px_rgba(182,243,106,0.26)]"
                            : "chart-stripes relative rounded-[18px_18px_10px_10px] bg-[linear-gradient(180deg,#1d6a62_0%,#59b8b0_100%)] shadow-[0_18px_34px_rgba(29,106,98,0.22)]"
                        }
                        style={{ height: `${height}%` }}
                      >
                        {isActive ? (
                          <span className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-teal shadow-[0_8px_18px_rgba(21,33,28,0.14)]" />
                        ) : null}
                      </div>

                      <span className="mt-3 text-center text-xs font-medium text-secondary">{point.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </article>

        <article className="bento-card overflow-hidden bg-[linear-gradient(180deg,#17342e_0%,#102923_100%)] text-white xl:col-span-3">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(182,243,106,0.18),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06)_0%,transparent_42%)]" />
          <div className="relative flex h-full flex-col gap-6 px-6 py-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/58">
                Conversion rate
              </p>
              <h3 className="[font-family:var(--font-display)] mt-3 text-5xl font-bold tracking-[-0.08em] text-white">
                {conversionRate}%
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/72">
                Closed-won momentum across the active funnel.
              </p>
            </div>

            <div className="flex items-end gap-2">
              {[0.36, 0.52, 0.48, 0.74, 0.62, 0.88].map((value, index) => (
                <div
                  key={index}
                  className="chart-stripes w-full rounded-t-full bg-[linear-gradient(180deg,#d8ffaf_0%,#8be455_100%)]"
                  style={{ height: `${52 + value * 68}px` }}
                />
              ))}
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/6 px-4 py-4 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/52">Top opportunity</p>
              <p className="mt-2 text-base font-semibold text-white">
                {strongestOpportunity?.clientName || "No active deal selected"}
              </p>
              <div className="mt-3 flex items-center justify-between text-sm text-white/72">
                <span>{strongestOpportunity ? formatCurrency(strongestOpportunity.amount, company.currency) : "N/A"}</span>
                <span>{strongestOpportunity ? `${strongestOpportunity.probability}% confidence` : "-"}</span>
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between">
              <Link to="/pipeline" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                Open pipeline
                <MoveRight className="h-4 w-4" />
              </Link>
              <Badge variant="success" className="bg-primary/18 text-white">
                {wonOpportunities} won deals
              </Badge>
            </div>
          </div>
        </article>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-3 text-sm text-secondary">
          <span className="signal-pill">
            <TrendingUp className="h-4 w-4 text-teal" />
            Forecast peak: {topPoint ? `${topPoint.label} at ${compactCurrency(topPoint.value, company.currency)}` : "N/A"}
          </span>
          {topProduct ? (
            <span className="signal-pill">
              <Users className="h-4 w-4 text-teal" />
              Conversion watch: {topProduct.name} low stock at {topProduct.stock} units
            </span>
          ) : null}
        </div>

        <Button variant="outline" onClick={loadDashboard}>
          Refresh dashboard
        </Button>
      </div>
    </div>
  );
}
