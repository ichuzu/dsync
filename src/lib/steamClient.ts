import type { Achievement, Game } from "@/types/game";
import type { LibraryStats, SteamPresence, SteamProfile } from "@/lib/steam";

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

export async function fetchSteamPresence(steamId: string): Promise<SteamPresence> {
  const res = await fetch(`${BASE}/presence?steamid=${encodeURIComponent(steamId)}`);
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
): Promise<Achievement[]> {
  const res = await fetch(
    `${BASE}/achievements?steamid=${encodeURIComponent(steamId)}&appid=${encodeURIComponent(appid)}`,
  );
  const { achievements } = await asJson(res);
  return achievements ?? [];
}
