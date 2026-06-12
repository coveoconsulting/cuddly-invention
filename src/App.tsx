import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { WorkspaceProvider, useWorkspace } from "./context/WorkspaceContext";
import { LoginView } from "./pages/LoginView";
import { DashboardView } from "./pages/DashboardView";
import { ClientsView } from "./pages/ClientsView";
import { VisitsView } from "./pages/VisitsView";
import { VisitReportView } from "./pages/VisitReportView";
import { OrdersView } from "./pages/OrdersView";
import { ProductsView } from "./pages/ProductsView";
import { PipelineView } from "./pages/PipelineView";
import { TargetsView } from "./pages/TargetsView";
import { InsightsView } from "./pages/InsightsView";
import { RoutesView } from "./pages/RoutesView";
import { AIAssistantView } from "./pages/AIAssistantView";
import { SettingsView } from "./pages/SettingsView";
import { RolesView } from "./pages/RolesView";
import { IntegrationsView } from "./pages/IntegrationsView";
import { FAQView } from "./pages/FAQView";

function AppRoutes() {
  const { isBooting, isAuthenticated } = useWorkspace();

  if (isBooting) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-8 shadow-sm text-center max-w-md">
          <div className="w-10 h-10 mx-auto mb-4 rounded-xl bg-primary text-on-primary flex items-center justify-center font-black">
            C
          </div>
          <h1 className="text-xl font-bold text-on-surface mb-2">Clerivo MVP</h1>
          <p className="text-sm text-secondary">
            Chargement de la session, des permissions et de la base locale.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginView />}
      />

      <Route
        element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardView />} />
        <Route path="/clients" element={<ClientsView />} />
        <Route path="/visits" element={<VisitsView />} />
        <Route path="/visits/:id" element={<VisitReportView />} />
        <Route path="/orders" element={<OrdersView />} />
        <Route path="/products" element={<ProductsView />} />
        <Route path="/pipeline" element={<PipelineView />} />
        <Route path="/targets" element={<TargetsView />} />
        <Route path="/insights" element={<InsightsView />} />
        <Route path="/routes" element={<RoutesView />} />
        <Route path="/assistant" element={<AIAssistantView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="/roles" element={<RolesView />} />
        <Route path="/integrations" element={<IntegrationsView />} />
        <Route path="/faq" element={<FAQView />} />
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <WorkspaceProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </WorkspaceProvider>
  );
}
