import { createContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  logoutPlatformAdmin,
  refreshPlatformAuthSession,
} from "@/lib/api";
import {
  PLATFORM_AUTH_SESSION_CLEARED_EVENT,
  PLATFORM_AUTH_SESSION_UPDATED_EVENT,
  clearPlatformSession,
  readPlatformSession,
  writePlatformSession,
} from "@/lib/platform-session";

export const PlatformAuthContext = createContext(null);

export const PlatformAuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => readPlatformSession());
  const isCheckingPlatformSession = false;
  const queryClient = useQueryClient();

  const setPlatformAuthSession = (value) => {
    setSession(value);
    writePlatformSession(value);
  };

  const logout = async () => {
    try {
      if (session?.token) {
        await logoutPlatformAdmin();
      }
    } catch (error) {
      console.error("Unable to revoke the platform session:", error);
    } finally {
      setSession(null);
      clearPlatformSession();
      queryClient.clear();
    }
  };

  useEffect(() => {
    const handleSessionCleared = () => setSession(null);
    const handleSessionUpdated = () => setSession(readPlatformSession());

    window.addEventListener(PLATFORM_AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    window.addEventListener(PLATFORM_AUTH_SESSION_UPDATED_EVENT, handleSessionUpdated);

    return () => {
      window.removeEventListener(PLATFORM_AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
      window.removeEventListener(PLATFORM_AUTH_SESSION_UPDATED_EVENT, handleSessionUpdated);
    };
  }, []);

  useEffect(() => {
    queryClient.clear();
  }, [queryClient, session?.platformAdmin?._id]);

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
        refreshPlatformAuthSession().catch((error) => {
          if (!disposed && ![401, 403].includes(error?.response?.status)) {
            timer = window.setTimeout(refreshBeforeExpiry, 60_000);
          }
        });
      }, refreshDelay);
    };

    refreshBeforeExpiry();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [session?.accessTokenExpiresAt, session?.token]);

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
    [isCheckingPlatformSession, session]
  );

  return (
    <PlatformAuthContext.Provider value={value}>
      {children}
    </PlatformAuthContext.Provider>
  );
};
