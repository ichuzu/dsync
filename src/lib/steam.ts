/**
 * Steam Web API integration — fetching + parsing.
 *
 * Runtime-agnostic: depends only on the global `fetch`, so the same code runs
 * in the Vite dev middleware (Node) and could run in any server runtime.
 * It must NOT run in the browser — the Steam Web API needs a secret key and
 * does not send CORS headers. Call it from a server (see vite-plugin-steam.ts).
 *
 * Endpoints used (https://steamcommunity.com/dev, https://partner.steamgames.com/doc/webapi):
 *  - ISteamUser/GetPlayerSummaries/v2
 *  - IPlayerService/GetOwnedGames/v1
 *  - ISteamUserStats/GetPlayerAchievements/v1
 *  - ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2
 */
import type { Achievement, Game, Rarity, RarityBreakdown } from "../types/game";

const STEAM_API = "https://api.steampowered.com";
const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps";

export interface SteamProfile {
  steamId: string;
  name: string;
  avatar: string;
  profileUrl: string;
  realName?: string;
  /** Account creation date (YYYY-MM-DD), if public. */
  createdAt?: string;
}

export interface SteamPresence {
  /** 0 offline · 1 online · 2 busy · 3 away · 4 snooze · 5/6 trading/playing. */
  personaState: number;
  inGame: boolean;
  gameId?: string;
  gameName?: string;
}

export interface SteamLibrary {
  profile: SteamProfile | null;
  games: Game[];
}

const emptyBreakdown = (): RarityBreakdown => ({
  common: 0,
  uncommon: 0,
  rare: 0,
  epic: 0,
  legendary: 0,
});

/** Map a Steam global unlock percentage to a rarity tier (lower = rarer). */
export const rarityFromPercent = (percent: number): Rarity => {
  if (percent < 2) return "legendary";
  if (percent < 5) return "epic";
  if (percent < 10) return "rare";
  if (percent < 30) return "uncommon";
  return "common";
};

/** Pull the 64-bit Steam ID out of an OpenID `claimed_id` URL. */
export const parseSteamId = (claimedId: string): string | null => {
  const match = claimedId.match(/(\d{17})$/);
  return match ? match[1] : null;
};

/**
 * Verify a returned OpenID assertion by replaying it to Steam with
 * mode=check_authentication. Only a genuine, untampered assertion yields
 * `is_valid:true` — this is what stops a forged claimed_id. Returns the
 * verified Steam ID, or null if invalid.
 */
export async function verifySteamLogin(
  search: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const incoming = new URLSearchParams(search);
  if (incoming.get("openid.mode") !== "id_res") return null;

  const claimedId = incoming.get("openid.claimed_id");
  const steamId = claimedId ? parseSteamId(claimedId) : null;
  if (!steamId) return null;

  const body = new URLSearchParams();
  incoming.forEach((value, key) => {
    if (key.startsWith("openid.")) body.set(key, value);
  });
  body.set("openid.mode", "check_authentication");

  const res = await fetchImpl(STEAM_OPENID, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  return /is_valid\s*:\s*true/i.test(text) ? steamId : null;
}

export async function fetchProfile(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SteamProfile | null> {
  const url = `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`;
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const data = await res.json();
  const player = data?.response?.players?.[0];
  if (!player) return null;
  return {
    steamId: player.steamid,
    name: player.personaname ?? `Player ${steamId.slice(-5)}`,
    avatar: player.avatarfull ?? "",
    profileUrl: player.profileurl ?? "",
    realName: player.realname,
    createdAt: player.timecreated ? toIsoDate(player.timecreated) : undefined,
  };
}

/**
 * Resolve a cover image via the store API for games whose art isn't at the
 * predictable CDN path (e.g. unreleased titles use a hashed asset URL).
 * Returns the store header image, or null. Must run server-side (CORS).
 */
export async function fetchCover(
  appid: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`,
    );
    if (!res.ok) return null;
    const app = (await res.json())?.[appid];
    if (!app?.success) return null;
    return app.data?.header_image || app.data?.capsule_image || null;
  } catch {
    return null;
  }
}

/**
 * Primary genre for one app, via the public store API. Genre isn't part of the
 * owned-games payload, so it needs a separate per-app lookup. Returns "" when
 * unknown (delisted app, no genre listed, or a transient error). Server-side.
 */
export async function fetchGenre(
  appid: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  try {
    const res = await fetchImpl(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`,
    );
    if (!res.ok) return "";
    const app = (await res.json())?.[appid];
    if (!app?.success) return "";
    const genres = app.data?.genres;
    return Array.isArray(genres) && genres.length
      ? String(genres[0]?.description ?? "")
      : "";
  } catch {
    return "";
  }
}

