import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Game } from "@/types/game";
import type { LibraryStats, SteamPresence, SteamProfile } from "@/lib/steam";
import {
  fetchSteamLibrary,
  fetchSteamLibraryStats,
  fetchSteamPresence,
  fetchSteamProfile,
  redirectToSteamLogin,
  verifySteamLogin,
} from "@/lib/steamClient";

type SteamStatus = "idle" | "verifying" | "loading" | "ready" | "error";

interface SteamSession {
  steamId: string;
  profile: SteamProfile | null;
}

interface SteamContextValue {
  connected: boolean;
  profile: SteamProfile | null;
  library: Game[];
  /** Accurate whole-library achievement stats (computed in the background). */
  libraryStats: LibraryStats | null;
  statsLoading: boolean;
  /** Live presence (online + in-game right now), polled while connected. */
  presence: SteamPresence | null;
  status: SteamStatus;
  /** Background re-sync in progress while cached data is still shown. */
  refreshing: boolean;
  /** Epoch ms of the last successful library sync, or null. */
  lastSynced: number | null;
  error: string | null;
  signIn: () => void;
  completeLogin: (search: string) => Promise<SteamSession>;
  signOut: () => void;
  refresh: () => void;
}

const SESSION_KEY = "dsync.steam.session";
const libraryKey = (steamId: string) => `dsync.steam.library.${steamId}`;
// Treat a cached library as fresh within this window — no refetch on reload.
const LIBRARY_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedLibrary {
  ts: number;
  games: Game[];
}

const readSession = (): SteamSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SteamSession) : null;
  } catch {
    return null;
  }
};

const writeSession = (session: SteamSession | null) => {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
};

const readLibraryCache = (steamId: string): CachedLibrary | null => {
  try {
    const raw = localStorage.getItem(libraryKey(steamId));
    return raw ? (JSON.parse(raw) as CachedLibrary) : null;
  } catch {
    return null;
  }
};

const writeLibraryCache = (steamId: string, games: Game[]) => {
  try {
    localStorage.setItem(
      libraryKey(steamId),
      JSON.stringify({ ts: Date.now(), games } satisfies CachedLibrary),
    );
  } catch {
    /* quota errors are non-fatal — we just lose the cache */
  }
};

const statsKey = (steamId: string) => `dsync.steam.stats.${steamId}`;

interface CachedStats {
  ts: number;
  stats: LibraryStats;
}

const readStatsCache = (steamId: string): CachedStats | null => {
  try {
    const raw = localStorage.getItem(statsKey(steamId));
    return raw ? (JSON.parse(raw) as CachedStats) : null;
  } catch {
    return null;
  }
};

const writeStatsCache = (steamId: string, stats: LibraryStats) => {
  try {
    localStorage.setItem(statsKey(steamId), JSON.stringify({ ts: Date.now(), stats }));
  } catch {
    /* ignore */
  }
};

const SteamContext = createContext<SteamContextValue | null>(null);

