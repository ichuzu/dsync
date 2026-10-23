import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Game } from "@/types/game";
import type {
  LibraryStats,
  NewsItem,
  SteamPresence,
  SteamProfile,
  UpcomingGame,
} from "@/lib/steam";
import {
  fetchSteamGenres,
  fetchSteamLibrary,
  fetchSteamLibraryStats,
  fetchSteamNews,
  fetchSteamPresence,
  fetchSteamProfile,
  fetchSteamUpcoming,
  fetchSteamWishlistNews,
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
  /** appid → primary genre for the most-played games (computed in background). */
  genres: Record<string, string>;
  genresLoading: boolean;
  /** Recent news for the user's played games, newest-first (background). */
  news: NewsItem[];
  newsLoading: boolean;
  /** Recent news for the user's wishlisted games (background). */
  wishlistNews: NewsItem[];
  wishlistNewsLoading: boolean;
  /** Unreleased wishlist games, soonest first (background). */
  upcoming: UpcomingGame[];
  upcomingLoading: boolean;
  /** Live presence (online + in-game right now), polled while connected. */
  presence: SteamPresence | null;
  status: SteamStatus;
  /** Background re-sync in progress while cached data is still shown. */
  refreshing: boolean;
  /** Epoch ms of the last successful library sync, or null. */
  lastSynced: number | null;
  error: string | null;
  signIn: () => void | Promise<void>;
  completeLogin: (search: string) => Promise<SteamSession>;
  signOut: () => void;
  refresh: () => void;
}

import { signInWithSteam } from "@/lib/desktop";

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

const genresKey = (steamId: string) => `dsync.steam.genres.${steamId}`;
// Genres barely change, and re-resolving them is a burst of store-API calls —
// keep the cache for a week before refreshing in the background.
const GENRE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedGenres {
  ts: number;
  genres: Record<string, string>;
}

const readGenreCache = (steamId: string): CachedGenres | null => {
  try {
    const raw = localStorage.getItem(genresKey(steamId));
    return raw ? (JSON.parse(raw) as CachedGenres) : null;
  } catch {
    return null;
  }
};

const writeGenreCache = (steamId: string, genres: Record<string, string>) => {
  try {
    localStorage.setItem(genresKey(steamId), JSON.stringify({ ts: Date.now(), genres }));
  } catch {
    /* ignore */
  }
};

// Bump the version suffix to invalidate stale caches when the feed's shape or
// filtering changes (e.g. the English-only filter).
const newsKey = (steamId: string) => `dsync.steam.news.v2.${steamId}`;
// News goes stale quickly — refresh in the background after half an hour.
const NEWS_TTL_MS = 30 * 60 * 1000;

interface CachedNews {
  ts: number;
  news: NewsItem[];
}

const readNewsCache = (steamId: string): CachedNews | null => {
  try {
    const raw = localStorage.getItem(newsKey(steamId));
    return raw ? (JSON.parse(raw) as CachedNews) : null;
  } catch {
    return null;
  }
};

const writeNewsCache = (steamId: string, news: NewsItem[]) => {
  try {
    localStorage.setItem(newsKey(steamId), JSON.stringify({ ts: Date.now(), news }));
  } catch {
    /* ignore */
  }
};

// Generic timestamped cache for the wishlist-derived feeds.
const readTsCache = <T,>(key: string): { ts: number; data: T } | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { ts: number; data: T }) : null;
  } catch {
    return null;
  }
};

const writeTsCache = (key: string, data: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* ignore */
  }
};