/** Live presence: whether the player is online and in a game right now. */
export async function fetchPresence(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SteamPresence> {
  const url = `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return { personaState: 0, inGame: false };
    const player = (await res.json())?.response?.players?.[0];
    if (!player) return { personaState: 0, inGame: false };
    return {
      personaState: player.personastate ?? 0,
      inGame: Boolean(player.gameid),
      gameId: player.gameid ? String(player.gameid) : undefined,
      gameName: player.gameextrainfo,
    };
  } catch {
    return { personaState: 0, inGame: false };
  }
}

interface OwnedGame {
  appid: number;
  name: string;
  playtime_forever?: number;
  playtime_2weeks?: number;
  rtime_last_played?: number;
  has_community_visible_stats?: boolean;
}

async function fetchOwnedGames(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<OwnedGame[]> {
  const url =
    `${STEAM_API}/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}` +
    `&include_appinfo=1&include_played_free_games=1&format=json`;
  const res = await fetchImpl(url);
  // A rejected key must not look like an empty library: the UI would blame
  // the user's privacy settings for what is really a revoked/rerolled key.
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Steam rejected the API key (it may have been revoked or regenerated). " +
        "Get a new one at steamcommunity.com/dev/apikey and update it in Settings.",
    );
  }
  if (!res.ok) throw new Error(`Steam returned an error (${res.status}). Try again in a minute.`);
  const data = await res.json();
  return (data?.response?.games as OwnedGame[]) ?? [];
}

/** Per-game achievements for this player: which are unlocked. */
async function fetchPlayerAchievements(
  steamId: string,
  appid: number,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<Array<{ apiname: string; achieved: number; unlocktime?: number }>> {
  const url = `${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${steamId}&appid=${appid}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.playerstats?.success) return [];
    return data.playerstats.achievements ?? [];
  } catch {
    return [];
  }
}

/** Global unlock percentage per achievement (no key required). */
async function fetchGlobalPercentages(
  appid: number,
  fetchImpl: typeof fetch,
): Promise<Map<string, number>> {
  const url = `${STEAM_API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`;
  const map = new Map<string, number>();
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return map;
    const data = await res.json();
    const list = data?.achievementpercentages?.achievements ?? [];
    for (const a of list) map.set(a.name, Number(a.percent) || 0);
  } catch {
    /* ignore — game may have no global stats */
  }
  return map;
}

const toIsoDate = (unixSeconds?: number): string | undefined =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString().slice(0, 10) : undefined;

const coverUrl = (appid: number) => `${STEAM_CDN}/${appid}/library_600x900.jpg`;

function baseGame(g: OwnedGame): Game {
  return {
    id: String(g.appid),
    title: g.name,
    genre: "",
    launcher: "steam",
    coverImage: coverUrl(g.appid),
    earnedAchievements: 0,
    totalAchievements: 0,
    playtimeHours: Math.round((g.playtime_forever ?? 0) / 60),
    recentPlaytimeHours: (g.playtime_2weeks ?? 0) / 60,
    rarityBreakdown: emptyBreakdown(),
    lastPlayed: toIsoDate(g.rtime_last_played),
    synced: true,
  };
}

