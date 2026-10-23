import type { Plugin, Connect } from "vite";
import type { ServerResponse } from "node:http";
import { createSteamCache, handleSteamRequest } from "./src/server/steamRouter";

/**
 * Dev-only Steam API: an HTTP adapter over the shared router in
 * src/server/steamRouter.ts, mounted on the Vite dev server so the secret
 * STEAM_API_KEY stays server-side and we sidestep the Steam Web API's lack
 * of CORS.
 *
 * The desktop build serves these same routes from the Electron main process
 * (electron/main.ts) and the deployed web build from a Supabase edge function,
 * all three sharing that one router.
 *
 *   POST /api/steam/verify   { search: "<openid query string>" }  -> { steamId }
 *   GET  /api/steam/profile?steamid=...                            -> { profile }
 *   GET  /api/steam/library?steamid=...                            -> { profile, games }
 */
export function steamApi(options: { apiKey?: string }): Plugin {
  const apiKey = options.apiKey?.trim();
  const cached = createSteamCache();

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };

  const readJson = (req: Connect.IncomingMessage): Promise<Record<string, unknown>> =>
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
        const url = new URL(req.url ?? "", "http://localhost");
        const method = req.method ?? "GET";

        const { status, body } = await handleSteamRequest(
          {
            route: url.pathname.replace(/^\/+/, ""),
            method,
            params: url.searchParams,
            body: method === "POST" ? await readJson(req) : undefined,
          },
          apiKey,
          cached,
        );

        send(res, status, body);
      });
    },
  };
}
