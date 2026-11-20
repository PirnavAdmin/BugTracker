import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { AUTH_SESSION_CLEARED_EVENT } from "@/lib/session";

const THEME_STORAGE_KEY = "curecode-theme";
export const CURECODE_AUTH_LOGIN_EVENT = "curecode_auth_login";
const ThemeContext = createContext(null);

/**
 * Checks if a route must always be forced into light theme.
 * Includes all public landing pages and authentication / login pages.
 */
export const isAlwaysLightRoute = (pathname = "") => {
  if (!pathname) return true;
  const path = pathname.toLowerCase();

  // Landing page & public pages
  if (
    path === "/" ||
    path === "/pricing" ||
    path === "/features" ||
    path === "/resources" ||
    path === "/enterprise" ||
    path === "/contact" ||
    path === "/subscribe"
  ) {
    return true;
  }

  // Exact auth & login pages
  if (
    path === "/login" ||
    path === "/signup" ||
    path === "/admin" ||
    path === "/auth" ||
    path === "/platform/login" ||
    path === "/forgot-password" ||
    path === "/reset-password"
  ) {
    return true;
  }

  // Prefixes for login/auth sub-paths
  if (
    path.startsWith("/login/") ||
    path.startsWith("/signup/") ||
    path.startsWith("/auth/") ||
    path.startsWith("/forgot-password/") ||
    path.startsWith("/reset-password/")
  ) {
    return true;
  }

  return false;
};

const applyThemeToDOM = (theme, isLightLocked = false) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  if (isLightLocked || theme !== "dark") {
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
    root.style.colorScheme = "light";
  } else {
    root.classList.add("dark");
    root.setAttribute("data-theme", "dark");
    root.style.colorScheme = "dark";
  }
};

export const ThemeProvider = ({ children }) => {
  const location = useLocation();
  const isLightLocked = isAlwaysLightRoute(location.pathname);

  // Default theme is light. Only dark if explicitly set in storage and not light-locked.
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "dark") {
        return "dark";
      }
    }
    return "light";
  });

  // When a user logs in or logs out, default the workspace back to light mode.
  useEffect(() => {
    const handleResetToLight = () => {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      setTheme("light");
      applyThemeToDOM("light", isAlwaysLightRoute(window.location?.pathname || ""));
    };

    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleResetToLight);
    window.addEventListener(CURECODE_AUTH_LOGIN_EVENT, handleResetToLight);

    return () => {
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, handleResetToLight);
      window.removeEventListener(CURECODE_AUTH_LOGIN_EVENT, handleResetToLight);
    };
  }, []);

  // Update DOM theme whenever theme or route changes
  useEffect(() => {
    applyThemeToDOM(theme, isLightLocked);
  }, [theme, isLightLocked]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "light" ? "dark" : "light";
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      applyThemeToDOM(nextTheme, isLightLocked);
      return nextTheme;
    });
  }, [isLightLocked]);

  const resetThemeToLight = useCallback(() => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    setTheme("light");
    applyThemeToDOM("light", isLightLocked);
  }, [isLightLocked]);

  const value = useMemo(
    () => ({
      theme: isLightLocked ? "light" : theme,
      actualTheme: theme,
      toggleTheme,
      setTheme,
      resetThemeToLight,
      isLightLocked,
    }),
    [theme, isLightLocked, toggleTheme, resetThemeToLight]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
