import {
  buildLibrary,
  buildUpcoming,
  buildWishlistNews,
  fetchCover,
  fetchGameAchievements,
  fetchLibraryGenres,
  fetchLibraryNews,
  fetchLibraryStats,
  fetchLibraryTags,
  fetchUpcomingForYou,
  fetchNewsItem,
  fetchPresence,
  fetchProfile,
  fetchWishlist,
  verifySteamLogin,
} from "../lib/steam";
import { fetchHltbTimes } from "../lib/hltb";
import { findWiki, probeWiki } from "../lib/wikiFinder";

/**
 * Transport-agnostic Steam API router.
 *
 * The Steam Web API needs a secret key and sends no CORS headers, so it can
 * only be called from a server-side context. There are two of those, and this
 * module is the single implementation both of them wrap:
 *
 *   - the Vite dev server  (vite-plugin-steam.ts, Node middleware)
 *   - the Electron desktop app (electron/main.ts, protocol.handle)
 *
 * Keeping the routing here means the desktop build serves byte-identical
 * responses on the same URLs, so nothing in src/lib/steamClient.ts has to know
 * which one it is talking to.
 */

export interface SteamRequest {
  /** Route name only, no leading slash: "profile", "library", … */
  route: string;
  method: string;
  params: URLSearchParams;
  /** Parsed JSON body, for POST routes. */
  body?: Record<string, unknown>;
}

export interface SteamResponse {
  status: number;
  body: unknown;
}

const SERVER_TTL_MS = 5 * 60 * 1000;

/**
 * Short-lived response cache plus in-flight de-duplication, so repeated
 * /library calls (reloads, several windows) don't each fire ~40 Steam
 * requests. One instance per host process.
 */
export function createSteamCache() {
  const cache = new Map<string, { ts: number; data: unknown }>();
  const inflight = new Map<string, Promise<unknown>>();

  return function cached<T>(key: string, produce: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < SERVER_TTL_MS) return Promise.resolve(hit.data as T);

    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;

    const p = produce()
      .then((data) => {
        cache.set(key, { ts: Date.now(), data });
        inflight.delete(key);
        return data;
      })
      .catch((err) => {
        inflight.delete(key);
        throw err;
      });
    inflight.set(key, p);
    return p;
  };
}

export type SteamCache = ReturnType<typeof createSteamCache>;

// Phrased to fit all three hosts: the dev server reads .env, the desktop app
// its settings file, the edge function its deployed secret.
const MISSING_KEY =
  "No Steam API key is configured. Get one at https://steamcommunity.com/dev/apikey, " +
  "then set STEAM_API_KEY (dev: .env; desktop: Settings; hosted: function secret).";

const ok = (body: unknown): SteamResponse => ({ status: 200, body });
const bad = (message: string): SteamResponse => ({ status: 400, body: { error: message } });

/**
 * Handles one Steam API request. Never throws — transport errors and upstream
 * failures both come back as a status plus a JSON body the client can render.
 */
