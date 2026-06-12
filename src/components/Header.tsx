import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Bell,
  Bot,
  Boxes,
  ChevronDown,
  ChartColumnIncreasing,
  Map,
  Search,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge, Button } from "./ui";
import { useWorkspace } from "../context/WorkspaceContext";
import { formatDateTime } from "../lib/labels";
import { cn } from "../lib/utils";

const primaryNavigation = [
  { icon: ChartColumnIncreasing, label: "Overview", path: "/dashboard", permission: "dashboard.read" as const },
  { icon: TrendingUp, label: "Pipeline", path: "/pipeline", permission: "opportunities.read" as const },
  { icon: Users, label: "Accounts", path: "/clients", permission: "clients.read" as const },
  { icon: ShoppingCart, label: "Orders", path: "/orders", permission: "orders.read" as const },
  { icon: Boxes, label: "Products", path: "/products", permission: "products.read" as const },
  { icon: Map, label: "Routes", path: "/routes", permission: "routes.read" as const },
  { icon: Bot, label: "Copilot", path: "/assistant", permission: "assistant.read" as const },
];

export function Header() {
  const { company, currentUser, notifications, signOut, markNotificationRead, can } = useWorkspace();
  const [showNotifications, setShowNotifications] = useState(false);

  if (!company || !currentUser) {
    return null;
  }

  const unread = notifications.filter((notification) => !notification.read);
  const visibleNavigation = primaryNavigation.filter((item) => can(item.permission));

  return (
    <header className="glass-panel sticky top-4 z-30 rounded-[32px] px-4 py-4 sm:px-5 lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center justify-between gap-4 xl:min-w-[260px]">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-[18px] bg-carbon shadow-[0_18px_30px_rgba(22,29,26,0.18)]">
              <div className="absolute left-2 top-3 h-4 w-7 -rotate-[38deg] rounded-full bg-primary" />
              <div className="absolute bottom-3 right-2 h-4 w-7 -rotate-[38deg] rounded-full bg-teal-soft" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-secondary">
                Sales Intelligence
              </p>
              <h1 className="[font-family:var(--font-display)] text-[1.35rem] font-bold tracking-[-0.04em] text-on-surface">
                Clerivo
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 xl:hidden">
            <button
              type="button"
              onClick={() => setShowNotifications((value) => !value)}
              className="signal-pill relative h-11 w-11 justify-center p-0"
            >
              <Bell className="h-4 w-4 text-secondary" />
              {unread.length > 0 ? (
                <span className="absolute right-0 top-0 flex h-5 min-w-5 translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-carbon">
                  {unread.length}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="order-3 xl:order-2 xl:flex-1 xl:px-8">
          <nav className="mx-auto flex w-full max-w-[760px] items-center gap-2 overflow-x-auto rounded-full border border-outline-variant/70 bg-white/70 px-2 py-2 shadow-[0_18px_42px_rgba(21,33,28,0.06)] backdrop-blur-xl">
            {visibleNavigation.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200",
                    isActive
                      ? "bg-ink text-white shadow-[0_16px_30px_rgba(21,52,46,0.18)]"
                      : "text-secondary hover:bg-white/80 hover:text-on-surface",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="order-2 flex items-center gap-3 xl:order-3 xl:min-w-[360px] xl:justify-end">
          <label className="hidden min-w-[280px] items-center gap-3 rounded-full border border-outline-variant/70 bg-white/70 px-4 py-3 text-sm text-secondary shadow-[0_16px_35px_rgba(21,33,28,0.06)] lg:flex">
            <Search className="h-4 w-4 text-secondary" />
            <input
              type="search"
              placeholder="Search accounts, deals, momentum..."
              className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-secondary/80"
            />
          </label>

          <div className="relative hidden xl:block">
            <button
              type="button"
              onClick={() => setShowNotifications((value) => !value)}
              className="signal-pill relative h-12 w-12 justify-center p-0"
            >
              <Bell className="h-4 w-4 text-secondary" />
              {unread.length > 0 ? (
                <span className="absolute right-0 top-0 flex h-5 min-w-5 translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-carbon">
                  {unread.length}
                </span>
              ) : null}
            </button>

            {showNotifications ? (
              <div className="glass-panel absolute right-0 mt-3 w-[360px] overflow-hidden rounded-[28px]">
                <div className="flex items-center justify-between border-b border-outline-variant/80 px-5 py-4">
                  <div>
                    <p className="[font-family:var(--font-display)] text-lg font-bold tracking-[-0.04em] text-on-surface">
                      Signal feed
                    </p>
                    <p className="text-xs text-secondary">{unread.length} alerts non lues</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowNotifications(false)}>
                    Close
                  </Button>
                </div>

                <div className="max-h-[360px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-secondary">Aucune notification active.</div>
                  ) : (
                    notifications.slice(0, 6).map((notification) => (
                      <div
                        key={notification.id}
                        className="border-b border-outline-variant/70 px-5 py-4 last:border-b-0"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-on-surface">{notification.title}</p>
                              {!notification.read ? <Badge variant="success">New</Badge> : null}
                            </div>
                            <p className="text-xs leading-relaxed text-secondary">{notification.body}</p>
                          </div>

                          {!notification.read ? (
                            <button
                              type="button"
                              onClick={() => markNotificationRead(notification.id)}
                              className="text-[11px] font-semibold text-teal transition-colors hover:text-ink"
                            >
                              Marquer lu
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-3 text-[11px] text-secondary">{formatDateTime(notification.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="signal-pill hidden sm:flex">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
              {currentUser.initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-on-surface">{currentUser.name}</p>
              <p className="truncate text-[11px] uppercase tracking-[0.18em] text-secondary">
                {currentUser.roleLabel}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 text-secondary" />
          </div>

          <Button variant="outline" size="sm" onClick={signOut} className="hidden sm:inline-flex">
            Quitter
          </Button>
        </div>
      </div>
    </header>
  );
}
