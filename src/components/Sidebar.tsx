import { NavLink } from "react-router-dom";
import {
  Bot,
  Boxes,
  ChartColumnIncreasing,
  CircleHelp,
  Map,
  MapPin,
  Shield,
  ShoppingCart,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useWorkspace } from "../context/WorkspaceContext";

const navSections = [
  {
    title: "Pilotage",
    items: [
      { icon: ChartColumnIncreasing, label: "Dashboard", path: "/dashboard", permission: "dashboard.read" as const },
      { icon: TrendingUp, label: "Pipeline", path: "/pipeline", permission: "opportunities.read" as const },
      { icon: Users, label: "Clients", path: "/clients", permission: "clients.read" as const },
      { icon: MapPin, label: "Visites", path: "/visits", permission: "visits.read" as const },
      { icon: ShoppingCart, label: "Commandes", path: "/orders", permission: "orders.read" as const },
      { icon: Boxes, label: "Produits", path: "/products", permission: "products.read" as const },
    ],
  },
  {
    title: "Execution",
    items: [
      { icon: Target, label: "Objectifs", path: "/targets", permission: "targets.read" as const },
      { icon: Workflow, label: "Manager Insight", path: "/insights", permission: "insights.read" as const },
      { icon: Map, label: "Tournees", path: "/routes", permission: "routes.read" as const },
      { icon: Bot, label: "Assistant IA", path: "/assistant", permission: "assistant.read" as const },
    ],
  },
  {
    title: "Administration",
    items: [
      { icon: SlidersHorizontal, label: "Parametres", path: "/settings", permission: "settings.read" as const },
      { icon: Shield, label: "Roles", path: "/roles", permission: "roles.read" as const },
      { icon: Workflow, label: "Integrations", path: "/integrations", permission: "integrations.read" as const },
      { icon: CircleHelp, label: "FAQ", path: "/faq", permission: "dashboard.read" as const },
    ],
  },
];

export function Sidebar() {
  const { can, currentUser } = useWorkspace();

  return (
    <aside className="hidden md:flex w-[260px] shrink-0 border-r border-outline-variant bg-[#f0f4ef] text-on-surface">
      <div className="flex flex-col h-full w-full">
        <div className="px-5 py-6 border-b border-outline-variant">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary text-on-primary flex items-center justify-center font-black shadow-sm">
              C
            </div>
            <div>
              <p className="text-lg font-black tracking-tight">Clerivo</p>
              <p className="text-xs text-secondary">MVP authentifie et persistant</p>
            </div>
          </div>
          {currentUser ? (
            <div className="mt-4 rounded-2xl border border-outline-variant bg-white/70 px-4 py-3">
              <p className="text-xs text-secondary uppercase tracking-wider">Session</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{currentUser.name}</p>
              <p className="text-xs text-secondary">{currentUser.roleLabel}</p>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          {navSections.map((section) => {
            const items = section.items.filter((item) => can(item.permission));
            if (items.length === 0) {
              return null;
            }
            return (
              <div key={section.title}>
                <p className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-secondary">
                  {section.title}
                </p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                          isActive
                            ? "bg-primary text-on-primary shadow-sm"
                            : "text-secondary hover:bg-white/80 hover:text-on-surface",
                        )
                      }
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
