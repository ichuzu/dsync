import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_THEME } from "./palettes";
import { renderAppIcon, themePrimary } from "@/lib/appIcon";
import { getDesktop } from "@/lib/desktop";
import {
  applyTokens,
  buildTokens,
  type ResolvedMode,
  type ThemeConfig,
  type TokenMap,
} from "./tokens";

export const THEME_STORAGE_KEY = "dsync:theme";

interface ThemeContextValue {
  config: ThemeConfig;
  /** Patch one or more knobs; anything omitted is left alone. */
  setConfig: (patch: Partial<ThemeConfig>) => void;
  /** Back to the shipped Dsync palette in dark mode. */
  reset: () => void;
  /** `mode` with "system" already resolved against the OS preference. */
  resolvedMode: ResolvedMode;
  /** The generated variables, for anything that can't read CSS custom properties. */
  tokens: TokenMap;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Merge a stored config over the defaults, dropping anything malformed. */
const readStored = (): ThemeConfig => {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<ThemeConfig>;
    const merged = { ...DEFAULT_THEME, ...parsed };
    // Guard against hand-edited or stale storage producing NaN variables.
    for (const key of [
      "primaryHue",
      "primarySat",
      "accentHue",
      "accentSat",
      "neutralHue",
      "neutralSat",
      "radius",
    ] as const) {
      if (typeof merged[key] !== "number" || !Number.isFinite(merged[key])) {
        merged[key] = DEFAULT_THEME[key];
      }
    }
    if (!["dark", "light", "system"].includes(merged.mode)) merged.mode = DEFAULT_THEME.mode;
    return merged;
  } catch {
    return DEFAULT_THEME;
  }
};

const prefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [config, setConfigState] = useState<ThemeConfig>(readStored);
  const [systemMode, setSystemMode] = useState<ResolvedMode>(() =>
    prefersDark() ? "dark" : "light",
  );

  // Follow the OS preference while the user has "System" selected.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemMode(e.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolvedMode: ResolvedMode = config.mode === "system" ? systemMode : config.mode;
  const tokens = useMemo(() => buildTokens(config, resolvedMode), [config, resolvedMode]);

  // Paint before the browser does so switching themes never flashes the old one.
  useLayoutEffect(() => {
    const root = document.documentElement;
    applyTokens(root, tokens);
    root.classList.toggle("dark", resolvedMode === "dark");
    root.classList.toggle("light", resolvedMode === "light");
    root.style.colorScheme = resolvedMode;
  }, [tokens, resolvedMode]);

  // The taskbar's own light/dark setting (desktop), else the OS colour scheme
  // (browser tab strip), so the icon's D can contrast with what it sits on.
  const [taskbar, setTaskbar] = useState<ResolvedMode>(() => (prefersDark() ? "dark" : "light"));
  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) {
      setTaskbar(systemMode);
      return;
    }
    void desktop.getTaskbarTheme().then(setTaskbar).catch(() => {});
    return desktop.onTaskbarThemeChanged(setTaskbar);
  }, [systemMode]);

  // Repaint the app icon (window, taskbar, tray, tab) in the theme's primary
  // colour. Debounced: dragging a hue slider changes tokens on every frame.
  useEffect(() => {
    // The overlay window shares this provider but must not repaint the app icon.
    if (window.location.pathname.startsWith("/overlay")) return;
    const timer = setTimeout(() => {
      renderAppIcon(themePrimary(), taskbar === "light" ? "#111111" : "#ffffff")
        .then((png) => {
          // Browsers use the last icon link they find, so replace them all.
          document.querySelectorAll("link[rel~='icon']").forEach((el) => el.remove());
          const link = document.createElement("link");
          link.rel = "icon";
          link.type = "image/png";
          link.href = png;
          document.head.appendChild(link);
          return getDesktop()?.setAppIcon(png);
        })
        .catch(() => {
          /* keep the current icon */
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [tokens, taskbar]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Private browsing or a full quota — the theme just won't persist.
    }
  }, [config]);

  const setConfig = useCallback(
    (patch: Partial<ThemeConfig>) => setConfigState((prev) => ({ ...prev, ...patch })),
    [],
  );
  const reset = useCallback(() => setConfigState(DEFAULT_THEME), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ config, setConfig, reset, resolvedMode, tokens }),
    [config, setConfig, reset, resolvedMode, tokens],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
};