/** Enrich one game with achievement counts + rarity from the user's unlocks. */
async function enrichWithAchievements(
  game: Game,
  appid: number,
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<Game> {
  const [achievements, globals] = await Promise.all([
    fetchPlayerAchievements(steamId, appid, apiKey, fetchImpl),
    fetchGlobalPercentages(appid, fetchImpl),
  ]);
  if (achievements.length === 0) return game;

  const breakdown = emptyBreakdown();
  let earned = 0;
  for (const a of achievements) {
    if (a.achieved === 1) {
      earned += 1;
      const tier = rarityFromPercent(globals.get(a.apiname) ?? 50);
      breakdown[tier] += 1;
    }
  }
  return {
    ...game,
    totalAchievements: achievements.length,
    earnedAchievements: earned,
    rarityBreakdown: breakdown,
  };
}

/**
 * Fetch the full, individual achievement list for one game: display name,
 * description, icon, unlock state/date, and global rarity. Combines the game
 * schema (names/icons), the player's unlocks, and global unlock percentages.
 * Fetched on demand (e.g. when a game's detail view opens), not for the whole
 * library up front.
 */
export async function fetchGameAchievements(
  steamId: string,
  appid: number,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Achievement[]> {
  const getJson = async (url: string) => {
    try {
      const res = await fetchImpl(url);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };

  const [playerData, schemaData, globals, fullData] = await Promise.all([
    getJson(
      `${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${steamId}&appid=${appid}&l=english`,
    ),
    getJson(`${STEAM_API}/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appid}`),
    fetchGlobalPercentages(appid, fetchImpl),
    // The schema leaves hidden achievements' descriptions blank; this newer
    // endpoint (no key needed) includes them.
    getJson(`${STEAM_API}/IPlayerService/GetGameAchievements/v1/?appid=${appid}&language=english`),
  ]);
  const fullDescriptions = new Map<string, string>();
  for (const a of fullData?.response?.achievements ?? []) {
    if (a?.internal_name && a.localized_desc) fullDescriptions.set(String(a.internal_name), String(a.localized_desc));
  }

  const playerList = playerData?.playerstats?.achievements ?? [];
  const playerMap = new Map<
    string,
    { achieved: number; unlocktime: number; name?: string; description?: string }
  >();
  for (const a of playerList) playerMap.set(a.apiname, a);

  const schema = schemaData?.game?.availableGameStats?.achievements ?? [];

  // Prefer the schema (it has icons + display names); fall back to whatever the
  // player endpoint returned if the schema is unavailable.
  const source: Array<{
    apiname: string;
    displayName: string;
    description: string;
    icon: string;
    icongray: string;
    hidden: boolean;
  }> = schema.length
    ? schema.map((s: Record<string, unknown>) => ({
        apiname: String(s.name ?? ""),
        displayName: String(s.displayName ?? s.name ?? ""),
        description: String(s.description ?? ""),
        icon: String(s.icon ?? ""),
        icongray: String(s.icongray ?? ""),
        hidden: Number(s.hidden) === 1,
      }))
    : playerList.map((a: Record<string, unknown>) => ({
        apiname: String(a.apiname ?? ""),
        displayName: String(a.name ?? a.apiname ?? ""),
        description: String(a.description ?? ""),
        icon: "",
        icongray: "",
        hidden: false,
      }));

  const list: Achievement[] = source.map((s) => {
    const player = playerMap.get(s.apiname);
    const unlocked = player?.achieved === 1;
    const hasPct = globals.has(s.apiname);
    const pct = hasPct ? (globals.get(s.apiname) as number) : 0;
    return {
      id: s.apiname,
      name: s.displayName || s.apiname,
      description:
        s.description ||
        fullDescriptions.get(s.apiname) ||
        (s.hidden && !unlocked ? "Hidden — unlock to reveal" : ""),
      rarity: rarityFromPercent(hasPct ? pct : 50),
      globalUnlockPct: pct,
      unlocked,
      unlockedDate: unlocked ? toIsoDate(player?.unlocktime) : undefined,
      icon: unlocked ? s.icon || s.icongray : s.icongray || s.icon,
      hidden: s.hidden,
    };
  });

  // Unlocked first (most recent first); locked after, rarest first.
  list.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked) return (b.unlockedDate ?? "").localeCompare(a.unlockedDate ?? "");
    return a.globalUnlockPct - b.globalUnlockPct;
  });

  return list;
}

export interface LibraryStats {
  totalGames: number;
  gamesWithAchievements: number;
  totalUnlocked: number;
  totalAchievements: number;
  perfectGames: number;
  /** Mean of per-game completion percentages (0–100). */
  avgCompletion: number;
  /** appid → unlocked/total counts, for every game with achievements. Lets the
      library cards show accurate progress without a separate per-game fetch. */
  perGame: Record<string, { earned: number; total: number }>;
  /** appid → earliest achievement-unlock date (YYYY-MM-DD) ≈ when you started. */
  started: Record<string, string>;
  /** Per-day, per-game achievement-unlock counts (for the activity heatmap). */
  activity: Array<{ d: string; appid: string; n: number }>;
}

/** Run an async mapper over items with a bounded number of concurrent workers. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

/**
 * Accurate library-wide achievement stats across EVERY game that has
 * achievements — not just the most-played few. One lightweight player-
 * achievements call per stat-enabled game (concurrency-bounded), so it's
 * heavier than buildLibrary; run it in the background and cache the result.
 */
