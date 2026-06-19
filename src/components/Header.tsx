import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CheckCheck, Loader2, LogOut, Menu, Search } from "lucide-react";
import { Badge, Button } from "./ui";
import { Logo } from "./Logo";
import { useWorkspace } from "../context/WorkspaceContext";
import { formatDateTime } from "../lib/labels";
import { getJson, postJson } from "../lib/api";
import { useToast } from "./Toast";

type SearchHit = { id: string; label: string; sub: string; path: string };
type SearchResults = {
  clients: SearchHit[];
  prospects: SearchHit[];
  visits: SearchHit[];
  opportunities: SearchHit[];
  orders: SearchHit[];
};

const SECTION_LABELS: Array<{ key: keyof SearchResults; label: string }> = [
  { key: "clients", label: "Comptes" },
  { key: "prospects", label: "Prospects" },
  { key: "visits", label: "Visites" },
  { key: "opportunities", label: "Opportunités" },
  { key: "orders", label: "Commandes" },
];

export function Header({ onOpenMobileMenu }: { onOpenMobileMenu?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { company, currentUser, notifications, signOut, markNotificationRead, refreshNotifications } = useWorkspace();
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const handle = setTimeout(() => {
      getJson<SearchResults>(`/api/v1/search?q=${encodeURIComponent(searchQuery.trim())}`)
        .then((payload) => {
          setSearchResults(payload);
          setActiveIndex(0);
        })
        .catch(() => setSearchResults(null))
        .finally(() => setSearchLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Close panels on route change
  useEffect(() => {
    setSearchOpen(false);
    setShowNotifications(false);
  }, [location.pathname]);

  // Cmd/Ctrl+K shortcut and escape
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const metaK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA";
      if (metaK || slash) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setShowNotifications(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const flatHits = useCallback((): SearchHit[] => {
    if (!searchResults) return [];
    return SECTION_LABELS.flatMap((section) => searchResults[section.key]);
  }, [searchResults]);

  if (!company || !currentUser) {
    return null;
  }

  const unread = notifications.filter((notification) => !notification.read);
  const totalHits = searchResults
    ? SECTION_LABELS.reduce((sum, section) => sum + searchResults[section.key].length, 0)
    : 0;
  const goToHit = (hit: SearchHit) => {
    setSearchOpen(false);
    setSearchQuery("");
    navigate(hit.path);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const hits = flatHits();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      const hit = hits[activeIndex];
      if (hit) {
        event.preventDefault();
        goToHit(hit);
      }
    }
  };

  const markAllRead = async () => {
    try {
      await postJson("/api/v1/notifications/read-all");
      await refreshNotifications();
      toast.success("Toutes les notifications marquées lues");
    } catch {
      toast.error("Impossible de marquer comme lu");
    }
  };

  let cursor = -1;

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-outline-variant bg-surface/80 px-4 py-3 backdrop-blur-xl sm:px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-2 lg:hidden">
        <button
          type="button"
          aria-label="Ouvrir le menu"
          onClick={() => onOpenMobileMenu?.()}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant bg-white/80 hover:bg-white"
        >
          <Menu className="h-5 w-5 text-secondary" />
        </button>
        <Logo className="h-10 w-[140px]" />
      </div>

      <div ref={searchRef} className="relative hidden flex-1 lg:block">
        <label className="flex items-center gap-2 rounded-lg border border-outline-variant bg-white/80 px-3 py-2 text-sm text-secondary transition-shadow focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_22%,transparent)]">
          <Search className="h-4 w-4 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Rechercher un compte, une visite, une commande..."
            className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-secondary"
          />
          {searchLoading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-secondary" />
          ) : (
            <kbd className="hidden rounded border border-outline-variant bg-surface px-1.5 py-0.5 text-[10px] font-bold text-secondary sm:inline-block">
              ⌘K
            </kbd>
          )}
        </label>
        <AnimatePresence>
          {searchOpen && searchQuery.trim().length >= 2 ? (
            <motion.div
              key="search-panel"
              initial={{ opacity: 0, y: -6, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.99 }}
              transition={{ duration: 0.14 }}
              className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[480px] overflow-y-auto rounded-xl border border-outline-variant bg-white shadow-[0_24px_60px_rgba(20,33,28,0.18)]"
            >
              {searchResults === null && searchLoading ? (
                <p className="px-4 py-4 text-sm text-secondary">Recherche…</p>
              ) : totalHits === 0 ? (
                <p className="px-4 py-4 text-sm text-secondary">Aucun résultat.</p>
              ) : (
                SECTION_LABELS.map((section) => {
                  const hits = searchResults?.[section.key] ?? [];
                  if (hits.length === 0) return null;
                  return (
                    <div key={section.key} className="border-b border-outline-variant last:border-b-0">
                      <p className="bg-surface-container-low px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-secondary">
                        {section.label}
                      </p>
                      {hits.map((hit) => {
                        cursor += 1;
                        const isActive = cursor === activeIndex;
                        return (
                          <button
                            key={`${section.key}-${hit.id}`}
                            type="button"
                            onClick={() => goToHit(hit)}
                            onMouseEnter={() => setActiveIndex(cursor)}
                            className={`block w-full border-b border-outline-variant/40 px-4 py-2 text-left text-sm last:border-b-0 transition-colors ${
                              isActive ? "bg-primary/10" : "hover:bg-surface"
                            }`}
                          >
                            <p className="font-semibold text-on-surface">{hit.label}</p>
                            {hit.sub ? <p className="text-[11px] text-secondary">{hit.sub}</p> : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications((value) => !value)}
            aria-label="Notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant bg-white/80 transition-all hover:bg-white hover:shadow-sm"
          >
            <Bell className="h-4 w-4 text-secondary" />
            {unread.length > 0 ? (
              <motion.span
                key={unread.length}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-on-primary"
              >
                {unread.length}
              </motion.span>
            ) : null}
          </button>

          <AnimatePresence>
            {showNotifications ? (
              <motion.div
                key="notif-panel"
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className="absolute right-0 z-40 mt-2 w-[360px] overflow-hidden rounded-xl border border-outline-variant bg-white shadow-[0_24px_60px_rgba(20,33,28,0.18)]"
              >
                <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-on-surface">Notifications</p>
                    <p className="text-xs text-secondary">{unread.length} non lue(s)</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {unread.length > 0 ? (
                      <Button variant="ghost" size="sm" onClick={markAllRead} className="gap-1">
                        <CheckCheck className="h-3.5 w-3.5" />
                        Tout lu
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-secondary">Aucune notification.</div>
                  ) : (
                    notifications.slice(0, 8).map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={async () => {
                          if (!notification.read) {
                            await markNotificationRead(notification.id);
                          }
                          if (notification.link) {
                            navigate(notification.link);
                            setShowNotifications(false);
                          }
                        }}
                        className="block w-full border-b border-outline-variant px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-on-surface">{notification.title}</p>
                              {!notification.read ? <Badge variant="success">Nouveau</Badge> : null}
                            </div>
                            <p className="text-xs text-secondary">{notification.body}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] text-secondary">
                          {formatDateTime(notification.createdAt)}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-white/80 px-2 py-1.5">
          {currentUser.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.name}
              className="h-7 w-7 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-xs font-bold text-white">
              {currentUser.initials}
            </div>
          )}
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-xs font-semibold text-on-surface">{currentUser.name}</p>
            <p className="truncate text-[10px] text-secondary">{currentUser.roleLabel}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={signOut}
          aria-label="Se déconnecter"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant bg-white/80 transition-all hover:bg-white hover:shadow-sm"
        >
          <LogOut className="h-4 w-4 text-secondary" />
        </button>
      </div>
    </header>
  );
}
