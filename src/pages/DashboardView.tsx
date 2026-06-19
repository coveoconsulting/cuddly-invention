import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  CircleGauge,
  Clock3,
  RefreshCcw,
  ShoppingCart,
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
  PipelineStage,
} from "../types";
import { asArray, getJson } from "../lib/api";
import {
  formatCurrency,
  formatDate,
  orderStatusLabel,
  pipelineStageLabel,
} from "../lib/labels";
import { Badge, Button } from "../components/ui";
import { EmptyState } from "../components/EmptyState";
import { useWorkspace } from "../context/WorkspaceContext";

const stageOrder: PipelineStage[] = ["qualification", "proposal", "negotiation", "won", "lost"];

function emptyDashboard(company: NonNullable<ReturnType<typeof useWorkspace>["company"]>, currentUser: NonNullable<ReturnType<typeof useWorkspace>["currentUser"]>): DashboardSnapshot {
  return {
    company,
    me: currentUser,
    kpis: {
      totalClients: 0,
      activeOpportunities: 0,
      pipelineAmount: 0,
      monthlyOrdersAmount: 0,
      todayVisits: 0,
      completedVisits: 0,
      pendingApprovals: 0,
      unreadNotifications: 0,
    },
    todayVisits: [],
    recentOrders: [],
    focusOpportunities: [],
    lowStockProducts: [],
    alerts: [],
  };
}

function isDashboardSnapshot(payload: unknown): payload is DashboardSnapshot {
  return Boolean(payload) && typeof payload === "object" && "kpis" in payload;
}

function percentage(actual: number, goal: number) {
  if (goal <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((actual / goal) * 100)));
}

function sumOrders(orders: Order[]) {
  return orders
    .filter((order) => order.status !== "cancelled")
    .reduce((total, order) => total + order.amount, 0);
}

