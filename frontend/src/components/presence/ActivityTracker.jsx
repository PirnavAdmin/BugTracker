import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePresence } from "@/context/PresenceContext";
import { useAuth } from "@/hooks/use-auth";
import {
  AUTH_STORAGE_KEY,
  clearLastActivity,
  getInactivityTimeoutMs,
  isSessionInactive,
  LAST_ACTIVITY_STORAGE_KEY,
  recordLastActivity,
} from "@/lib/session";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"];
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 15 * 1000;
const INACTIVITY_CHECK_INTERVAL_MS = 15 * 1000;

const ActivityTracker = () => {
  const { token, logout } = useAuth();
  const { markActive, markIdle, markOffline } = usePresence();
  const navigate = useNavigate();
  const location = useLocation();

  const isLoggingOutRef = useRef(false);
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    if (!token) {
      isLoggingOutRef.current = false;
      return undefined;
    }

    let idleTimerId;
    let checkIntervalId;
    let lastActivityRecordedAt = 0;

    const performAutoLogout = () => {
      if (isLoggingOutRef.current) {
        return;
      }
      isLoggingOutRef.current = true;

      clearLastActivity();
      logout();

      const currentLocation = locationRef.current;
      const currentPath = currentLocation.pathname + currentLocation.search;
      const isAuthPage = ["/login", "/auth", "/admin", "/platform/login"].includes(
        currentLocation.pathname
      );
      const redirectParam =
        !isAuthPage && currentPath ? `&redirect=${encodeURIComponent(currentPath)}` : "";

      navigate(`/login?reason=inactivity${redirectParam}`, { replace: true });
    };

    const checkInactivity = () => {
      if (!token || isLoggingOutRef.current) {
        return;
      }
      if (isSessionInactive(getInactivityTimeoutMs())) {
        performAutoLogout();
      }
    };

    // If session is already inactive before this component mounted, logout immediately.
    if (isSessionInactive(getInactivityTimeoutMs())) {
      performAutoLogout();
      return undefined;
    }

    const resetIdleTimer = () => {
      window.clearTimeout(idleTimerId);
      idleTimerId = window.setTimeout(() => {
        markIdle();
      }, IDLE_TIMEOUT_MS);
    };

    const handleActivity = () => {
      if (isLoggingOutRef.current) {
        return;
      }
      const now = Date.now();

      resetIdleTimer();

      if (now - lastActivityRecordedAt < ACTIVITY_THROTTLE_MS) {
        return;
      }

      lastActivityRecordedAt = now;
      recordLastActivity(now);
      markActive();
    };

    const handleStorageChange = (event) => {
      if (
        (event.key === AUTH_STORAGE_KEY || event.key === LAST_ACTIVITY_STORAGE_KEY) &&
        !event.newValue
      ) {
        performAutoLogout();
        return;
      }
      if (event.key === LAST_ACTIVITY_STORAGE_KEY && event.newValue) {
        resetIdleTimer();
        lastActivityRecordedAt = Number(event.newValue) || Date.now();
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        checkInactivity();
      }
    };

    const handlePageExit = () => {
      markOffline();
    };

    lastActivityRecordedAt = Date.now();
    recordLastActivity(lastActivityRecordedAt);
    markActive({ force: true });
    resetIdleTimer();

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener("beforeunload", handlePageExit);

    checkIntervalId = window.setInterval(checkInactivity, INACTIVITY_CHECK_INTERVAL_MS);

    return () => {
      window.clearTimeout(idleTimerId);
      window.clearInterval(checkIntervalId);
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener("beforeunload", handlePageExit);
    };
  }, [logout, markActive, markIdle, markOffline, navigate, token]);

  return null;
};

export default ActivityTracker;