export async function fetchLibraryStats(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LibraryStats> {
  const owned = await fetchOwnedGames(steamId, apiKey, fetchImpl);
  const statGames = owned.filter((g) => g.has_community_visible_stats);

  const perGame = await mapLimit(statGames, 12, async (g) => {
    const achievements = await fetchPlayerAchievements(steamId, g.appid, apiKey, fetchImpl);
    if (achievements.length === 0) return null;
    const unlocked = achievements.filter((a) => a.achieved === 1);
    const unlockTimes = unlocked
      .map((a) => a.unlocktime ?? 0)
      .filter((t) => t > 0);
    // Unlocks per day, for the activity heatmap.
    const days: Record<string, number> = {};
    for (const t of unlockTimes) {
      const d = toIsoDate(t) as string;
      days[d] = (days[d] ?? 0) + 1;
    }
    return {
      appid: g.appid,
      earned: unlocked.length,
      total: achievements.length,
      startedUnix: unlockTimes.length ? Math.min(...unlockTimes) : undefined,
      days,
    };
  });

  type PerGame = {
    appid: number;
    earned: number;
    total: number;
    startedUnix?: number;
    days: Record<string, number>;
  };
  const valid = perGame.filter((x) => x !== null) as PerGame[];
  const totalUnlocked = valid.reduce((sum, x) => sum + x.earned, 0);
  const totalAchievements = valid.reduce((sum, x) => sum + x.total, 0);
  const perfectGames = valid.filter((x) => x.total > 0 && x.earned === x.total).length;
  const avgCompletion =
    valid.length === 0
      ? 0
      : valid.reduce((sum, x) => sum + (x.total ? (x.earned / x.total) * 100 : 0), 0) /
        valid.length;

  const started: Record<string, string> = {};
  const activity: Array<{ d: string; appid: string; n: number }> = [];
  const perGameCounts: Record<string, { earned: number; total: number }> = {};
  for (const x of valid) {
    perGameCounts[String(x.appid)] = { earned: x.earned, total: x.total };
    if (x.startedUnix) started[String(x.appid)] = toIsoDate(x.startedUnix) as string;
    for (const [d, n] of Object.entries(x.days)) {
      activity.push({ d, appid: String(x.appid), n });
    }
  }

  return {
    totalGames: owned.length,
    gamesWithAchievements: valid.length,
    totalUnlocked,
    totalAchievements,
    perfectGames,
    avgCompletion,
    perGame: perGameCounts,
    started,
    activity,
  };
}

/**
 * Resolve the primary genre for the user's most-played games, keyed by appid.
 * Genre comes from one store lookup per app, so this is bounded to the top
 * `max` games by playtime (which cover essentially all playtime anyway) and
 * runs with low concurrency to respect the store API's rate limits. Run in the
 * background and cache the result. Apps with no resolvable genre are omitted.
 */
export async function fetchLibraryGenres(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  options: { max?: number } = {},
): Promise<Record<string, string>> {
  const max = options.max ?? 100;
  const owned = await fetchOwnedGames(steamId, apiKey, fetchImpl);
  const targets = owned
    .filter((g) => (g.playtime_forever ?? 0) > 0)
    .sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0))
    .slice(0, max);

  const pairs = await mapLimit(targets, 5, async (g) => {
    const genre = await fetchGenre(g.appid, fetchImpl);
    return [String(g.appid), genre] as const;
  });

  const out: Record<string, string> = {};
  for (const [appid, genre] of pairs) if (genre) out[appid] = genre;
  return out;
}

export interface LibraryTags {
  /** appid → the store tag ids Steam shows for it (top 20, most-voted first). */
  tags: Record<string, number[]>;
  /** tag id → English name, for describing a dynamic collection's rule. */
  names: Record<string, string>;
}

/**
 * Store tags for the given apps (top 20 each, most-voted first).
 * IStoreBrowseService needs no key; batches of 100 keep the GET URL well
 * under length limits.
 */
