import type { Achievement, Game } from "@/types/game";
import type { HltbTimes } from "@/lib/hltb";
import type { FoundWiki } from "@/lib/wikiFinder";
import type { GuideTip } from "@/lib/achievementGuides";
import type {
  LibraryStats,
  LibraryTags,
  RecommendedGame,
  NewsItem,
  SteamPresence,
  SteamProfile,
  UpcomingGame,
} from "@/lib/steam";

/**
 * Browser-side client for our server Steam API. In dev these routes are served
 * by the Vite middleware (vite-plugin-steam.ts); in production point
 * VITE_STEAM_API_BASE at the deployed Supabase edge function.
 */
const BASE = import.meta.env.VITE_STEAM_API_BASE || "/api/steam";

async function asJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

/** Begin Steam OpenID login by redirecting to steamcommunity.com. */
export function redirectToSteamLogin() {
  const realm = window.location.origin;
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${realm}/steam-callback`,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  window.location.href = `https://steamcommunity.com/openid/login?${params.toString()}`;
}

/** Verify the OpenID assertion returned to /steam-callback. */
export async function verifySteamLogin(search: string): Promise<string> {
  const res = await fetch(`${BASE}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ search }),
  });
  const { steamId } = await asJson(res);
  return steamId;
}

export async function fetchSteamProfile(steamId: string): Promise<SteamProfile | null> {
  const res = await fetch(`${BASE}/profile?steamid=${encodeURIComponent(steamId)}`);
  const { profile } = await asJson(res);
  return profile;
}

export async function fetchSteamLibrary(
  steamId: string,
): Promise<{ profile: SteamProfile | null; games: Game[] }> {
  const res = await fetch(`${BASE}/library?steamid=${encodeURIComponent(steamId)}`);
  return asJson(res);
}

export async function fetchSteamLibraryStats(steamId: string): Promise<LibraryStats> {
  const res = await fetch(`${BASE}/stats?steamid=${encodeURIComponent(steamId)}`);
  return asJson(res);
}

/** Primary genre per appid for the user's most-played games (server-computed). */
export async function fetchSteamGenres(
  steamId: string,
): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/genres?steamid=${encodeURIComponent(steamId)}`);
  const { genres } = await asJson(res);
  return genres ?? {};
}

/** Personalized news feed: recent announcements for the user's played games. */
export async function fetchSteamNews(steamId: string): Promise<NewsItem[]> {
  const res = await fetch(`${BASE}/news?steamid=${encodeURIComponent(steamId)}`);
  const { news } = await asJson(res);
  return news ?? [];
}

/** Recent English news for games on the user's wishlist. */
export async function fetchSteamWishlistNews(steamId: string): Promise<NewsItem[]> {
  const res = await fetch(`${BASE}/wishlist-news?steamid=${encodeURIComponent(steamId)}`);
  const { news } = await asJson(res);
  return news ?? [];
}

/** Unreleased wishlist games, soonest first. */
export async function fetchSteamUpcoming(steamId: string): Promise<UpcomingGame[]> {
  const res = await fetch(`${BASE}/upcoming?steamid=${encodeURIComponent(steamId)}`);
  const { upcoming } = await asJson(res);
  return upcoming ?? [];
}

/** Full, untruncated content for one news item (for the in-app reader). */
export async function fetchSteamNewsItem(
  appid: string | number,
  gid: string,
): Promise<NewsItem | null> {
  const res = await fetch(
    `${BASE}/newsitem?appid=${encodeURIComponent(String(appid))}&gid=${encodeURIComponent(gid)}`,
  );
  const { item } = await asJson(res);
  return item ?? null;
}

export async function fetchSteamPresence(steamId: string): Promise<SteamPresence> {
  const res = await fetch(`${BASE}/presence?steamid=${encodeURIComponent(steamId)}`);
  return asJson(res);
}

/**
 * HowLongToBeat times for a title, or null when HLTB has no close match.
 * Throws on rate limiting (429) so the caller retries later instead of
 * remembering a miss.
 */
export async function fetchHltb(title: string): Promise<HltbTimes | null> {
  const res = await fetch(`${BASE}/hltb?title=${encodeURIComponent(title)}`);
  const { times } = await asJson(res);
  return times ?? null;
}

/** The community wiki for a game, or null if none was found. */
export async function fetchFindWiki(appid: string, title: string): Promise<FoundWiki | null> {
  const res = await fetch(`${BASE}/wikifind?appid=${encodeURIComponent(appid)}&title=${encodeURIComponent(title)}`);
  const { wiki } = await asJson(res);
  return wiki ?? null;
}

/** Checks a wiki address the user typed; null if it isn't a MediaWiki. */
export async function fetchProbeWiki(url: string): Promise<FoundWiki | null> {
  const res = await fetch(`${BASE}/wikiprobe?url=${encodeURIComponent(url)}`);
  const { wiki } = await asJson(res);
  return wiki ?? null;
}

/** The player's Steam profile background image, or null if none is equipped. */
export async function fetchSteamProfileBackground(steamId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/background?steamid=${encodeURIComponent(steamId)}`);
    return (await asJson(res)).background ?? null;
  } catch {
    return null;
  }
}

/** Written help for an achievement from the game's Steam Community guides. */
export async function fetchSteamAchievementTips(appid: string, name: string): Promise<GuideTip[]> {
  const res = await fetch(`${BASE}/achievementtips?appid=${encodeURIComponent(appid)}&name=${encodeURIComponent(name)}`);
  const { tips } = await asJson(res);
  return tips ?? [];
}

/** Upcoming games picked from what the player plays. */
export async function fetchSteamForYou(steamId: string): Promise<RecommendedGame[]> {
  const res = await fetch(`${BASE}/foryou?steamid=${encodeURIComponent(steamId)}`);
  const { games } = await asJson(res);
  return games ?? [];
}

/** Store tags for every owned game, for evaluating dynamic collections. */
export async function fetchSteamLibraryTags(steamId: string): Promise<LibraryTags> {
  const res = await fetch(`${BASE}/tags?steamid=${encodeURIComponent(steamId)}`);
  return asJson(res);
}

export async function fetchSteamCover(appid: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/cover?appid=${encodeURIComponent(appid)}`);
    const { image } = await asJson(res);
    return image ?? null;
  } catch {
    return null;
  }
}

export async function fetchSteamAchievements(
  steamId: string,
  appid: string,
  options: { fresh?: boolean } = {},
): Promise<Achievement[]> {
  const res = await fetch(
    `${BASE}/achievements?steamid=${encodeURIComponent(steamId)}&appid=${encodeURIComponent(appid)}${options.fresh ? "&fresh=1" : ""}`,
  );
  const { achievements } = await asJson(res);
  return achievements ?? [];
}
