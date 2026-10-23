import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { HltbTimes } from "@/lib/hltb";
import { fetchHltb } from "@/lib/steamClient";
import { useCollections } from "@/hooks/useCollections";
import { useSteam } from "@/hooks/useSteam";

/**
 * HowLongToBeat times, fetched once a day.
 *
 * The first time Dsync starts on a given day, <HltbDailySync /> refreshes the
 * times for every game in the user's collections. The rest of the day the app
 * only reads what that pass saved, so browsing never hits HLTB. The one
 * exception is a game with no saved entry at all (say, from a collection
 * imported mid-day): it gets a single lookup so it isn't blank until tomorrow.
 *
 * Lookups run three at a time; a 429 from HLTB stops the pass, and since the
 * day isn't marked done, the next startup picks it up again.
 */

const entryKey = (appid: string) => `dsync.hltb.${appid}`;
const LAST_SYNC_KEY = "dsync.hltb.lastSync";

/** Local calendar date, so "first startup of the day" follows the user's clock. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Entry {
  ts: number;
  times: HltbTimes | null;
}

const readEntry = (appid: string): Entry | null => {
  try {
    const raw = localStorage.getItem(entryKey(appid));
    return raw ? (JSON.parse(raw) as Entry) : null;
  } catch {
    return null;
  }
};

// --- shared store: lets every useHltb() see results as the sync lands them ---

let version = 0;
let queued = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const writeEntry = (appid: string, times: HltbTimes | null) => {
  try {
    localStorage.setItem(entryKey(appid), JSON.stringify({ ts: Date.now(), times }));
  } catch {
    /* ignore quota errors */
  }
};

let rateLimited = false;

/** Looks up each game in turn, three at a time. Resolves false if HLTB rate limited us. */
async function lookUp(games: Array<{ id: string; title: string }>): Promise<boolean> {
  const queue = games.filter((g) => !queued.has(g.id));
  if (queue.length === 0) return !rateLimited;
  queued = new Set([...queued, ...queue.map((g) => g.id)]);
  emit();

  const worker = async () => {
    while (!rateLimited && queue.length) {
      const game = queue.shift()!;
      try {
        writeEntry(game.id, await fetchHltb(game.title));
      } catch (err) {
        if (err instanceof Error && /rate limit/i.test(err.message)) rateLimited = true;
        // Other failures (HLTB down, endpoint changed) keep the old entry.
      }
      queued.delete(game.id);
      emit();
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  for (const g of queue) queued.delete(g.id);
  emit();
  return !rateLimited;
}

let syncStarted = false;

/**
 * Mount once, inside the Steam and Collections providers. Runs the daily
 * refresh as soon as the library has loaded, then does nothing until the app
 * is next started on a new day.
 */
export const HltbDailySync = () => {
  const { library, status } = useSteam();
  const { collections } = useCollections();

  useEffect(() => {
    if (syncStarted || status !== "ready" || library.length === 0) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_SYNC_KEY);
    } catch {
      /* treat as never synced */
    }
    if (last === today()) return;
    syncStarted = true;

    const titles = new Map(library.map((g) => [g.id, g.title]));
    const ids = new Set(collections.flatMap((c) => c.gameIds));
    const games = [...ids].filter((id) => titles.has(id)).map((id) => ({ id, title: titles.get(id)! }));

    void lookUp(games).then((finished) => {
      if (!finished) return;
      try {
        localStorage.setItem(LAST_SYNC_KEY, today());
      } catch {
        /* ignore */
      }
    });
  }, [status, library, collections]);

  return null;
};

/** Saved HLTB times for these games; fetches only ones never looked up before. */
export function useHltb(games: Array<{ id: string; title: string }>) {
  const v = useSyncExternalStore(subscribe, () => version);

  // Re-run only when the set of games changes, not on every re-render.
  const signature = games.map((g) => g.id).join(",");

  useEffect(() => {
    const unseen = games.filter((g) => readEntry(g.id) === null);
    if (unseen.length && !rateLimited) void lookUp(unseen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return useMemo(() => {
    const times: Record<string, HltbTimes | null> = {};
    let pending = 0;
    for (const g of games) {
      const entry = readEntry(g.id);
      if (entry) times[g.id] = entry.times;
      if (queued.has(g.id)) pending++;
    }
    return { times, pending };
    // `v` changes whenever the store does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, v]);
}