async function fetchStoreTags(
  appids: number[],
  fetchImpl: typeof fetch,
): Promise<Record<string, number[]>> {
  const batches: number[][] = [];
  for (let i = 0; i < appids.length; i += 100) batches.push(appids.slice(i, i + 100));

  const tags: Record<string, number[]> = {};
  await mapLimit(batches, 4, async (batch) => {
    const input = {
      ids: batch.map((appid) => ({ appid })),
      context: { language: "english", country_code: "US" },
      data_request: { include_tag_count: 20 },
    };
    try {
      const res = await fetchImpl(
        `${STEAM_API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      for (const item of data?.response?.store_items ?? []) {
        if (item?.appid && Array.isArray(item.tagids)) tags[String(item.appid)] = item.tagids;
      }
    } catch {
      /* a failed batch just leaves those games untagged */
    }
  });
  return tags;
}

/** tag id → English name. Cosmetic, so failures give an empty map. */
async function fetchTagNames(fetchImpl: typeof fetch): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  try {
    const res = await fetchImpl(`${STEAM_API}/IStoreService/GetTagList/v1/?language=english`);
    const data = res.ok ? await res.json() : null;
    for (const t of data?.response?.tags ?? []) names[String(t.tagid)] = t.name;
  } catch {
    /* names are cosmetic */
  }
  return names;
}

/**
 * Store tags for every owned game, which is what the Steam client's dynamic
 * collections filter on (~10 calls for 900 games).
 */
export async function fetchLibraryTags(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LibraryTags> {
  const owned = await fetchOwnedGames(steamId, apiKey, fetchImpl);
  const [tags, names] = await Promise.all([
    fetchStoreTags(owned.map((g) => g.appid), fetchImpl),
    fetchTagNames(fetchImpl),
  ]);
  return { tags, names };
}

/** An upcoming game picked for the player, with the tags that earned it a place. */
export interface RecommendedGame extends UpcomingGame {
  /** Up to two tag names, strongest first: why it was picked. */
  reasons: string[];
}

/**
 * How much more an hour played in the last two weeks counts than an hour
 * from any time. At 4, 20 recent hours outweigh a 1,000-hour game from years
 * ago, while long-time favourites still count.
 */
const RECENT_BOOST = 4;

/** Format/meta tags: they say how a game is played or sold, not what it is. */
const META_TAGS = new Set([
  "Singleplayer", "Multiplayer", "Co-op", "Online Co-Op", "Local Co-Op", "Local Multiplayer",
  "PvP", "Online PvP", "PvE", "Massively Multiplayer", "Action", "Adventure", "Indie",
  "Casual", "Early Access", "Free to Play", "3D", "2D", "Great Soundtrack", "Atmospheric",
  "Colorful", "Cute", "First-Person", "Third Person", "Realistic", "Controller", "Family Friendly",
  "Stylized", "Fantasy", "Sci-fi", "Funny", "Simulation", "Strategy", "RPG",
]);

/** Adult-content tags: games carrying any of these are never suggested. */
const ADULT_TAGS = new Set(["Sexual Content", "Nudity", "NSFW", "Hentai", "Mature"]);

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Steam's coming_soon_display says how much of the date is real. */
function releaseFrom(release: {
  steam_release_date?: number;
  coming_soon_display?: string;
} | undefined): Pick<UpcomingGame, "releaseDate" | "releaseString" | "precise"> {
  const unix = release?.steam_release_date ?? 0;
  const display = release?.coming_soon_display ?? "";
  if (!unix || display === "text_comingsoon" || display === "text_tba") {
    return { releaseDate: 0, releaseString: "Coming soon", precise: false };
  }
  const d = new Date(unix * 1000);
  const year = d.getUTCFullYear();
  if (display === "date_full") {
    return {
      releaseDate: unix,
      releaseString: d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }),
      precise: true,
    };
  }
  if (display === "date_month") return { releaseDate: unix, releaseString: `${MONTH_NAMES[d.getUTCMonth()]} ${year}`, precise: false };
  if (display === "date_quarter") return { releaseDate: unix, releaseString: `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${year}`, precise: false };
  return { releaseDate: unix, releaseString: String(year), precise: false };
}

/**
 * Upcoming releases the player is likely to want, from what they actually play.
 *
 *   1. Taste: the store tags of the games they play, each game weighted by
 *      log hours (so one 2,000-hour game doesn't drown out everything else)
 *      and each tag by its rank on that game. The last two weeks of play
 *      count RECENT_BOOST times as much as all-time hours, so picks follow
 *      what they're into now.
 *   2. Pool: Steam's most popular coming-soon games (a few hundred).
 *   3. Score each pool game by the taste weight of its tags, scaled by how
 *      rare the tag is within the pool, so common tags count for little and
 *      "Souls-like" for a lot. Tags that describe format rather than genre
 *      (Multiplayer, Singleplayer, Indie, …) are ignored outright, and the
 *      result is weighted toward the pool's more popular, dated games.
 *
 * Owned and wishlisted games are left out; the wishlist has its own entries.
 */
export async function fetchUpcomingForYou(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  options: { limit?: number } = {},
): Promise<RecommendedGame[]> {
  const owned = await fetchOwnedGames(steamId, apiKey, fetchImpl);
  const weightOf = (g: OwnedGame) =>
    Math.log2(1 + (g.playtime_forever ?? 0) / 60) +
    RECENT_BOOST * Math.log2(1 + (g.playtime_2weeks ?? 0) / 60);
  const played = owned
    .filter((g) => (g.playtime_forever ?? 0) >= 60 || (g.playtime_2weeks ?? 0) > 0)
    .map((g) => ({ ...g, weight: weightOf(g) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 150);

  const [playedTags, names, wishlist, pool] = await Promise.all([
    fetchStoreTags(played.map((g) => g.appid), fetchImpl),
    fetchTagNames(fetchImpl),
    fetchWishlistAppids(steamId, apiKey, fetchImpl).catch(() => [] as number[]),
    fetchComingSoonPool(fetchImpl),
  ]);

  const rank = (i: number) => (20 - Math.min(i, 19)) / 20;

  const taste = new Map<number, number>();
  for (const g of played) {
    const weight = g.weight;
    (playedTags[String(g.appid)] ?? []).forEach((tag, i) =>
      taste.set(tag, (taste.get(tag) ?? 0) + weight * rank(i)),
    );
  }

  // Pool order is Steam's popularity order; halve a game's weight every ~100 places.
  const popularity = new Map(pool.map((item, i) => [item.appid, 1 / (1 + i / 100)]));
  const isMeta = (tag: number) => META_TAGS.has(names[String(tag)] ?? "");

  const df = new Map<number, number>();
  for (const item of pool) for (const tag of item.tagids) df.set(tag, (df.get(tag) ?? 0) + 1);
  const idf = (tag: number) => Math.log((pool.length + 1) / ((df.get(tag) ?? 0) + 1));

  const skip = new Set([...owned.map((g) => g.appid), ...wishlist]);
  const isAdult = (item: PoolItem) => item.tagids.some((tag) => ADULT_TAGS.has(names[String(tag)] ?? ""));
  const scored = pool
    .filter((item) => !skip.has(item.appid) && !isAdult(item))
    .map((item) => {
      const contributions = item.tagids.map((tag, i) => ({
        tag,
        value: isMeta(tag) ? 0 : (taste.get(tag) ?? 0) * idf(tag) * rank(i),
      }));
      const dated = releaseFrom(item.release).releaseDate > 0 ? 1.25 : 1;
      return {
        item,
        score:
          contributions.reduce((sum, c) => sum + c.value, 0) *
          (popularity.get(item.appid) ?? 0) *
          dated,
        reasons: contributions
          .filter((c) => c.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 2)
          .map((c) => names[String(c.tag)])
          .filter(Boolean),
      };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 30);

  return scored.map(({ item, reasons }) => ({
    appid: item.appid,
    name: item.name,
    ...releaseFrom(item.release),
    reasons,
  }));
}

interface PoolItem {
  appid: number;
  name: string;
  tagids: number[];
  release?: { steam_release_date?: number; coming_soon_display?: string };
}

/** Steam's most popular unreleased games (sort 11 is the store's popularity order). */
async function fetchComingSoonPool(fetchImpl: typeof fetch, size = 400): Promise<PoolItem[]> {
  const pages = Array.from({ length: Math.ceil(size / 100) }, (_, i) => i * 100);
  const results = await mapLimit(pages, 4, async (start) => {
    const input = {
      query: {
        start,
        count: 100,
        sort: 11,
        filters: {
          released_only: false,
          coming_soon_only: true,
          type_filters: { include_games: true },
        },
      },
      context: { language: "english", country_code: "US" },
      data_request: { include_basic_info: true, include_release: true, include_tag_count: 20 },
    };
    try {
      const res = await fetchImpl(
        `${STEAM_API}/IStoreQueryService/Query/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
      );
      if (!res.ok) return [];
      const data = await res.json();
      return ((data?.response?.store_items ?? []) as PoolItem[]).filter(
        (item) => item?.appid && item.name && Array.isArray(item.tagids),
      );
    } catch {
      return [];
    }
  });
  const seen = new Set<number>();
  return results.flat().filter((item) => !seen.has(item.appid) && seen.add(item.appid));
}

