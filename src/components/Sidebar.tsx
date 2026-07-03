import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Bell,
  Bot,
  Boxes,
  CalendarDays,
  ChartColumnIncreasing,
  CheckSquare,
  CreditCard,
  FileSignature,
  FolderKanban,
  Map,
  MessageCircle,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Target,
  TrendingUp,
  Users,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { getJson } from "../lib/api";
import { useWorkspace } from "../context/WorkspaceContext";
import { useTranslation } from "../i18n";
import { Logo } from "./Logo";
import { planHasFeature, type PlanFeature, type PermissionKey } from "../types";

// Labels are i18n keys resolved at render (see SidebarContent). Section titles and
// item labels live in locales.ts under nav.*.
type NavItem = {
  icon: typeof Bell;
  labelKey: string;
  path: string;
  permission: PermissionKey;
  feature?: PlanFeature;
};

const navSections: Array<{ titleKey: string; items: NavItem[] }> = [
  {
    titleKey: "nav.section.home",
    items: [
      { icon: ChartColumnIncreasing, labelKey: "nav.dashboard", path: "/dashboard", permission: "dashboard.read" },
      { icon: CalendarDays, labelKey: "nav.agenda", path: "/agenda", permission: "visits.read" },
      { icon: Bell, labelKey: "nav.notifications", path: "/notifications", permission: "notifications.read" },
    ],
  },
  {
    titleKey: "nav.section.commercial",
    items: [
      { icon: Users, labelKey: "nav.prospects", path: "/prospects", permission: "clients.read", feature: "contacts" },
      { icon: UsersRound, labelKey: "nav.clients", path: "/clients", permission: "clients.read", feature: "contacts" },
      { icon: TrendingUp, labelKey: "nav.pipeline", path: "/pipeline", permission: "opportunities.read", feature: "pipeline" },
      { icon: Workflow, labelKey: "nav.activities", path: "/activities", permission: "visits.read" },
    ],
  },
  {
    titleKey: "nav.section.messaging",
    items: [
      { icon: MessageCircle, labelKey: "nav.whatsapp", path: "/whatsapp", permission: "clients.read", feature: "whatsapp" },
    ],
  },
  {
    titleKey: "nav.section.sales",
    items: [
      { icon: FileSignature, labelKey: "nav.quotes", path: "/quotes", permission: "orders.read", feature: "quotes" },
      { icon: ShoppingCart, labelKey: "nav.orders", path: "/orders", permission: "orders.read", feature: "orders" },
      { icon: Boxes, labelKey: "nav.products", path: "/products", permission: "products.read" },
    ],
  },
  {
    titleKey: "nav.section.operations",
    items: [
      { icon: Map, labelKey: "nav.routes", path: "/routes", permission: "routes.read", feature: "visits" },
      { icon: FolderKanban, labelKey: "nav.documents", path: "/documents", permission: "clients.read" },
    ],
  },
  {
    titleKey: "nav.section.steering",
    items: [
      { icon: ChartColumnIncreasing, labelKey: "nav.reports", path: "/reports", permission: "insights.read", feature: "advanced_reports" },
      { icon: Target, labelKey: "nav.targets", path: "/targets", permission: "targets.read" },
      { icon: UsersRound, labelKey: "nav.team", path: "/team", permission: "insights.read" },
      { icon: CheckSquare, labelKey: "nav.approvals", path: "/approvals", permission: "approvals.write" },
    ],
  },
  {
    titleKey: "nav.section.tools",
    items: [
      { icon: Bot, labelKey: "nav.assistant", path: "/assistant", permission: "assistant.read", feature: "assistant_ai" },
      { icon: Settings, labelKey: "nav.settings", path: "/settings", permission: "settings.read" },
      { icon: CreditCard, labelKey: "nav.billing", path: "/billing", permission: "settings.read" },
      { icon: Shield, labelKey: "nav.roles", path: "/roles", permission: "roles.read" },
      { icon: ScrollText, labelKey: "nav.audit", path: "/audit", permission: "audit.read" },
    ],
  },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { can, company, currentUser } = useWorkspace();
  const { t } = useTranslation();
  const plan = company?.plan;
  const [waUnread, setWaUnread] = useState(0);

  const whatsappEnabled = planHasFeature(plan, "whatsapp") && can("clients.read");
  useEffect(() => {
    if (!whatsappEnabled) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const data = await getJson<{ total: number }>("/api/v1/whatsapp/unread-count");
        if (!cancelled) setWaUnread(Number(data?.total || 0));
      } catch {
        /* ignore */
      }
    };
    void fetchUnread();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchUnread();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [whatsappEnabled]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-outline-variant">
        <Logo className="mx-auto h-20 w-[260px]" />
        {currentUser ? (
          <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-outline-variant bg-white/70 px-2 py-1.5">
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="h-7 w-7 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink text-[10px] font-bold text-white">
                {currentUser.initials}
              </div>
            )}
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[12px] font-semibold text-on-surface">{currentUser.name}</p>
              <p className="truncate text-[10px] text-secondary">{currentUser.roleLabel}</p>
            </div>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navSections.map((section) => {
          const items = section.items.filter(
            (item) => can(item.permission) && (!item.feature || planHasFeature(plan, item.feature)),
          );
          if (items.length === 0) {
            return null;
          }

          return (
            <div key={section.titleKey}>
              <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wider text-secondary">
                {t(section.titleKey)}
              </p>
              <div className="space-y-1">
                {items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => onNavigate?.()}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                        isActive
                          ? "bg-primary text-on-primary shadow-sm"
                          : "text-secondary hover:bg-white/80 hover:text-on-surface",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t(item.labelKey)}</span>
                    {item.path === "/whatsapp" && waUnread > 0 ? (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-on-primary">
                        {waUnread > 99 ? "99+" : waUnread}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-outline-variant px-4 py-2 text-center text-[10px] font-semibold text-secondary">
        coveoconsulting · v1.0.3
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-[292px] shrink-0 border-r border-outline-variant bg-[#f0f4ef] text-on-surface lg:flex">
      <SidebarContent />
    </aside>
  );
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Pure CSS transitions (no JS animation library): the drawer is always mounted
  // and slides via transform/opacity. This can never get "stuck open" the way an
  // animation-completion-based unmount can on some mobile WebViews.
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 lg:hidden",
        open ? "" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Fermer le menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/45 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "relative flex h-full w-[292px] flex-col bg-[#f0f4ef] text-on-surface shadow-[24px_0_60px_rgba(20,33,28,0.35)] transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          type="button"
          aria-label="Fermer"
          tabIndex={open ? 0 : -1}
          onClick={onClose}
          className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-white/80 text-secondary hover:bg-white"
        >
          <X className="h-4 w-4" />
        </button>
        <SidebarContent onNavigate={onClose} />
      </div>
    </div>
  );
}
