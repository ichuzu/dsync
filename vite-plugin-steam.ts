import type { Plugin, Connect } from "vite";
import type { ServerResponse } from "node:http";
import {
  buildLibrary,
  fetchCover,
  fetchGameAchievements,
  fetchLibraryStats,
  fetchPresence,
  fetchProfile,
  verifySteamLogin,
} from "./src/lib/steam";

/**
 * Dev-only Steam API. Serves /api/steam/* from the Vite dev server (Node), so
 * the secret STEAM_API_KEY stays server-side and we sidestep the Steam Web
 * API's lack of CORS. In production these routes are served by the Supabase
 * edge function instead (see supabase/functions/steam-auth).
 *
 *   POST /api/steam/verify   { search: "<openid query string>" }  -> { steamId }
 *   GET  /api/steam/profile?steamid=...                            -> { profile }
 *   GET  /api/steam/library?steamid=...                            -> { profile, games }
 */
export function steamApi(options: { apiKey?: string }): Plugin {
  const apiKey = options.apiKey?.trim();

  // Short-lived server cache + in-flight de-dupe so repeated /library calls
  // (reloads, multiple tabs) don't each fire ~40 Steam API requests.
  const SERVER_TTL_MS = 5 * 60 * 1000;
  const cache = new Map<string, { ts: number; data: unknown }>();
  const inflight = new Map<string, Promise<unknown>>();

  const cached = <T>(key: string, produce: () => Promise<T>): Promise<T> => {
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

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };

  const readJson = (req: Connect.IncomingMessage): Promise<any> =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
    });

  return {
    name: "dsync-steam-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/steam", async (req, res) => {
        try {
          const url = new URL(req.url ?? "", "http://localhost");
          const route = url.pathname.replace(/^\/+/, ""); // "verify" | "profile" | "library"

          if (!apiKey) {
            return send(res, 501, {
              error:
                "STEAM_API_KEY is not set. Add it to .env (get one at https://steamcommunity.com/dev/apikey) and restart the dev server.",
            });
          }

          if (route === "verify" && req.method === "POST") {
            const { search } = await readJson(req);
            const steamId = await verifySteamLogin(String(search ?? ""));
            if (!steamId) return send(res, 401, { error: "Steam verification failed" });
            return send(res, 200, { steamId });
          }

          if (route === "profile" && req.method === "GET") {
            const steamId = url.searchParams.get("steamid");
            if (!steamId) return send(res, 400, { error: "Missing steamid" });
            const profile = await cached(`profile:${steamId}`, () =>
              fetchProfile(steamId, apiKey),
            );
            return send(res, 200, { profile });
          }

          if (route === "library" && req.method === "GET") {
            const steamId = url.searchParams.get("steamid");
            if (!steamId) return send(res, 400, { error: "Missing steamid" });
            const library = await cached(`library:${steamId}`, () =>
              buildLibrary(steamId, apiKey),
            );
            return send(res, 200, library);
          }

          if (route === "cover" && req.method === "GET") {
            const appid = url.searchParams.get("appid");
            if (!appid) return send(res, 400, { error: "Missing appid" });
            const image = await cached(`cover:${appid}`, () => fetchCover(appid));
            return send(res, 200, { image });
          }

          if (route === "presence" && req.method === "GET") {
            const steamId = url.searchParams.get("steamid");
            if (!steamId) return send(res, 400, { error: "Missing steamid" });
            // Live status — not cached.
            return send(res, 200, await fetchPresence(steamId, apiKey));
          }

          if (route === "stats" && req.method === "GET") {
            const steamId = url.searchParams.get("steamid");
            if (!steamId) return send(res, 400, { error: "Missing steamid" });
            const stats = await cached(`stats:${steamId}`, () =>
              fetchLibraryStats(steamId, apiKey),
            );
            return send(res, 200, stats);
          }

          if (route === "achievements" && req.method === "GET") {
            const steamId = url.searchParams.get("steamid");
            const appid = url.searchParams.get("appid");
            if (!steamId || !appid) {
              return send(res, 400, { error: "Missing steamid or appid" });
            }
            const achievements = await cached(`ach:${steamId}:${appid}`, () =>
              fetchGameAchievements(steamId, Number(appid), apiKey),
            );
            return send(res, 200, { achievements });
          }

          return send(res, 404, { error: "Unknown Steam API route" });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return send(res, 500, { error: message });
        }
      });
    },
  };
}
