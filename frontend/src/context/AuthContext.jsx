import { createContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AUTH_SESSION_CLEARED_EVENT,
  AUTH_SESSION_UPDATED_EVENT,
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "@/lib/session";
import { logoutRequest, refreshUserAuthSession } from "@/lib/api";
import { getDashboardPathByRole } from "@/lib/roles";
import { disconnectChatSocket } from "@/lib/socket";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => readStoredSession());
  const queryClient = useQueryClient();

  const setAuthSession = (value, options = {}) => {
    try {
      localStorage.setItem("curecode-theme", "light");
      window.dispatchEvent(new Event("curecode_auth_login"));
    } catch {
      // ignore
    }
    setSession(value);
    writeStoredSession(value, options);
  };

  const logout = () => {
    try {
      localStorage.setItem("curecode-theme", "light");
    } catch {
      // ignore
    }
    disconnectChatSocket();
    setSession(null);
    clearStoredSession();
    queryClient.clear();
    logoutRequest().catch((error) => {
      console.error("Unable to revoke the signed-in session:", error);
    });
  };

  useEffect(() => {
    const handleSessionCleared = () => {
      disconnectChatSocket();
      setSession(null);
    };
    const handleSessionUpdated = () => setSession(readStoredSession());

    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    window.addEventListener(AUTH_SESSION_UPDATED_EVENT, handleSessionUpdated);

    return () => {
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
      window.removeEventListener(AUTH_SESSION_UPDATED_EVENT, handleSessionUpdated);
    };
  }, []);

  useEffect(() => {
    queryClient.clear();
  }, [queryClient, session?.user?._id]);

  useEffect(() => {
    if (!session?.token || !session?.accessTokenExpiresAt) {
      return undefined;
    }

    let timer;
    let disposed = false;
    const refreshBeforeExpiry = () => {
      if (disposed) {
        return;
      }

      const expiryTime = new Date(session.accessTokenExpiresAt).getTime();
      const refreshDelay = Math.max(0, expiryTime - Date.now() - 60_000);
      timer = window.setTimeout(() => {
        refreshUserAuthSession().catch((error) => {
          if (!disposed && ![401, 403].includes(error?.response?.status)) {
            timer = window.setTimeout(refreshBeforeExpiry, 60_000);
          }
        });
      }, refreshDelay);
    };

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [session?.accessTokenExpiresAt, session?.token]);

  const value = useMemo(
    () => ({
      token: session?.token || null,
      user: session?.user || null,
      role: session?.user?.role || null,
      dashboardPath: getDashboardPathByRole(session?.user?.role),
      isAuthenticated: Boolean(session?.token),
      rememberMe: Boolean(session?.rememberMe),
      setAuthSession,
      logout,
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