export const SteamProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<SteamSession | null>(readSession);
  const [library, setLibrary] = useState<Game[]>(() => {
    const s = readSession();
    return s ? readLibraryCache(s.steamId)?.games ?? [] : [];
  });
  const [lastSynced, setLastSynced] = useState<number | null>(() => {
    const s = readSession();
    return s ? readLibraryCache(s.steamId)?.ts ?? null : null;
  });
  const [status, setStatus] = useState<SteamStatus>(() => {
    const s = readSession();
    if (!s) return "idle";
    const cache = readLibraryCache(s.steamId);
    return cache && Date.now() - cache.ts < LIBRARY_TTL_MS ? "ready" : "loading";
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryStats, setLibraryStats] = useState<LibraryStats | null>(() => {
    const s = readSession();
    return s ? readStatsCache(s.steamId)?.stats ?? null : null;
  });
  const [statsLoading, setStatsLoading] = useState(false);
  const [presence, setPresence] = useState<SteamPresence | null>(null);

  // Prevents duplicate concurrent fetches for the same Steam ID.
  const inFlight = useRef<string | null>(null);
  const statsInFlight = useRef<string | null>(null);

  const loadStats = useCallback(async (steamId: string) => {
    if (statsInFlight.current === steamId) return;
    statsInFlight.current = steamId;
    setStatsLoading(true);
    try {
      const s = await fetchSteamLibraryStats(steamId);
      setLibraryStats(s);
      writeStatsCache(steamId, s);
    } catch {
      /* keep cached/empty stats on failure */
    } finally {
      setStatsLoading(false);
      statsInFlight.current = null;
    }
  }, []);

  const loadLibrary = useCallback(
    async (steamId: string, opts: { background?: boolean } = {}) => {
      if (inFlight.current === steamId) return;
      inFlight.current = steamId;
      if (opts.background) setRefreshing(true);
      else setStatus("loading");
      setError(null);
      try {
        const { games } = await fetchSteamLibrary(steamId);
        setLibrary(games);
        setLastSynced(Date.now());
        writeLibraryCache(steamId, games);
        setStatus("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load Steam library");
        // On a background refresh, keep showing cached data instead of erroring.
        if (!opts.background) setStatus("error");
      } finally {
        setRefreshing(false);
        inFlight.current = null;
      }
    },
    [],
  );

  // When a Steam ID appears (restored or freshly logged in), serve the cache
  // and only hit the network if it's missing or stale.
  const steamId = session?.steamId;
  useEffect(() => {
    if (!steamId) return;
    const cache = readLibraryCache(steamId);
    if (cache) {
      setLibrary(cache.games);
      setLastSynced(cache.ts);
      // Force a refresh if the cache predates the recentPlaytimeHours field.
      const preMigration =
        cache.games.length > 0 && cache.games[0].recentPlaytimeHours === undefined;
      if (!preMigration && Date.now() - cache.ts < LIBRARY_TTL_MS) {
        setStatus("ready");
        return; // fresh cache — no refetch
      }
      // Stale or pre-migration: keep showing cached games, refresh in background.
      loadLibrary(steamId, { background: true });
      return;
    }
    loadLibrary(steamId);
  }, [steamId, loadLibrary]);

  // Whole-library stats: hydrate from cache, refresh in the background if stale.
  useEffect(() => {
    if (!steamId) return;
    const cache = readStatsCache(steamId);
    if (cache) {
      setLibraryStats(cache.stats);
      // Refetch if fresh-but-missing newer fields (cache migration).
      if (cache.stats.started && cache.stats.activity && Date.now() - cache.ts < LIBRARY_TTL_MS)
        return;
    }
    loadStats(steamId);
  }, [steamId, loadStats]);

  // Live presence — poll every 60s while connected.
  useEffect(() => {
    if (!steamId) {
      setPresence(null);
      return;
    }
    let active = true;
    const poll = () =>
      fetchSteamPresence(steamId)
        .then((p) => active && setPresence(p))
        .catch(() => {});
    poll();
    const id = setInterval(poll, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [steamId]);

  const completeLogin = useCallback(async (search: string) => {
    setStatus("verifying");
    setError(null);
    try {
      const id = await verifySteamLogin(search);
      const profile = await fetchSteamProfile(id);
      const next: SteamSession = { steamId: id, profile };
      writeSession(next);
      setSession(next); // triggers the library effect
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Steam sign-in failed");
      setStatus("error");
      throw e;
    }
  }, []);

  const signOut = useCallback(() => {
    if (session?.steamId) {
      try {
        localStorage.removeItem(libraryKey(session.steamId));
        localStorage.removeItem(statsKey(session.steamId));
      } catch {
        /* ignore */
      }
    }
    writeSession(null);
    setSession(null);
    setLibrary([]);
    setLibraryStats(null);
    setLastSynced(null);
    setStatus("idle");
    setError(null);
  }, [session?.steamId]);

  const refresh = useCallback(() => {
    if (session?.steamId) {
      loadLibrary(session.steamId, { background: library.length > 0 });
      loadStats(session.steamId);
    }
  }, [session?.steamId, loadLibrary, loadStats, library.length]);

  const value: SteamContextValue = {
    connected: Boolean(session),
    profile: session?.profile ?? null,
    library,
    libraryStats,
    statsLoading,
    presence,
    status,
    refreshing,
    lastSynced,
    error,
    signIn: redirectToSteamLogin,
    completeLogin,
    signOut,
    refresh,
  };

  return <SteamContext.Provider value={value}>{children}</SteamContext.Provider>;
};

export const useSteam = (): SteamContextValue => {
  const ctx = useContext(SteamContext);
  if (!ctx) throw new Error("useSteam must be used within a SteamProvider");
  return ctx;
};
