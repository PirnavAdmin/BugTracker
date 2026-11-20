import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const THEME_STORAGE_KEY = "curecode-theme";
const ThemeContext = createContext(null);

const applyThemeToDOM = (theme) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    root.setAttribute("data-theme", "dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
    root.style.colorScheme = "light";
  }
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const initial =
      typeof window !== "undefined" && localStorage.getItem(THEME_STORAGE_KEY) === "dark"
        ? "dark"
        : "light";
    applyThemeToDOM(initial);
    return initial;
  });

  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === "light" ? "dark" : "light";
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyThemeToDOM(nextTheme);
    setTheme(nextTheme);
  }, [theme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
