import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** "system" follows prefers-color-scheme; "light"/"dark" pin it. The choice is a
 *  per-browser convenience, so it lives in localStorage (guarded). */
const ThemeCtx = createContext({ theme: "system", setTheme: () => {} });

function read() {
  try {
    const t = localStorage.getItem("le_theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(read);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((t) => {
    setThemeState(t);
    try {
      if (t === "system") localStorage.removeItem("le_theme");
      else localStorage.setItem("le_theme", t);
    } catch { /* storage blocked — the choice still applies for this visit */ }
  }, []);

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
