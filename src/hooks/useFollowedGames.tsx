import { useCallback, useState } from "react";

/**
 * The set of games whose news the user wants to follow, persisted locally.
 * Until the user customizes it, `followed` is null — callers should fall back
 * to a sensible default (e.g. recently-played games).
 */
const KEY = "dsync.followed.games";

const read = (): string[] | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : null;
  } catch {
    return null;
  }
};

export const useFollowedGames = () => {
  const [followed, setFollowedState] = useState<string[] | null>(read);

  const setFollowed = useCallback((ids: string[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* ignore quota errors */
    }
    setFollowedState(ids);
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setFollowedState(null);
  }, []);

  return { followed, setFollowed, reset, isCustom: followed !== null };
};
