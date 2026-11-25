import { createContext, useEffect, useMemo, useState } from "react";
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
  const [isCheckingPlatformSession, setIsCheckingPlatformSession] = useState(Boolean(session?.token));

  const setPlatformAuthSession = (value) => {
    setSession(value);
    writePlatformSession(value);
  };

  const logout = async () => {
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
  };

  useEffect(() => {
    const handleSessionCleared = () => setSession(null);

    window.addEventListener(PLATFORM_AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);

    return () => {
      window.removeEventListener(PLATFORM_AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    };
  }, []);

  useEffect(() => {
    if (!session?.token) {
      setIsCheckingPlatformSession(false);
      return undefined;
    }

    let isCurrent = true;
    setIsCheckingPlatformSession(true);

    fetchCurrentPlatformAdmin()
      .then((platformAdmin) => {
        if (!isCurrent || !platformAdmin?._id) {
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
      })
      .catch(() => {
        // 401s are handled by the platform API interceptor.
      })
      .finally(() => {
        if (isCurrent) {
          setIsCheckingPlatformSession(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [session?.token]);

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
