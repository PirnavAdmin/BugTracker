import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
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

/**
 * Executes a seamless theme change without visual glitching or glowing borders.
 * Uses View Transitions API where supported for smooth cross-fading,
 * and temporarily locks CSS property transitions so elements settle immediately
 * without intermediate contrast lag.
 */
const executeThemeTransition = (applyChanges) => {
  if (typeof document === "undefined") {
    applyChanges();
    return;
  }

  const disableTransitions = () => {
    const css = document.createElement("style");
    css.setAttribute("id", "curecode-theme-transition-lock");
    css.appendChild(
      document.createTextNode(
        "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}"
      )
    );
    document.head.appendChild(css);
    return () => {
      (() => window.getComputedStyle(document.body))();
      if (document.head.contains(css)) {
        document.head.removeChild(css);
      }
    };
  };

  const hasViewTransition =
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (hasViewTransition) {
    const removeTransitionLock = disableTransitions();
    try {
      const transition = document.startViewTransition(() => {
        flushSync(() => {
          applyChanges();
        });
      });
      transition.finished.finally(() => {
        removeTransitionLock();
      });
    } catch {
      removeTransitionLock();
    }
    return;
  }

  // Fallback: lock transitions during theme change so elements snap atomically without glowing borders or lag
  const removeTransitionLock = disableTransitions();
  flushSync(() => {
    applyChanges();
  });
  setTimeout(() => {
    removeTransitionLock();
  }, 32);
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
      executeThemeTransition(() => {
        setTheme("light");
        applyThemeToDOM("light", isAlwaysLightRoute(window.location?.pathname || ""));
      });
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
    const nextTheme = theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);

    executeThemeTransition(() => {
      applyThemeToDOM(nextTheme, isLightLocked);
      setTheme(nextTheme);
    });
  }, [theme, isLightLocked]);

  const updateTheme = useCallback(
    (targetTheme) => {
      const nextTheme = typeof targetTheme === "function" ? targetTheme(theme) : targetTheme;
      if (nextTheme !== "light" && nextTheme !== "dark") return;
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);

      executeThemeTransition(() => {
        applyThemeToDOM(nextTheme, isLightLocked);
        setTheme(nextTheme);
      });
    },
    [theme, isLightLocked]
  );

  const resetThemeToLight = useCallback(() => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    executeThemeTransition(() => {
      applyThemeToDOM("light", isLightLocked);
      setTheme("light");
    });
  }, [isLightLocked]);

  const value = useMemo(
    () => ({
      theme: isLightLocked ? "light" : theme,
      actualTheme: theme,
      toggleTheme,
      setTheme: updateTheme,
      resetThemeToLight,
      isLightLocked,
    }),
    [theme, isLightLocked, toggleTheme, updateTheme, resetThemeToLight]
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
