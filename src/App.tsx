import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { WorkspaceProvider, useWorkspace } from "./context/WorkspaceContext";
import { ToastProvider } from "./components/Toast";
import { DialogProvider } from "./components/Dialog";
import { PermissionGuard } from "./components/PermissionGuard";
import { Logo } from "./components/Logo";
import type { PermissionKey } from "./types";

// Defence in depth: the sidebar already hides forbidden links, but a direct URL
// must also be blocked with a clean "access denied" screen (not an API error).
const guard = (permission: PermissionKey, element: ReactNode): ReactNode => (
  <PermissionGuard permission={permission}>{element}</PermissionGuard>
);

const namedPage = <T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
) => lazy(async () => ({ default: (await loader())[name] as ComponentType }));

const LoginView = namedPage(() => import("./pages/LoginView"), "LoginView");
const ResetPasswordView = namedPage(() => import("./pages/ResetPasswordView"), "ResetPasswordView");
const DashboardView = namedPage(() => import("./pages/DashboardView"), "DashboardView");
const ClientsView = namedPage(() => import("./pages/ClientsView"), "ClientsView");
const VisitsView = namedPage(() => import("./pages/VisitsView"), "VisitsView");
const VisitReportView = namedPage(() => import("./pages/VisitReportView"), "VisitReportView");
const OrdersView = namedPage(() => import("./pages/OrdersView"), "OrdersView");
const ProductsView = namedPage(() => import("./pages/ProductsView"), "ProductsView");
const PipelineView = namedPage(() => import("./pages/PipelineView"), "PipelineView");
const TargetsView = namedPage(() => import("./pages/TargetsView"), "TargetsView");
const RoutesView = namedPage(() => import("./pages/RoutesView"), "RoutesView");
const AIAssistantView = namedPage(() => import("./pages/AIAssistantView"), "AIAssistantView");
const SettingsView = namedPage(() => import("./pages/SettingsView"), "SettingsView");
const RolesView = namedPage(() => import("./pages/RolesView"), "RolesView");
const AuditView = namedPage(() => import("./pages/AuditView"), "AuditView");
const IntegrationsView = namedPage(() => import("./pages/IntegrationsView"), "IntegrationsView");
const FAQView = namedPage(() => import("./pages/FAQView"), "FAQView");
const CallsView = namedPage(() => import("./pages/ModuleView"), "CallsView");
const CampaignsView = namedPage(() => import("./pages/ModuleView"), "CampaignsView");
const CasesView = namedPage(() => import("./pages/ModuleView"), "CasesView");
const ContractsView = namedPage(() => import("./pages/ModuleView"), "ContractsView");
const ActivitiesView = namedPage(() => import("./pages/ActivitiesView"), "ActivitiesView");
const ProspectsView = namedPage(() => import("./pages/ProspectsView"), "ProspectsView");
const ReportsView = namedPage(() => import("./pages/ReportsView"), "ReportsView");
const DocumentsView = namedPage(() => import("./pages/DocumentsView"), "DocumentsView");
const NotificationsView = namedPage(() => import("./pages/NotificationsView"), "NotificationsView");
const AgendaView = namedPage(() => import("./pages/AgendaView"), "AgendaView");
const TeamView = namedPage(() => import("./pages/TeamView"), "TeamView");
const WhatsAppView = namedPage(() => import("./pages/WhatsAppView"), "WhatsAppView");
const ClientDetailView = namedPage(() => import("./pages/ClientDetailView"), "ClientDetailView");
const ProspectDetailView = namedPage(() => import("./pages/ProspectDetailView"), "ProspectDetailView");
const QuotesView = namedPage(() => import("./pages/QuotesView"), "QuotesView");
const QuoteDetailView = namedPage(() => import("./pages/QuoteDetailView"), "QuoteDetailView");
const QuoteSignatureView = namedPage(() => import("./pages/QuoteSignatureView"), "QuoteSignatureView");
const BillingView = namedPage(() => import("./pages/BillingView"), "BillingView");
const PricingView = namedPage(() => import("./pages/PricingView"), "PricingView");
const ApprovalsView = namedPage(() => import("./pages/ApprovalsView"), "ApprovalsView");

function AppRoutes() {
  const { isBooting, isAuthenticated, company } = useWorkspace();

  if (isBooting) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-8 shadow-sm text-center max-w-md animate-[fadeInUp_220ms_ease_both]">
          <Logo className="mx-auto mb-4 h-20 w-[280px]" />
          <div className="mx-auto mb-3 inline-flex h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
          <p className="text-sm text-secondary">
            Chargement de la session, des permissions et du workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-secondary">
          Chargement du module...
        </div>
      }
    >
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginView />}
      />
      <Route path="/reset-password" element={<ResetPasswordView />} />
      <Route path="/quotes/:id/sign/:token" element={<QuoteSignatureView />} />
      <Route path="/pricing" element={<PricingView />} />

      <Route
        element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={guard("dashboard.read", <DashboardView />)} />
        <Route path="/agenda" element={guard("visits.read", <AgendaView />)} />
        <Route path="/notifications" element={guard("notifications.read", <NotificationsView />)} />
        <Route path="/prospects" element={guard("clients.read", <ProspectsView />)} />
        <Route path="/prospects/:id" element={guard("clients.read", <ProspectDetailView />)} />
        <Route path="/clients" element={guard("clients.read", <ClientsView />)} />
        <Route path="/clients/:id" element={guard("clients.read", <ClientDetailView />)} />
        <Route path="/quotes" element={guard("orders.read", <QuotesView />)} />
        <Route path="/quotes/:id" element={guard("orders.read", <QuoteDetailView />)} />
        <Route path="/activities" element={guard("visits.read", <ActivitiesView />)} />
        <Route path="/visits" element={guard("visits.read", <VisitsView />)} />
        <Route path="/visits/:id" element={guard("visits.read", <VisitReportView />)} />
        <Route path="/contracts" element={<ContractsView />} />
        <Route path="/orders" element={guard("orders.read", <OrdersView />)} />
        <Route path="/products" element={guard("products.read", <ProductsView />)} />
        <Route path="/campaigns" element={<CampaignsView />} />
        <Route path="/pipeline" element={guard("opportunities.read", <PipelineView />)} />
        <Route path="/targets" element={guard("targets.read", <TargetsView />)} />
        <Route path="/reports" element={guard("insights.read", <ReportsView />)} />
        <Route path="/team" element={guard("insights.read", <TeamView />)} />
        <Route path="/approvals" element={guard("approvals.write", <ApprovalsView />)} />
        <Route path="/insights" element={<Navigate to="/reports" replace />} />
        <Route path="/routes" element={guard("routes.read", <RoutesView />)} />
        <Route path="/calls" element={<CallsView />} />
        <Route path="/cases" element={<CasesView />} />
        <Route path="/documents" element={guard("clients.read", <DocumentsView />)} />
        <Route path="/whatsapp" element={guard("clients.read", <WhatsAppView />)} />
        <Route path="/assistant" element={guard("assistant.read", <AIAssistantView />)} />
        <Route path="/settings" element={guard("settings.read", <SettingsView />)} />
        <Route path="/billing" element={guard("settings.read", <BillingView />)} />
        <Route path="/roles" element={guard("roles.read", <RolesView />)} />
        <Route path="/audit" element={guard("audit.read", <AuditView />)} />
        <Route path="/integrations" element={guard("integrations.read", <IntegrationsView />)} />
        <Route path="/faq" element={<FAQView />} />
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />}
      />
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <DialogProvider>
          <WorkspaceProvider>
            <AppRoutes />
          </WorkspaceProvider>
        </DialogProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