function sumPipeline(opportunities: Opportunity[]) {
  return opportunities
    .filter((item) => item.stage !== "won" && item.stage !== "lost")
    .reduce((total, item) => total + item.amount, 0);
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

  const loadDashboard = async () => {
    if (!company || !currentUser) {
      return;
    }
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
        getJson<unknown>("/api/v1/dashboard"),
        getJson<unknown>("/api/v1/orders"),
        getJson<unknown>("/api/v1/opportunities"),
        getJson<unknown>("/api/v1/targets"),
        getJson<unknown>("/api/v1/clients"),
        getJson<unknown>("/api/v1/products"),
      ]);

      setDashboard(isDashboardSnapshot(dashboardPayload) ? dashboardPayload : emptyDashboard(company, currentUser));
      setOrders(asArray<Order>(ordersPayload));
      setOpportunities(asArray<Opportunity>(opportunitiesPayload));
      setTargets(asArray<TargetProgress>(targetsPayload));
      setClients(asArray<Client>(clientsPayload));
      setProducts(asArray<Product>(productsPayload));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [company?.id, currentUser?.id]);

  const myTarget = useMemo(
    () => targets.find((target) => target.ownerUserId === currentUser?.id) || null,
    [currentUser?.id, targets],
  );

  const pendingApprovals = useMemo(
    () => orders.filter((order) => order.approvalStatus === "pending"),
    [orders],
  );

  const stageStats = useMemo(
    () =>
      stageOrder.map((stage) => {
        const items = opportunities.filter((item) => item.stage === stage);
        return {
          stage,
          count: items.length,
          amount: items.reduce((total, item) => total + item.amount, 0),
        };
      }),
    [opportunities],
  );

  if (!company || !currentUser) {
    return null;
  }

  if (isLoading || !dashboard) {
    return (
      <div className="bento-card mx-auto max-w-[1560px] p-10 text-center text-secondary">
        Chargement du tableau de bord...
      </div>
    );
  }

  const hasOperationalData =
    clients.length > 0 ||
    opportunities.length > 0 ||
    orders.length > 0 ||
    dashboard.todayVisits.length > 0 ||
    products.length > 0;

  const revenueTotal = sumOrders(orders);
  const pipelineTotal = sumPipeline(opportunities);
  const lowStockProducts = dashboard.lowStockProducts;

  const heroSection = (
    <section className="flex flex-col gap-4 px-1 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        <div className="signal-pill w-fit">
          <CircleGauge className="h-3.5 w-3.5 text-teal" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary">
            {company.vertical}
          </span>
        </div>
        <h2 className="[font-family:var(--font-display)] text-3xl font-bold tracking-[-0.06em] text-on-surface md:text-4xl">
          Tableau de bord terrain
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-secondary">
          Vue consolidée des comptes, des visites, du pipeline, des commandes et du stock.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" className="gap-2" onClick={() => void loadDashboard()}>
          <RefreshCcw className="h-4 w-4" />
          Actualiser
        </Button>
      </div>
    </section>
  );

  if (!hasOperationalData) {
    return (
      <div className="mx-auto flex max-w-[1580px] flex-col gap-5">
        {heroSection}
        <EmptyState
          title="Bienvenue sur votre workspace"
          description="Aucune donnée métier n'est encore enregistrée. Commencez par créer un compte client, planifier une visite ou ouvrir une opportunité — les KPI, alertes et listes de cette page s'alimenteront automatiquement."
          className="bento-card py-12"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link to="/clients" className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm">
                Créer un compte
              </Link>
              <Link to="/visits" className="rounded-full border border-outline-variant bg-white px-5 py-2.5 text-sm font-semibold text-on-surface">
                Planifier une visite
              </Link>
              <Link to="/pipeline" className="rounded-full border border-outline-variant bg-white px-5 py-2.5 text-sm font-semibold text-on-surface">
                Ouvrir une opportunité
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1580px] flex-col gap-5">
      {heroSection}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <article className="bento-card px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Comptes visibles</p>
              <p className="mt-3 text-4xl font-black text-on-surface">{dashboard.kpis.totalClients}</p>
            </div>
            <div className="cutout-orb static h-12 w-12 shadow-none">
              <Users className="h-5 w-5 text-carbon" />
            </div>
          </div>
          <p className="mt-4 text-sm text-secondary">
            {clients.length > 0
              ? `${clients.filter((item) => item.status === "active").length} comptes actifs`
              : "Aucun compte chargé"}
          </p>
        </article>

        <article className="bento-card px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Visites du jour</p>
              <p className="mt-3 text-4xl font-black text-on-surface">{dashboard.kpis.todayVisits}</p>
            </div>
            <div className="cutout-orb static h-12 w-12 shadow-none">
              <CalendarDays className="h-5 w-5 text-carbon" />
            </div>
          </div>
          <p className="mt-4 text-sm text-secondary">
            {dashboard.kpis.completedVisits} terminée(s),{" "}
            {Math.max(dashboard.kpis.todayVisits - dashboard.kpis.completedVisits, 0)} restante(s)
          </p>
        </article>

        <article className="bento-card px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Pipeline actif</p>
              <p className="mt-3 text-4xl font-black text-on-surface">
                {formatCurrency(pipelineTotal, company.currency)}
              </p>
            </div>
            <div className="cutout-orb static h-12 w-12 shadow-none">
              <TrendingUp className="h-5 w-5 text-carbon" />
            </div>
          </div>
          <p className="mt-4 text-sm text-secondary">
            {dashboard.kpis.activeOpportunities} opportunité(s) ouverte(s)
          </p>
        </article>

        <article className="bento-card px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Commandes</p>
              <p className="mt-3 text-4xl font-black text-on-surface">
                {formatCurrency(revenueTotal, company.currency)}
              </p>
            </div>
            <div className="cutout-orb static h-12 w-12 shadow-none">
              <ShoppingCart className="h-5 w-5 text-carbon" />
            </div>
          </div>
          <p className="mt-4 text-sm text-secondary">
            {pendingApprovals.length} validation(s) en attente
          </p>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-12">
        <article className="bento-card xl:col-span-4">
          <div className="relative flex h-full flex-col gap-5 px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Priorités</p>
                <h3 className="mt-2 text-2xl font-bold text-on-surface">Alertes opérationnelles</h3>
              </div>
              <AlertTriangle className="h-5 w-5 text-carbon" />
            </div>

            {dashboard.alerts.length === 0 ? (
              <EmptyState
                title="Aucune alerte active"
                description="Les validations, retards et ruptures remontent ici dès qu'une donnée métier le justifie."
              />
            ) : (
              <div className="space-y-3">
                {dashboard.alerts.map((alert) => (
                  <Link
                    key={alert.id}
                    to={alert.link || "/dashboard"}
                    className="block rounded-[24px] border border-outline-variant/80 bg-surface-container-low px-4 py-4 transition-colors hover:bg-surface"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-on-surface">{alert.title}</p>
                      <Badge
                        variant={
                          alert.level === "critical"
                            ? "error"
                            : alert.level === "warning"
                              ? "warning"
                              : "default"
                        }
                      >
                        {alert.level}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-secondary">{alert.description}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </article>

        <article className="bento-card xl:col-span-4">
          <div className="relative flex h-full flex-col gap-5 px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Visites</p>
                <h3 className="mt-2 text-2xl font-bold text-on-surface">Plan de tournée</h3>
              </div>
              <Clock3 className="h-5 w-5 text-carbon" />
            </div>

            {dashboard.todayVisits.length === 0 ? (
              <EmptyState
                title="Aucune visite planifiée aujourd'hui"
                description="Les prochains rendez-vous terrain apparaîtront ici avec leur créneau et leur objectif."
              />
            ) : (
              <div className="space-y-3">
                {dashboard.todayVisits.map((visit) => (
                  <Link
                    key={visit.id}
                    to={`/visits/${visit.id}`}
                    className="block rounded-[24px] border border-outline-variant/80 bg-surface-container-low px-4 py-4 transition-colors hover:bg-surface"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-on-surface">{visit.clientName}</p>
                      <Badge
                        variant={
                          visit.status === "completed"
                            ? "success"
                            : visit.status === "in_progress"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {visit.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-secondary">{visit.objective}</p>
                    <p className="mt-3 text-xs text-secondary">
                      {visit.startTime} - {visit.endTime} | {visit.city}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </article>

        <article className="bento-card xl:col-span-4">
          <div className="relative flex h-full flex-col gap-5 px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Objectifs</p>
                <h3 className="mt-2 text-2xl font-bold text-on-surface">Suivi personnel</h3>
              </div>
              <Target className="h-5 w-5 text-carbon" />
            </div>

            {!myTarget ? (
              <EmptyState
                title="Aucun objectif défini"
                description="Définissez un objectif commercial, de visites ou de commandes pour suivre l'avancement."
              />
            ) : (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-outline-variant/80 bg-surface-container-low px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-on-surface">{myTarget.periodLabel}</p>
                    <Badge variant="neutral">{myTarget.ownerName}</Badge>
                  </div>
                  <div className="mt-4 space-y-4">
                    {[
                      {
                        label: "Chiffre d'affaires",
                        actual: myTarget.revenueActual,
                        goal: myTarget.revenueGoal,
                        value: formatCurrency(myTarget.revenueActual, company.currency),
                        goalLabel: formatCurrency(myTarget.revenueGoal, company.currency),
                      },
                      {
                        label: "Visites",
                        actual: myTarget.visitsActual,
                        goal: myTarget.visitsGoal,
                        value: `${myTarget.visitsActual}`,
                        goalLabel: `${myTarget.visitsGoal}`,
                      },
                      {
                        label: "Opportunités",
                        actual: myTarget.opportunitiesActual,
                        goal: myTarget.opportunitiesGoal,
                        value: `${myTarget.opportunitiesActual}`,
                        goalLabel: `${myTarget.opportunitiesGoal}`,
                      },
                      {
                        label: "Commandes",
                        actual: myTarget.ordersActual,
                        goal: myTarget.ordersGoal,
                        value: `${myTarget.ordersActual}`,
                        goalLabel: `${myTarget.ordersGoal}`,
                      },
                    ].map((metric) => (
                      <div key={metric.label}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-on-surface">{metric.label}</span>
                          <span className="text-secondary">
                            {metric.value} / {metric.goalLabel}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#1d6a62_0%,#59b8b0_100%)]"
                            style={{ width: `${percentage(metric.actual, metric.goal)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </article>

        <article className="bento-card xl:col-span-5">
          <div className="relative flex h-full flex-col gap-5 px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Pipeline</p>
                <h3 className="mt-2 text-2xl font-bold text-on-surface">Répartition des opportunités</h3>
              </div>
              <TrendingUp className="h-5 w-5 text-carbon" />
            </div>

            {opportunities.length === 0 ? (
              <EmptyState
                title="Aucune opportunité enregistrée"
                description="Le pipeline affichera ici les volumes, montants et étapes réellement saisies."
              />
            ) : (
              <div className="space-y-3">
                {stageStats.map((item) => (
                  <div
                    key={item.stage}
                    className="rounded-[24px] border border-outline-variant/80 bg-surface-container-low px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-on-surface">
                        {pipelineStageLabel[item.stage]}
                      </p>
                      <Badge variant="neutral">{item.count}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-secondary">
                      {formatCurrency(item.amount, company.currency)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>

        <article className="bento-card xl:col-span-4">
          <div className="relative flex h-full flex-col gap-5 px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Commandes</p>
                <h3 className="mt-2 text-2xl font-bold text-on-surface">Flux récent</h3>
              </div>
              <ShoppingCart className="h-5 w-5 text-carbon" />
            </div>

            {dashboard.recentOrders.length === 0 ? (
              <EmptyState
                title="Aucune commande récente"
                description="Les commandes confirmées, en attente ou en brouillon remonteront ici."
              />
            ) : (
              <div className="space-y-3">
                {dashboard.recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-[24px] border border-outline-variant/80 bg-surface-container-low px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-on-surface">{order.clientName}</p>
                      <Badge variant={order.approvalStatus === "pending" ? "warning" : "neutral"}>
                        {orderStatusLabel[order.status]}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-secondary">{order.id}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="text-on-surface">
                        {formatCurrency(order.amount, company.currency)}
                      </span>
                      <span className="text-secondary">{formatDate(order.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>

        <article className="bento-card xl:col-span-3">
          <div className="relative flex h-full flex-col gap-5 px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Catalogue</p>
                <h3 className="mt-2 text-2xl font-bold text-on-surface">Stock à surveiller</h3>
              </div>
              <Boxes className="h-5 w-5 text-carbon" />
            </div>

            {lowStockProducts.length === 0 ? (
              <EmptyState
                title="Aucune alerte stock"
                description="Les produits faibles ou en rupture apparaîtront ici automatiquement."
              />
            ) : (
              <div className="space-y-3">
                {lowStockProducts.map((product) => (
                  <div
                    key={product.id}
                    className="rounded-[24px] border border-outline-variant/80 bg-surface-container-low px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-on-surface">{product.name}</p>
                      <Badge variant={product.stock === 0 ? "error" : "warning"}>{product.stock}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-secondary">
                      {product.ref} | {product.category}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