export interface NewsItem {
  gid: string;
  appid: number;
  /** Title of the game this news item belongs to. */
  game: string;
  title: string;
  url: string;
  author?: string;
  /** Body, truncated server-side; may contain BBCode/HTML. */
  contents: string;
  /** Publish time, unix seconds. */
  date: number;
  feedlabel?: string;
}

/**
 * Steam's news API has no reliable language filter — a game's feed mixes
 * localized posts (Russian, Chinese, …). Treat a headline as English-ish when
 * fewer than ~30% of its letters fall outside the Latin blocks, which drops
 * Cyrillic/CJK/etc. announcements while keeping ordinary English ones.
 */
const looksEnglish = (text: string): boolean => {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (!letters) return false;
  const nonLatin = (letters.match(/[^\u0020-\u024f]/g) ?? []).length;
  return nonLatin / letters.length < 0.3;
};

/** Strip BBCode/HTML so the language check sees real words, not markup. */
const stripMarkup = (raw: string): string =>
  raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Backstop for external press feeds (e.g. gamemag.ru) whose headline is just an
 * English game name but whose body is foreign-language: block clearly
 * non-English source TLDs outright.
 */
const NON_ENGLISH_TLDS = new Set([
  "ru", "by", "ua", "kz", "cn", "jp", "kr", "tw", "hk", "th", "vn",
]);

const isNonEnglishSource = (url: string): boolean => {
  try {
    const host = new URL(url).hostname;
    const tld = host.slice(host.lastIndexOf(".") + 1).toLowerCase();
    return NON_ENGLISH_TLDS.has(tld);
  } catch {
    return false;
  }
};

