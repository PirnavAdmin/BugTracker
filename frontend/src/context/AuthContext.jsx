import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AUTH_SESSION_CLEARED_EVENT,
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "@/lib/session";
import { fetchCurrentUser } from "@/lib/api";
import { getDashboardPathByRole } from "@/lib/roles";
import { disconnectChatSocket } from "@/lib/socket";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => readStoredSession());

  const setAuthSession = useCallback((value, options = {}) => {
    try {
      localStorage.setItem("curecode-theme", "light");
      window.dispatchEvent(new Event("curecode_auth_login"));
    } catch {
      // ignore
    }
    setSession(value);
    writeStoredSession(value, options);
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.setItem("curecode-theme", "light");
    } catch {
      // ignore
    }
    disconnectChatSocket();
    setSession(null);
    clearStoredSession();
  }, []);

  useEffect(() => {
    const handleSessionCleared = () => {
      disconnectChatSocket();
      setSession(null);
    };

    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);

    return () => {
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    };
  }, []);

  const { data: currentUser } = useQuery({
    queryKey: ["auth", "current-user", session?.token],
    queryFn: fetchCurrentUser,
    enabled: Boolean(session?.token),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (!currentUser?._id) {
      return;
    }

    setSession((currentSession) => {
      if (!currentSession?.token) {
        return currentSession;
      }

      const nextUser = {
        ...currentSession.user,
        ...currentUser,
      };
      const userChanged =
        JSON.stringify(currentSession.user || {}) !== JSON.stringify(nextUser);

      if (!userChanged) {
        return currentSession;
      }

      const nextSession = {
        ...currentSession,
        user: nextUser,
      };

      writeStoredSession(nextSession, {
        rememberMe: nextSession.rememberMe,
      });

      return nextSession;
    });
  }, [currentUser]);

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
    [session, setAuthSession, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
