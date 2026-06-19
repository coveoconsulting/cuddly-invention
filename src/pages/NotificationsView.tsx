import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import type { NotificationItem } from "../types";
import { ApiError, asArray, getJson, postJson } from "../lib/api";
import { Badge, Button } from "../components/ui";
import { useWorkspace } from "../context/WorkspaceContext";
import { formatDateTime } from "../lib/labels";

type Filter = "all" | "unread";

export function NotificationsView() {
  const { markNotificationRead } = useWorkspace();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");

  const load = async () => {
    setIsLoading(true);
    setError("");
    try {
      const payload = await getJson<unknown>("/api/v1/notifications");
      setItems(asArray<NotificationItem>(payload));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Chargement impossible");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "unread") {
      return items.filter((entry) => !entry.read);
    }
    return items;
  }, [items, filter]);

  const unreadCount = items.filter((entry) => !entry.read).length;

  const markRead = async (id: string) => {
    await markNotificationRead(id);
    setItems((current) => current.map((entry) => (entry.id === id ? { ...entry, read: true } : entry)));
  };

  const markAllRead = async () => {
    await postJson("/api/v1/notifications/read-all");
    await load();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-secondary">Centre de notifications</p>
          <h1 className="mt-1 text-3xl font-black text-on-surface">Notifications</h1>
        </div>
        {unreadCount > 0 ? (
          <Button variant="outline" onClick={() => void markAllRead()}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Tout marquer lu
          </Button>
        ) : null}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            filter === "all"
              ? "border-primary bg-primary text-on-primary"
              : "border-outline-variant bg-white text-secondary"
          }`}
        >
          Toutes ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            filter === "unread"
              ? "border-primary bg-primary text-on-primary"
              : "border-outline-variant bg-white text-secondary"
          }`}
        >
          Non lues ({unreadCount})
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-secondary">
          Chargement...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-error/20 bg-error-container p-4 text-sm text-error">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center text-secondary">
          <BellOff className="h-8 w-8 text-secondary" />
          <p className="text-sm">
            {filter === "unread" ? "Aucune notification non lue." : "Aucune notification."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
                notification.read
                  ? "border-outline-variant bg-surface-container-lowest"
                  : "border-primary/30 bg-primary/5"
              }`}
            >
              <Bell
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  notification.level === "critical"
                    ? "text-error"
                    : notification.level === "warning"
                    ? "text-amber-600"
                    : "text-primary"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`text-sm ${
                      notification.read ? "font-semibold text-on-surface" : "font-bold text-on-surface"
                    }`}
                  >
                    {notification.title}
                  </p>
                  {!notification.read ? <Badge variant="success">Nouveau</Badge> : null}
                  <Badge
                    variant={
                      notification.level === "critical"
                        ? "error"
                        : notification.level === "warning"
                        ? "warning"
                        : "neutral"
                    }
                  >
                    {notification.level}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-secondary">{notification.body}</p>
                <p className="mt-2 text-[11px] text-secondary">
                  {formatDateTime(notification.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {notification.link ? (
                  <Link
                    to={notification.link}
                    className="rounded-lg border border-outline-variant bg-white px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface"
                  >
                    Ouvrir
                  </Link>
                ) : null}
                {!notification.read ? (
                  <button
                    type="button"
                    onClick={() => void markRead(notification.id)}
                    className="rounded-lg border border-outline-variant bg-white px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface"
                  >
                    Marquer lu
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