// v2: switched from the retired store wishlistdata endpoint to the wishlist API.
const wishlistNewsKey = (steamId: string) => `dsync.steam.wishlistnews.v2.${steamId}`;
// v3: release dates now carry display text + granularity (precise vs month/year).
const upcomingCacheKey = (steamId: string) => `dsync.steam.upcoming.v3.${steamId}`;
// Upcoming release dates move slowly — a few hours between refreshes is plenty.
const UPCOMING_TTL_MS = 6 * 60 * 60 * 1000;

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
  const [genres, setGenres] = useState<Record<string, string>>(() => {
    const s = readSession();
    return s ? readGenreCache(s.steamId)?.genres ?? {} : {};
  });
  const [genresLoading, setGenresLoading] = useState(false);
  const [news, setNews] = useState<NewsItem[]>(() => {
    const s = readSession();
    return s ? readNewsCache(s.steamId)?.news ?? [] : [];
  });
  const [newsLoading, setNewsLoading] = useState(false);
  const [wishlistNews, setWishlistNews] = useState<NewsItem[]>(() => {
    const s = readSession();
    return s ? readTsCache<NewsItem[]>(wishlistNewsKey(s.steamId))?.data ?? [] : [];
  });
  const [wishlistNewsLoading, setWishlistNewsLoading] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingGame[]>(() => {
    const s = readSession();
    return s ? readTsCache<UpcomingGame[]>(upcomingCacheKey(s.steamId))?.data ?? [] : [];
  });
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [presence, setPresence] = useState<SteamPresence | null>(null);

  // Prevents duplicate concurrent fetches for the same Steam ID.
  const inFlight = useRef<string | null>(null);
  const statsInFlight = useRef<string | null>(null);
  const genresInFlight = useRef<string | null>(null);
  const newsInFlight = useRef<string | null>(null);
  const wishlistNewsInFlight = useRef<string | null>(null);
  const upcomingInFlight = useRef<string | null>(null);

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

  const loadGenres = useCallback(async (steamId: string) => {
    if (genresInFlight.current === steamId) return;
    genresInFlight.current = steamId;
    setGenresLoading(true);
    try {
      const g = await fetchSteamGenres(steamId);
      setGenres(g);
      writeGenreCache(steamId, g);
    } catch {
      /* keep cached/empty genres on failure */
    } finally {
      setGenresLoading(false);
      genresInFlight.current = null;
    }
  }, []);

  const loadNews = useCallback(async (steamId: string) => {
    if (newsInFlight.current === steamId) return;
    newsInFlight.current = steamId;
    setNewsLoading(true);
    try {
      const n = await fetchSteamNews(steamId);
      setNews(n);
      writeNewsCache(steamId, n);
    } catch {
      /* keep cached/empty news on failure */
    } finally {
      setNewsLoading(false);
      newsInFlight.current = null;
    }
  }, []);

  const loadWishlistNews = useCallback(async (steamId: string) => {
    if (wishlistNewsInFlight.current === steamId) return;
    wishlistNewsInFlight.current = steamId;
    setWishlistNewsLoading(true);
    try {
      const n = await fetchSteamWishlistNews(steamId);
      setWishlistNews(n);
      writeTsCache(wishlistNewsKey(steamId), n);
    } catch {
      /* keep cached/empty on failure */
    } finally {
      setWishlistNewsLoading(false);
      wishlistNewsInFlight.current = null;
    }
  }, []);

  const loadUpcoming = useCallback(async (steamId: string) => {
    if (upcomingInFlight.current === steamId) return;
    upcomingInFlight.current = steamId;
    setUpcomingLoading(true);
    try {
      const u = await fetchSteamUpcoming(steamId);
      setUpcoming(u);
      writeTsCache(upcomingCacheKey(steamId), u);
    } catch {
      /* keep cached/empty on failure */
    } finally {
      setUpcomingLoading(false);
      upcomingInFlight.current = null;
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
      if (
        cache.stats.started &&
        cache.stats.activity &&
        cache.stats.perGame &&
        Date.now() - cache.ts < LIBRARY_TTL_MS
      )
        return;
    }
    loadStats(steamId);
  }, [steamId, loadStats]);

  // Per-game genres: hydrate from cache, refresh in the background if stale.
  useEffect(() => {
    if (!steamId) return;
    const cache = readGenreCache(steamId);
    if (cache) {
      setGenres(cache.genres);
      if (Date.now() - cache.ts < GENRE_TTL_MS) return;
    }
    loadGenres(steamId);
  }, [steamId, loadGenres]);

  // News feed: hydrate from cache, refresh in the background if stale.
  useEffect(() => {
    if (!steamId) return;
    const cache = readNewsCache(steamId);
    if (cache) {
      setNews(cache.news);
      if (Date.now() - cache.ts < NEWS_TTL_MS) return;
    }
    loadNews(steamId);
  }, [steamId, loadNews]);

  // Wishlist news: hydrate from cache, refresh in the background if stale.
  useEffect(() => {
    if (!steamId) return;
    const cache = readTsCache<NewsItem[]>(wishlistNewsKey(steamId));
    if (cache) {
      setWishlistNews(cache.data);
      if (Date.now() - cache.ts < NEWS_TTL_MS) return;
    }
    loadWishlistNews(steamId);
  }, [steamId, loadWishlistNews]);

  // Upcoming wishlist releases: hydrate from cache, refresh if stale.
  useEffect(() => {
    if (!steamId) return;
    const cache = readTsCache<UpcomingGame[]>(upcomingCacheKey(steamId));
    if (cache) {
      setUpcoming(cache.data);
      if (Date.now() - cache.ts < UPCOMING_TTL_MS) return;
    }
    loadUpcoming(steamId);
  }, [steamId, loadUpcoming]);

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

  /**
   * Starts Steam sign-in.
   *
   * On the desktop build this hands off to the system browser and waits for the
   * verified id to come back over the loopback callback, so Steam's password
   * form is never rendered inside the app. In a browser it falls back to the
   * ordinary top-level redirect.
   */
  const signIn = useCallback(async () => {
    let id: string | null = null;
    try {
      id = await signInWithSteam();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Steam sign-in failed");
      setStatus("error");
      return;
    }

    if (!id) {
      redirectToSteamLogin(); // web: navigate away and come back to /steam-callback
      return;
    }

    setStatus("verifying");
    setError(null);
    try {
      const profile = await fetchSteamProfile(id);
      const next: SteamSession = { steamId: id, profile };
      writeSession(next);
      setSession(next); // triggers the library effect
    } catch (e) {
      setError(e instanceof Error ? e.message : "Steam sign-in failed");
      setStatus("error");
    }
  }, []);

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
        localStorage.removeItem(genresKey(session.steamId));
        localStorage.removeItem(newsKey(session.steamId));
        localStorage.removeItem(wishlistNewsKey(session.steamId));
        localStorage.removeItem(upcomingCacheKey(session.steamId));
      } catch {
        /* ignore */
      }
    }
    writeSession(null);
    setSession(null);
    setLibrary([]);
    setLibraryStats(null);
    setGenres({});
    setNews([]);
    setWishlistNews([]);
    setUpcoming([]);
    setLastSynced(null);
    setStatus("idle");
    setError(null);
  }, [session?.steamId]);

  const refresh = useCallback(() => {
    if (session?.steamId) {
      loadLibrary(session.steamId, { background: library.length > 0 });
      loadStats(session.steamId);
      loadGenres(session.steamId);
      loadNews(session.steamId);
      loadWishlistNews(session.steamId);
      loadUpcoming(session.steamId);
    }
  }, [
    session?.steamId,
    loadLibrary,
    loadStats,
    loadGenres,
    loadNews,
    loadWishlistNews,
    loadUpcoming,
    library.length,
  ]);

  // buildLibrary only enriches the top games by playtime with achievement
  // counts; the rest arrive as 0/0. The full-library stats sweep already has
  // accurate earned/total for every game, so fold those in (without an extra
  // API call) so every card shows real progress. Only fill gaps — keep the
  // richer top-game data (which also carries the rarity breakdown).
  const mergedLibrary = useMemo(() => {
    const perGame = libraryStats?.perGame;
    if (!perGame) return library;
    return library.map((g) => {
      const s = perGame[g.id];
      if (s && s.total > 0 && g.totalAchievements === 0) {
        return { ...g, earnedAchievements: s.earned, totalAchievements: s.total };
      }
      return g;
    });
  }, [library, libraryStats]);

  const value: SteamContextValue = {
    connected: Boolean(session),
    profile: session?.profile ?? null,
    library: mergedLibrary,
    libraryStats,
    statsLoading,
    genres,
    genresLoading,
    news,
    newsLoading,
    wishlistNews,
    wishlistNewsLoading,
    upcoming,
    upcomingLoading,
    presence,
    status,
    refreshing,
    lastSynced,
    error,
    signIn,
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
