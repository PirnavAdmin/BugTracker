import { createContext, useEffect, useMemo, useState } from "react";
import {
  AUTH_SESSION_CLEARED_EVENT,
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "@/lib/session";
import { fetchCurrentUser } from "@/lib/api";
import { getDashboardPathByRole } from "@/lib/roles";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => readStoredSession());

  const setAuthSession = (value, options = {}) => {
    setSession(value);
    writeStoredSession(value, options);
  };

  const logout = () => {
    setSession(null);
    clearStoredSession();
  };

  useEffect(() => {
    const handleSessionCleared = () => setSession(null);

    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);

    return () => {
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    };
  }, []);

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    let isCurrent = true;

    fetchCurrentUser()
      .then((currentUser) => {
        if (!isCurrent || !currentUser?._id) {
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
      })
      .catch(() => {
        // 401s are handled by the shared API interceptor.
      });

    return () => {
      isCurrent = false;
    };
  }, [session?.token]);

  const value = useMemo(
    () => ({
      token: session?.token || null,
      user: session?.user || null,
      role: session?.user?.role || null,
      dashboardPath: getDashboardPathByRole(session?.user?.role),
      isAuthenticated: Boolean(session?.token),
      setAuthSession,
      logout,
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
