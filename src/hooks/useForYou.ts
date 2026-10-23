import { useEffect, useState } from "react";
import type { RecommendedGame } from "@/lib/steam";
import { fetchSteamForYou } from "@/lib/steamClient";

/**
 * Upcoming games picked for the player (see fetchUpcomingForYou). Taste and
 * the coming-soon list both move slowly, so picks are kept for a day per
 * Steam account and only refetched after that.
 */

const DAY = 24 * 60 * 60 * 1000;
const cacheKey = (steamId: string) => `dsync.foryou.v2.${steamId}`;

const readCache = (steamId: string): { ts: number; games: RecommendedGame[] } | null => {
  try {
    const raw = localStorage.getItem(cacheKey(steamId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export function useForYou(steamId: string | undefined) {
  const [games, setGames] = useState<RecommendedGame[]>(() =>
    steamId ? readCache(steamId)?.games ?? [] : [],
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!steamId) {
      setGames([]);
      return;
    }
    const cached = readCache(steamId);
    if (cached) setGames(cached.games);
    if (cached && Date.now() - cached.ts < DAY) return;

    let cancelled = false;
    setLoading(true);
    fetchSteamForYou(steamId)
      .then((fresh) => {
        if (cancelled) return;
        setGames(fresh);
        try {
          localStorage.setItem(cacheKey(steamId), JSON.stringify({ ts: Date.now(), games: fresh }));
        } catch {
          /* ignore quota errors */
        }
      })
      .catch(() => {
        /* keep whatever was cached */
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [steamId]);

  return { games, loading };
}
