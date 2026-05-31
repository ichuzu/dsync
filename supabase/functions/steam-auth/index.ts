import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Production Steam Web API proxy (mirror of the dev-only vite-plugin-steam).
 * Keeps STEAM_API_KEY server-side and sidesteps the Steam API's lack of CORS.
 *
 * Routes (path suffix after the function name):
 *   POST .../steam-auth/verify   { search }            -> { steamId }
 *   GET  .../steam-auth/profile?steamid=...            -> { profile }
 *   GET  .../steam-auth/library?steamid=...            -> { profile, games }
 *
 * Set the key once with:  supabase secrets set STEAM_API_KEY=xxxx
 */
const STEAM_API = "https://api.steampowered.com";
const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps";

const apiKey = Deno.env.get("STEAM_API_KEY") ?? "";

// Per-instance cache + in-flight de-dupe (helps while the function stays warm).
const SERVER_TTL_MS = 5 * 60 * 1000;
const cacheStore = new Map<string, { ts: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

function cached<T>(key: string, produce: () => Promise<T>): Promise<T> {
  const hit = cacheStore.get(key);
  if (hit && Date.now() - hit.ts < SERVER_TTL_MS) return Promise.resolve(hit.data as T);
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = produce()
    .then((data) => {
      cacheStore.set(key, { ts: Date.now(), data });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, p);
  return p;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const emptyBreakdown = () => ({ common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 });

const rarityFromPercent = (p: number) =>
  p < 2 ? "legendary" : p < 5 ? "epic" : p < 10 ? "rare" : p < 30 ? "uncommon" : "common";

const parseSteamId = (claimedId: string) => claimedId.match(/(\d{17})$/)?.[1] ?? null;

async function verifySteamLogin(search: string): Promise<string | null> {
  const incoming = new URLSearchParams(search);
  if (incoming.get("openid.mode") !== "id_res") return null;
  const steamId = parseSteamId(incoming.get("openid.claimed_id") ?? "");
  if (!steamId) return null;

  const body = new URLSearchParams();
  incoming.forEach((v, k) => k.startsWith("openid.") && body.set(k, v));
  body.set("openid.mode", "check_authentication");
  const res = await fetch(STEAM_OPENID, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return /is_valid\s*:\s*true/i.test(await res.text()) ? steamId : null;
}

async function fetchProfile(steamId: string) {
  const res = await fetch(
    `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`,
  );
  if (!res.ok) return null;
  const p = (await res.json())?.response?.players?.[0];
  if (!p) return null;
  return {
    steamId: p.steamid,
    name: p.personaname ?? `Player ${steamId.slice(-5)}`,
    avatar: p.avatarfull ?? "",
    profileUrl: p.profileurl ?? "",
    realName: p.realname,
    createdAt: p.timecreated
      ? new Date(p.timecreated * 1000).toISOString().slice(0, 10)
      : undefined,
  };
}

async function fetchCover(appid: string) {
  try {
    const res = await fetch(
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

async function fetchPresence(steamId: string) {
  try {
    const res = await fetch(
      `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`,
    );
    if (!res.ok) return { personaState: 0, inGame: false };
    const p = (await res.json())?.response?.players?.[0];
    if (!p) return { personaState: 0, inGame: false };
    return {
      personaState: p.personastate ?? 0,
      inGame: Boolean(p.gameid),
      gameId: p.gameid ? String(p.gameid) : undefined,
      gameName: p.gameextrainfo,
    };
  } catch {
    return { personaState: 0, inGame: false };
  }
}

async function buildLibrary(steamId: string, enrichTop = 20) {
  const profile = await fetchProfile(steamId);
  const ownedRes = await fetch(
    `${STEAM_API}/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}` +
      `&include_appinfo=1&include_played_free_games=1&format=json`,
  );
  const owned = ownedRes.ok ? (await ownedRes.json())?.response?.games ?? [] : [];
  const sorted = [...owned].sort(
    (a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0),
  );

  const games = await Promise.all(
    sorted.map(async (g, index) => {
      const base = {
        id: String(g.appid),
        title: g.name,
        genre: "",
        launcher: "steam",
        coverImage: `${STEAM_CDN}/${g.appid}/library_600x900.jpg`,
        earnedAchievements: 0,
        totalAchievements: 0,
        playtimeHours: Math.round((g.playtime_forever ?? 0) / 60),
        recentPlaytimeHours: (g.playtime_2weeks ?? 0) / 60,
        rarityBreakdown: emptyBreakdown(),
        lastPlayed: g.rtime_last_played
          ? new Date(g.rtime_last_played * 1000).toISOString().slice(0, 10)
          : undefined,
        synced: true,
      };
      if (index >= enrichTop || !g.has_community_visible_stats) return base;

      try {
        const [aRes, pRes] = await Promise.all([
          fetch(
            `${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${steamId}&appid=${g.appid}`,
          ),
          fetch(
            `${STEAM_API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${g.appid}`,
          ),
        ]);
        const stats = aRes.ok ? await aRes.json() : null;
        if (!stats?.playerstats?.success) return base;
        const achievements = stats.playerstats.achievements ?? [];
        const globals = new Map<string, number>();
        if (pRes.ok) {
          for (const a of (await pRes.json())?.achievementpercentages?.achievements ?? [])
            globals.set(a.name, Number(a.percent) || 0);
        }
        const breakdown = emptyBreakdown();
        let earned = 0;
        for (const a of achievements) {
          if (a.achieved === 1) {
            earned += 1;
            breakdown[rarityFromPercent(globals.get(a.apiname) ?? 50)] += 1;
          }
        }
        return {
          ...base,
          totalAchievements: achievements.length,
          earnedAchievements: earned,
          rarityBreakdown: breakdown,
        };
      } catch {
        return base;
      }
    }),
  );

  return { profile, games };
}

async function fetchGameAchievements(steamId: string, appid: number) {
  const getJson = async (url: string) => {
    try {
      const r = await fetch(url);
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };

  const [playerData, schemaData, pctRes] = await Promise.all([
    getJson(
      `${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${steamId}&appid=${appid}&l=english`,
    ),
    getJson(`${STEAM_API}/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appid}`),
    getJson(`${STEAM_API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`),
  ]);

  const playerList = playerData?.playerstats?.achievements ?? [];
  const playerMap = new Map<string, { achieved: number; unlocktime: number }>();
  for (const a of playerList) playerMap.set(a.apiname, a);

  const globals = new Map<string, number>();
  for (const a of pctRes?.achievementpercentages?.achievements ?? [])
    globals.set(a.name, Number(a.percent) || 0);

  const schema = schemaData?.game?.availableGameStats?.achievements ?? [];
  const source = schema.length
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

  const list = source.map((s) => {
    const p = playerMap.get(s.apiname);
    const unlocked = p?.achieved === 1;
    const hasPct = globals.has(s.apiname);
    const pct = hasPct ? (globals.get(s.apiname) as number) : 0;
    return {
      id: s.apiname,
      name: s.displayName || s.apiname,
      description: s.description || (s.hidden && !unlocked ? "Hidden — unlock to reveal" : ""),
      rarity: rarityFromPercent(hasPct ? pct : 50),
      globalUnlockPct: pct,
      unlocked,
      unlockedDate:
        unlocked && p?.unlocktime
          ? new Date(p.unlocktime * 1000).toISOString().slice(0, 10)
          : undefined,
      icon: unlocked ? s.icon || s.icongray : s.icongray || s.icon,
      hidden: s.hidden,
    };
  });

  list.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked) return (b.unlockedDate ?? "").localeCompare(a.unlockedDate ?? "");
    return a.globalUnlockPct - b.globalUnlockPct;
  });

  return list;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function fetchLibraryStats(steamId: string) {
  const ownedRes = await fetch(
    `${STEAM_API}/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}` +
      `&include_appinfo=1&include_played_free_games=1&format=json`,
  );
  const owned = ownedRes.ok ? (await ownedRes.json())?.response?.games ?? [] : [];
  const statGames = owned.filter((g: Record<string, unknown>) => g.has_community_visible_stats);

  const perGame = await mapLimit(statGames, 12, async (g: Record<string, unknown>) => {
    try {
      const r = await fetch(
        `${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${steamId}&appid=${g.appid}`,
      );
      if (!r.ok) return null;
      const d = await r.json();
      if (!d?.playerstats?.success) return null;
      const ach = d.playerstats.achievements ?? [];
      if (!ach.length) return null;
      const unlocked = ach.filter((a: Record<string, unknown>) => a.achieved === 1);
      const times = unlocked
        .map((a: Record<string, unknown>) => Number(a.unlocktime) || 0)
        .filter((t: number) => t > 0);
      const days: Record<string, number> = {};
      for (const t of times) {
        const d = new Date(t * 1000).toISOString().slice(0, 10);
        days[d] = (days[d] ?? 0) + 1;
      }
      return {
        appid: g.appid,
        earned: unlocked.length,
        total: ach.length,
        startedUnix: times.length ? Math.min(...times) : undefined,
        days,
      };
    } catch {
      return null;
    }
  });

  const valid = perGame.filter(Boolean) as Array<{
    appid: number;
    earned: number;
    total: number;
    startedUnix?: number;
    days: Record<string, number>;
  }>;
  const totalUnlocked = valid.reduce((s, x) => s + x.earned, 0);
  const totalAchievements = valid.reduce((s, x) => s + x.total, 0);
  const perfectGames = valid.filter((x) => x.total > 0 && x.earned === x.total).length;
  const avgCompletion =
    valid.length === 0
      ? 0
      : valid.reduce((s, x) => s + (x.total ? (x.earned / x.total) * 100 : 0), 0) / valid.length;

  const started: Record<string, string> = {};
  const activity: Array<{ d: string; appid: string; n: number }> = [];
  for (const x of valid) {
    if (x.startedUnix) {
      started[String(x.appid)] = new Date(x.startedUnix * 1000).toISOString().slice(0, 10);
    }
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
    started,
    activity,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const route = new URL(req.url).pathname.split("/").pop();

    if (!apiKey) {
      return json(
        { error: "STEAM_API_KEY secret is not set on the edge function." },
        501,
      );
    }

    if (route === "verify" && req.method === "POST") {
      const { search } = await req.json();
      const steamId = await verifySteamLogin(String(search ?? ""));
      return steamId
        ? json({ steamId })
        : json({ error: "Steam verification failed" }, 401);
    }

    const steamId = new URL(req.url).searchParams.get("steamid");

    if (route === "profile" && req.method === "GET") {
      if (!steamId) return json({ error: "Missing steamid" }, 400);
      return json({ profile: await cached(`profile:${steamId}`, () => fetchProfile(steamId)) });
    }

    if (route === "library" && req.method === "GET") {
      if (!steamId) return json({ error: "Missing steamid" }, 400);
      return json(await cached(`library:${steamId}`, () => buildLibrary(steamId)));
    }

    if (route === "cover" && req.method === "GET") {
      const appid = new URL(req.url).searchParams.get("appid");
      if (!appid) return json({ error: "Missing appid" }, 400);
      return json({ image: await cached(`cover:${appid}`, () => fetchCover(appid)) });
    }

    if (route === "presence" && req.method === "GET") {
      if (!steamId) return json({ error: "Missing steamid" }, 400);
      return json(await fetchPresence(steamId));
    }

    if (route === "stats" && req.method === "GET") {
      if (!steamId) return json({ error: "Missing steamid" }, 400);
      return json(await cached(`stats:${steamId}`, () => fetchLibraryStats(steamId)));
    }

    if (route === "achievements" && req.method === "GET") {
      const appid = new URL(req.url).searchParams.get("appid");
      if (!steamId || !appid) return json({ error: "Missing steamid or appid" }, 400);
      const achievements = await cached(`ach:${steamId}:${appid}`, () =>
        fetchGameAchievements(steamId, Number(appid)),
      );
      return json({ achievements });
    }

    return json({ error: "Unknown Steam API route" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