export async function handleSteamRequest(
  req: SteamRequest,
  apiKey: string | undefined,
  cached: SteamCache,
): Promise<SteamResponse> {
  const { route, method, params, body } = req;

  if (!apiKey) return { status: 501, body: { error: MISSING_KEY } };

  const steamId = () => params.get("steamid");

  try {
    if (route === "verify" && method === "POST") {
      const verified = await verifySteamLogin(String(body?.search ?? ""));
      if (!verified) return { status: 401, body: { error: "Steam verification failed" } };
      return ok({ steamId: verified });
    }

    if (method !== "GET") return { status: 405, body: { error: "Method not allowed" } };

    switch (route) {
      case "profile": {
        const id = steamId();
        if (!id) return bad("Missing steamid");
        return ok({ profile: await cached(`profile:${id}`, () => fetchProfile(id, apiKey)) });
      }

      case "library": {
        const id = steamId();
        if (!id) return bad("Missing steamid");
        return ok(await cached(`library:${id}`, () => buildLibrary(id, apiKey)));
      }

      case "cover": {
        const appid = params.get("appid");
        if (!appid) return bad("Missing appid");
        return ok({ image: await cached(`cover:${appid}`, () => fetchCover(appid)) });
      }

      case "presence": {
        const id = steamId();
        if (!id) return bad("Missing steamid");
        // Live status — deliberately not cached.
        return ok(await fetchPresence(id, apiKey));
      }

      case "stats": {
        const id = steamId();
        if (!id) return bad("Missing steamid");
        return ok(await cached(`stats:${id}`, () => fetchLibraryStats(id, apiKey)));
      }

      case "genres": {
        const id = steamId();
        if (!id) return bad("Missing steamid");
        return ok({ genres: await cached(`genres:${id}`, () => fetchLibraryGenres(id, apiKey)) });
      }

      case "hltb": {
        const title = params.get("title")?.trim();
        if (!title) return bad("Missing title");
        try {
          return ok({ times: await cached(`hltb:${title.toLowerCase()}`, () => fetchHltbTimes(title)) });
        } catch {
          return { status: 429, body: { error: "HowLongToBeat is rate limiting; try again shortly" } };
        }
      }

      case "foryou": {
        const id = steamId();
        if (!id) return bad("Missing steamid");
        return ok({ games: await cached(`foryou:${id}`, () => fetchUpcomingForYou(id, apiKey)) });
      }

      case "wikifind": {
        const appid = params.get("appid") ?? "";
        const title = params.get("title")?.trim();
        if (!title) return bad("Missing title");
        return ok({ wiki: await cached(`wikifind:${appid}:${title}`, () => findWiki(appid, title)) });
      }

      case "wikiprobe": {
        // A wiki address the user typed: try the usual api.php locations.
        let origin: string;
        try {
          const url = new URL(params.get("url") ?? "");
          if (url.protocol !== "https:") return bad("Use an https:// address");
          origin = url.origin;
        } catch {
          return bad("Not a valid address");
        }
        for (const api of [`${origin}/api.php`, `${origin}/w/api.php`]) {
          const wiki = await probeWiki(api);
          if (wiki) return ok({ wiki });
        }
        return ok({ wiki: null });
      }

      case "tags": {
        const id = steamId();
        if (!id) return bad("Missing steamid");
        return ok(await cached(`tags:${id}`, () => fetchLibraryTags(id, apiKey)));
      }

      case "news": {
        const id = steamId();
        if (!id) return bad("Missing steamid");
        return ok({ news: await cached(`news:${id}`, () => fetchLibraryNews(id, apiKey)) });
      }

      case "wishlist-news": {
        const id = steamId();
        if (!id) return bad("Missing steamid");
        // Shared, cached enrichment so /upcoming reuses the same fetch.
        const wishlist = await cached(`wishlist:${id}`, () => fetchWishlist(id, apiKey));
        return ok({
          news: await cached(`wishlist-news:${id}`, () => buildWishlistNews(wishlist)),
        });
      }

      case "upcoming": {
        const id = steamId();
        if (!id) return bad("Missing steamid");
        const wishlist = await cached(`wishlist:${id}`, () => fetchWishlist(id, apiKey));
        return ok({ upcoming: buildUpcoming(wishlist) });
      }

      case "newsitem": {
        const appid = params.get("appid");
        const gid = params.get("gid");
        if (!appid || !gid) return bad("Missing appid or gid");
        return ok({
          item: await cached(`newsitem:${appid}:${gid}`, () => fetchNewsItem(Number(appid), gid)),
        });
      }

      case "achievements": {
        const id = steamId();
        const appid = params.get("appid");
        if (!id || !appid) return bad("Missing steamid or appid");
        // ?fresh=1 skips the cache: the in-game overlay polls for new unlocks.
        const load = () => fetchGameAchievements(id, Number(appid), apiKey);
        return ok({
          achievements: params.get("fresh") ? await load() : await cached(`ach:${id}:${appid}`, load),
        });
      }

      default:
        return { status: 404, body: { error: "Unknown Steam API route" } };
    }
  } catch (err) {
    return {
      status: 500,
      body: { error: err instanceof Error ? err.message : "Unknown error" },
    };
  }
}
