import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCurrentPlatformAdmin, logoutPlatformAdmin } from "@/lib/api";
import {
  PLATFORM_AUTH_SESSION_CLEARED_EVENT,
  clearPlatformSession,
  readPlatformSession,
  writePlatformSession,
} from "@/lib/platform-session";

export const PlatformAuthContext = createContext(null);

export const PlatformAuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => readPlatformSession());

  const setPlatformAuthSession = useCallback((value) => {
    setSession(value);
    writePlatformSession(value);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (session?.token) {
        await logoutPlatformAdmin();
      }
    } catch {
      // Local cleanup is still required when the server session check fails.
    } finally {
      setSession(null);
      clearPlatformSession();
    }
  }, [session?.token]);

  useEffect(() => {
    const handleSessionCleared = () => setSession(null);

    window.addEventListener(PLATFORM_AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);

    return () => {
      window.removeEventListener(PLATFORM_AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    };
  }, []);

  const { data: platformAdmin, isLoading: isPlatformAdminLoading } = useQuery({
    queryKey: ["platform-auth", "current-admin", session?.token],
    queryFn: fetchCurrentPlatformAdmin,
    enabled: Boolean(session?.token),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const isCheckingPlatformSession =
    Boolean(session?.token) && isPlatformAdminLoading && !platformAdmin;

  useEffect(() => {
    if (!platformAdmin?._id) {
      return;
    }

    setSession((currentSession) => {
      if (!currentSession?.token) {
        return currentSession;
      }

      const nextSession = {
        ...currentSession,
        platformAdmin,
      };

      writePlatformSession(nextSession);
      return nextSession;
    });
  }, [platformAdmin]);

  const value = useMemo(
    () => ({
      token: session?.token || null,
      platformAdmin: session?.platformAdmin || null,
      role: session?.platformAdmin?.role || null,
      isAuthenticated: Boolean(session?.token),
      isCheckingPlatformSession,
      setPlatformAuthSession,
      logout,
    }),
    [isCheckingPlatformSession, session, setPlatformAuthSession, logout]
  );

  return (
    <PlatformAuthContext.Provider value={value}>
      {children}
    </PlatformAuthContext.Provider>
  );
};
