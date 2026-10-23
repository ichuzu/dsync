/**
 * HowLongToBeat lookup.
 *
 * HLTB has no public API. This calls the same two endpoints its own search
 * page uses (the approach the "HLTB for Deck" Decky plugin takes too):
 *
 *   GET  /api/search/site/init  -> { token }
 *   POST /api/search/site       (x-auth-token: token) -> { data: [game…] }
 *
 * It's an undocumented contract and HLTB changes it every so often, so every
 * failure here resolves to null and callers fall back to other estimates.
 * Runs server-side only (dev middleware / Electron main): HLTB sends no CORS
 * headers.
 */

const HLTB = "https://howlongtobeat.com";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Referer: `${HLTB}/`,
  Origin: HLTB,
};

export interface HltbTimes {
  hltbId: number;
  name: string;
  /** Hours; 0 when HLTB has no submissions for that category. */
  main: number;
  extras: number;
  complete: number;
  url: string;
}

let token: string | null = null;

async function refreshToken(fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(`${HLTB}/api/search/site/init?t=${Date.now()}`, { headers: HEADERS });
    token = res.ok ? ((await res.json())?.token ?? null) : null;
  } catch {
    token = null;
  }
  return token;
}

/** Lowercase, no ™/®/punctuation, collapsed spaces: "ELDEN RING™" -> "elden ring". */
export const normaliseTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Steam titles carry store dressing HLTB leaves off: "Grand Theft Auto III -
 * The Definitive Edition", "KINGDOM HEARTS III + Re Mind (DLC)",
 * "Disney/Pixar Toy Story 3 Complete Edition". Used for a second search when
 * the full title finds nothing.
 */
export const baseTitle = (title: string): string =>
  title
    .replace(/[™®©]/g, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+\+\s+.*$/, "")
    .replace(/\s+[-–:]\s+[^-–:]*\b(edition|remaster(ed)?|version|cut)\b.*$/i, "")
    .replace(/\b(the\s+)?(definitive|complete|deluxe|ultimate|enhanced|anniversary|special|goty|game of the year|gold|premium)(\s+edition)?\s*$/i, "")
    .replace(/^(disney\s*\/?\s*pixar|disney|marvel'?s?|tom clancy'?s)\s+/i, "")
    .trim();

/** Dice coefficient on character bigrams, 0–1. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const grams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  const total = Math.max(1, a.length - 1 + b.length - 1);
  return (2 * overlap) / total;
}

interface RawGame {
  game_id: number;
  game_name: string;
  game_alias?: string;
  comp_main: number;
  comp_plus: number;
  comp_100: number;
}

async function search(title: string, fetchImpl: typeof fetch, retried = false): Promise<RawGame[] | null> {
  const auth = token ?? (await refreshToken(fetchImpl));
  if (!auth) return null;

  const body = {
    searchType: "games",
    searchTerms: title.split(" "),
    searchPage: 1,
    size: 10,
    searchOptions: {
      games: {
        userId: 0,
        platform: "",
        sortCategory: "popular",
        rangeCategory: "main",
        rangeTime: { min: null, max: null },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        rangeYear: { min: "", max: "" },
        modifier: "",
      },
      users: { sortCategory: "postcount" },
      lists: { sortCategory: "follows" },
      filter: "",
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };

  const res = await fetchImpl(`${HLTB}/api/search/site`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json", "x-auth-token": auth },
    body: JSON.stringify(body),
  });
  // An expired token is a 403; HLTB's own page refreshes once and retries.
  if (res.status === 403 && !retried) {
    token = null;
    return search(title, fetchImpl, true);
  }
  if (res.status === 429) throw new Error("rate-limited");
  if (!res.ok) return null;
  return ((await res.json())?.data as RawGame[]) ?? [];
}

/**
 * Best HLTB match for a Steam title, or null if nothing is close enough.
 * Throws only on rate limiting, so the caller can back off and retry later
 * rather than caching a miss.
 */
export async function fetchHltbTimes(title: string, fetchImpl: typeof fetch = fetch): Promise<HltbTimes | null> {
  const full = await lookup(normaliseTitle(title), fetchImpl);
  if (full) return full;
  const base = normaliseTitle(baseTitle(title));
  return base && base !== normaliseTitle(title) ? lookup(base, fetchImpl) : null;
}

async function lookup(wanted: string, fetchImpl: typeof fetch): Promise<HltbTimes | null> {
  if (!wanted) return null;

  let results: RawGame[] | null;
  try {
    results = await search(wanted, fetchImpl);
  } catch (err) {
    if (err instanceof Error && err.message === "rate-limited") throw err;
    return null;
  }
  if (!results?.length) return null;

  let best: { game: RawGame; score: number } | null = null;
  for (const game of results) {
    const score = Math.max(
      similarity(wanted, normaliseTitle(game.game_name)),
      game.game_alias ? similarity(wanted, normaliseTitle(game.game_alias)) : 0,
    );
    if (!best || score > best.score) best = { game, score };
  }
  // Below this it's usually a different game in the same series.
  if (!best || best.score < 0.75) return null;

  const hours = (seconds: number) => Math.round((seconds / 3600) * 10) / 10;
  return {
    hltbId: best.game.game_id,
    name: best.game.game_name,
    main: hours(best.game.comp_main),
    extras: hours(best.game.comp_plus),
    complete: hours(best.game.comp_100),
    url: `${HLTB}/game/${best.game.game_id}`,
  };
}
