import React, { createContext, useContext, useEffect, useState } from "react";
import type { Company, NotificationItem, PermissionKey, SessionPayload } from "../types";
import { ApiError, asArray, getJson, patchJson, postJson } from "../lib/api";

type WorkspaceContextType = {
  session: SessionPayload | null;
  company: Company | null;
  currentUser: SessionPayload["user"] | null;
  permissions: PermissionKey[];
  notifications: NotificationItem[];
  isBooting: boolean;
  isAuthenticated: boolean;
  activeDomain: string;
  userRole: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  can: (permission: PermissionKey) => boolean;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSession(payload: unknown): SessionPayload | null {
  if (!isRecord(payload) || !isRecord(payload.company) || !isRecord(payload.user)) {
    return null;
  }

  return {
    company: payload.company as unknown as SessionPayload["company"],
    user: payload.user as unknown as SessionPayload["user"],
    permissions: asArray<PermissionKey>(payload.permissions),
    unreadNotifications: typeof payload.unreadNotifications === "number" ? payload.unreadNotifications : 0,
  };
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isBooting, setIsBooting] = useState(true);

  const refreshNotifications = async () => {
    if (!session) {
      setNotifications([]);
      return;
    }
    try {
      const payload = await getJson<unknown>("/api/v1/notifications");
      setNotifications(asArray<NotificationItem>(payload));
    } catch {
      setNotifications([]);
    }
  };

  const refreshSession = async () => {
    try {
      const payload = await getJson<unknown>("/api/v1/auth/session");
      setSession(normalizeSession(payload));
    } catch {
      setSession(null);
      setNotifications([]);
    } finally {
      setIsBooting(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  useEffect(() => {
    if (!session) {
      setNotifications([]);
      return;
    }
    refreshNotifications();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshNotifications();
      }
    }, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshNotifications();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session]);

  useEffect(() => {
    const handleSessionExpired = () => {
      setSession(null);
      setNotifications([]);
    };
    window.addEventListener("session-expired", handleSessionExpired);
    return () => {
      window.removeEventListener("session-expired", handleSessionExpired);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const payload = await postJson<unknown>("/api/v1/auth/login", { email, password });
    const normalizedSession = normalizeSession(payload);
    if (!normalizedSession) {
      throw new ApiError("Session invalide", 500, payload);
    }
    setSession(normalizedSession);
    const incomingNotifications = await getJson<unknown>("/api/v1/notifications");
    setNotifications(asArray<NotificationItem>(incomingNotifications));
  };

  const signOut = async () => {
    try {
      await postJson("/api/v1/auth/logout");
    } finally {
      setSession(null);
      setNotifications([]);
    }
  };

  const markNotificationRead = async (notificationId: string) => {
    await patchJson(`/api/v1/notifications/${notificationId}/read`);
    await Promise.all([refreshNotifications(), refreshSession()]);
  };

  const permissions = asArray<PermissionKey>(session?.permissions);
  const company = session?.company ?? null;
  const currentUser = session?.user ?? null;

  return (
    <WorkspaceContext.Provider
      value={{
        session,
        company,
        currentUser,
        permissions,
        notifications,
        isBooting,
        isAuthenticated: Boolean(company && currentUser),
        activeDomain: company?.vertical || "",
        userRole: currentUser?.roleLabel || "",
        signIn,
        signOut,
        refreshSession,
        refreshNotifications,
        markNotificationRead,
        can: (permission) => permissions.includes(permission),
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
