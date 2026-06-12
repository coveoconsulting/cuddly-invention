import React, { createContext, useContext, useEffect, useState } from "react";
import type { Company, NotificationItem, PermissionKey, SessionPayload } from "../types";
import { getJson, patchJson, postJson } from "../lib/api";

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
      const payload = await getJson<NotificationItem[]>("/api/v1/notifications");
      setNotifications(payload);
    } catch {
      setNotifications([]);
    }
  };

  const refreshSession = async () => {
    try {
      const payload = await getJson<SessionPayload>("/api/v1/auth/session");
      setSession(payload);
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
    if (session) {
      refreshNotifications();
    } else {
      setNotifications([]);
    }
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
    const payload = await postJson<SessionPayload>("/api/v1/auth/login", { email, password });
    setSession(payload);
    const incomingNotifications = await getJson<NotificationItem[]>("/api/v1/notifications");
    setNotifications(incomingNotifications);
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

  const permissions = session?.permissions || [];
  const currentUser = session?.user || null;

  return (
    <WorkspaceContext.Provider
      value={{
        session,
        company: session?.company || null,
        currentUser,
        permissions,
        notifications,
        isBooting,
        isAuthenticated: Boolean(session),
        activeDomain: session?.company.vertical || "",
        userRole: session?.user.roleLabel || "",
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