/** Recent news/announcements for one app (Steam News API — no key needed). */
async function fetchGameNews(
  appid: number,
  count: number,
  fetchImpl: typeof fetch,
): Promise<Omit<NewsItem, "game">[]> {
  const url =
    `${STEAM_API}/ISteamNews/GetNewsForApp/v2/?appid=${appid}` +
    `&count=${count}&maxlength=400&format=json`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return [];
    const data = await res.json();
    const list = data?.appnews?.newsitems ?? [];
    return list.map((n: Record<string, unknown>) => ({
      gid: String(n.gid ?? ""),
      appid: Number(n.appid) || appid,
      title: String(n.title ?? ""),
      url: String(n.url ?? ""),
      author: n.author ? String(n.author) : undefined,
      contents: String(n.contents ?? ""),
      date: Number(n.date) || 0,
      feedlabel: n.feedlabel ? String(n.feedlabel) : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch + merge recent news for a set of games, newest-first, keeping only
 * English-language items. Shared by the library and wishlist feeds.
 */
async function aggregateNews(
  targets: Array<{ appid: number; name: string }>,
  perGame: number,
  limit: number,
  fetchImpl: typeof fetch,
): Promise<NewsItem[]> {
  const nameById = new Map(targets.map((t) => [t.appid, t.name]));
  const lists = await mapLimit(targets, 6, (g) =>
    fetchGameNews(g.appid, perGame, fetchImpl),
  );

  const items: NewsItem[] = [];
  for (const list of lists) {
    for (const it of list) {
      if (isNonEnglishSource(it.url)) continue;
      // Check title and body: external press often has an English game name as
      // the title but a foreign-language body.
      const body = stripMarkup(it.contents);
      if (!looksEnglish(it.title) || !looksEnglish(`${it.title} ${body}`)) continue;
      items.push({ ...it, game: nameById.get(it.appid) ?? `App ${it.appid}` });
    }
  }
  items.sort((a, b) => b.date - a.date);
  return items.slice(0, limit);
}

/**
 * A personalized news feed: recent announcements for the user's most-played
 * games, merged newest-first. Bounded to the top `maxGames` by playtime to keep
 * the number of Steam calls in check. Run in the background and cache.
 */
export async function fetchLibraryNews(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  options: { maxGames?: number; perGame?: number; limit?: number } = {},
): Promise<NewsItem[]> {
  const maxGames = options.maxGames ?? 50;
  const owned = await fetchOwnedGames(steamId, apiKey, fetchImpl);
  const targets = owned
    .filter((g) => (g.playtime_forever ?? 0) > 0)
    .sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0))
    .slice(0, maxGames)
    .map((g) => ({ appid: g.appid, name: g.name }));

  return aggregateNews(targets, options.perGame ?? 3, options.limit ?? 80, fetchImpl);
}

export interface WishlistGame {
  appid: number;
  name: string;
  /** Sort key: unix seconds (best-effort); 0 if undated (TBA). */
  releaseDate: number;
  /** Raw Steam display text ("8 Jun, 2026", "July 2026", "Q1 2026", …). */
  releaseString: string;
  /** True only when Steam gives a day-level date (so a day countdown is valid). */
  precise: boolean;
  /** Not yet released (Steam "Coming soon" flag). */
  comingSoon: boolean;
}

/**
 * Parse Steam's release display string into a sort timestamp + a granularity
 * flag. Day-level dates ("8 Jun, 2026") are `precise`; month/year ones get a
 * representative timestamp but aren't precise (so we never fake a day
 * countdown); vague text ("Q1 2026", "Coming soon") yields 0 / not precise.
 */
const parseRelease = (raw: string): { unix: number; precise: boolean } => {
  const s = (raw || "").trim();
  if (!s) return { unix: 0, precise: false };

  const dayLevel =
    /^\d{1,2}\s+[A-Za-z]+,?\s+\d{4}$/.test(s) || // "8 Jun, 2026"
    /^[A-Za-z]+\s+\d{1,2},?\s+\d{4}$/.test(s); // "Jun 8, 2026"
  if (dayLevel) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return { unix: Math.floor(t / 1000), precise: true };
  }

  const month = s.match(/^([A-Za-z]+)\s+(\d{4})$/); // "July 2026"
  if (month) {
    const t = Date.parse(`1 ${month[1]} ${month[2]}`);
    if (!Number.isNaN(t)) return { unix: Math.floor(t / 1000), precise: false };
  }

  const year = s.match(/^(\d{4})$/); // "2026" → mid-year as a sort midpoint
  if (year) {
    const t = Date.parse(`1 Jul ${year[1]}`);
    if (!Number.isNaN(t)) return { unix: Math.floor(t / 1000), precise: false };
  }

  return { unix: 0, precise: false }; // "Q1 2026", "Coming soon", "TBA", …
};

/**
 * Wishlisted appids via the current wishlist API (the old store `wishlistdata`
 * endpoint was retired in 2025). Needs a key; readable only when the user's
 * game details are public. Returns [] otherwise.
 */
async function fetchWishlistAppids(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<number[]> {
  const url = `${STEAM_API}/IWishlistService/GetWishlist/v1/?key=${apiKey}&steamid=${steamId}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.response?.items ?? [];
    return items.map((i: Record<string, unknown>) => Number(i.appid)).filter(Boolean);
  } catch {
    return [];
  }
}

/** Name + release info for one app (lean appdetails filter). */
async function fetchAppSummary(
  appid: number,
  fetchImpl: typeof fetch,
): Promise<{
  name: string;
  comingSoon: boolean;
  releaseUnix: number;
  releaseString: string;
  precise: boolean;
}> {
  const empty = { name: "", comingSoon: false, releaseUnix: 0, releaseString: "", precise: false };
  try {
    const res = await fetchImpl(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic,release_date&l=english`,
    );
    if (!res.ok) return empty;
    const app = (await res.json())?.[appid];
    if (!app?.success) return empty;
    const data = app.data ?? {};
    const rd = data.release_date ?? {};
    const releaseString = String(rd.date ?? "");
    const { unix, precise } = parseRelease(releaseString);
    return {
      name: String(data.name ?? ""),
      comingSoon: Boolean(rd.coming_soon),
      releaseUnix: unix,
      releaseString,
      precise,
    };
  } catch {
    return empty;
  }
}

/**
 * The user's wishlist, enriched with name + release info. One appdetails call
 * per app (concurrency-bounded, capped), so it's heavy — cache the result.
 */
export async function fetchWishlist(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  options: { max?: number } = {},
): Promise<WishlistGame[]> {
  const appids = (await fetchWishlistAppids(steamId, apiKey, fetchImpl)).slice(
    0,
    options.max ?? 120,
  );
  return mapLimit(appids, 5, async (appid) => {
    const s = await fetchAppSummary(appid, fetchImpl);
    return {
      appid,
      name: s.name || `App ${appid}`,
      releaseDate: s.releaseUnix,
      releaseString: s.releaseString,
      precise: s.precise,
      comingSoon: s.comingSoon,
    };
  });
}

/** Recent English news for games on an already-fetched wishlist, newest-first. */
export async function buildWishlistNews(
  wishlist: WishlistGame[],
  fetchImpl: typeof fetch = fetch,
  options: { maxGames?: number; perGame?: number; limit?: number } = {},
): Promise<NewsItem[]> {
  const targets = wishlist
    .slice(0, options.maxGames ?? 40)
    .map((g) => ({ appid: g.appid, name: g.name }));
  return aggregateNews(targets, options.perGame ?? 3, options.limit ?? 60, fetchImpl);
}

export interface UpcomingGame {
  appid: number;
  name: string;
  /** Sort key: unix seconds (best-effort); 0 if undated (TBA). */
  releaseDate: number;
  /** Raw Steam display text ("July 2026", "Q1 2026", …). */
  releaseString: string;
  /** True only for day-level dates (so a day countdown is meaningful). */
  precise: boolean;
}

/** Unreleased wishlist games, soonest release first (TBA last). Pure transform. */
export function buildUpcoming(
  wishlist: WishlistGame[],
  options: { limit?: number } = {},
): UpcomingGame[] {
  const nowSec = Date.now() / 1000;
  return wishlist
    .filter((g) => g.comingSoon || g.releaseDate > nowSec)
    .sort((a, b) => (a.releaseDate || Infinity) - (b.releaseDate || Infinity))
    .slice(0, options.limit ?? 24)
    .map((g) => ({
      appid: g.appid,
      name: g.name,
      releaseDate: g.releaseDate,
      releaseString: g.releaseString,
      precise: g.precise,
    }));
}

/**
 * Full, untruncated content for a single news item. The Steam API has no
 * fetch-by-gid, so we pull a recent batch for the app and find the match. The
 * `game` field is left blank — the caller already knows it from the feed.
 */
export async function fetchNewsItem(
  appid: number,
  gid: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NewsItem | null> {
  const url =
    `${STEAM_API}/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=50&format=json`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const data = await res.json();
    const list = data?.appnews?.newsitems ?? [];
    const n = list.find((x: Record<string, unknown>) => String(x.gid) === String(gid));
    if (!n) return null;
    return {
      gid: String(n.gid ?? gid),
      appid: Number(n.appid) || appid,
      game: "",
      title: String(n.title ?? ""),
      url: String(n.url ?? ""),
      author: n.author ? String(n.author) : undefined,
      contents: String(n.contents ?? ""),
      date: Number(n.date) || 0,
      feedlabel: n.feedlabel ? String(n.feedlabel) : undefined,
    };
  } catch {
    return null;
  }
}

export interface BuildLibraryOptions {
  /** How many games (by playtime) to enrich with achievement detail. */
  enrichTop?: number;
}

/**
 * Fetch a user's full Steam library and parse it into the app's Game model.
 * Achievement detail is fetched only for the top `enrichTop` games by playtime
 * to bound the number of Steam API calls; the rest are returned without it.
 */
export async function buildLibrary(
  steamId: string,
  apiKey: string,
  options: BuildLibraryOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<SteamLibrary> {
  const enrichTop = options.enrichTop ?? 20;

  const [profile, owned] = await Promise.all([
    fetchProfile(steamId, apiKey, fetchImpl),
    fetchOwnedGames(steamId, apiKey, fetchImpl),
  ]);

  const sorted = [...owned].sort(
    (a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0),
  );

  const games = await Promise.all(
    sorted.map(async (g, index) => {
      const base = baseGame(g);
      if (index < enrichTop && g.has_community_visible_stats) {
        return enrichWithAchievements(base, g.appid, steamId, apiKey, fetchImpl);
      }
      return base;
    }),
  );

  return { profile, games };
}
