import { shell } from "electron";
import { findSteamRoot } from "./paths";
import { readUserRegistry } from "../winHelper";

/**
 * Launching games and knowing which one is running.
 *
 * Launching goes through the steam:// protocol rather than the game's exe, so
 * Steam handles cloud saves, DRM, overlay and playtime exactly as it would if
 * the user clicked Play in Steam itself.
 *
 * For "what is running", Steam maintains RunningAppID in the registry. That is
 * far cheaper and more accurate than scanning the process table, and unlike the
 * Web API's presence endpoint it needs no network round-trip and works even
 * when the user's profile is private.
 */

/** Under HKEY_CURRENT_USER; read through the long-lived helper, not reg.exe. */
const STEAM_KEY = "Software\\Valve\\Steam";

/** Asks Steam to launch an app. Resolves once the request is handed off. */
export async function launchGame(appid: string): Promise<void> {
  if (!/^\d+$/.test(appid)) throw new Error(`Invalid appid: ${appid}`);
  await shell.openExternal(`steam://rungameid/${appid}`);
}

/**
 * Opens a game's store page inside the Steam client.
 *
 * steam:// rather than an https:// store URL, so the page opens in Steam's own
 * overlay/browser where the user is already signed in — not in a web browser.
 * Falls back to the website only when Steam isn't installed.
 */
export async function openStorePage(appid: string): Promise<void> {
  if (!/^\d+$/.test(appid)) throw new Error(`Invalid appid: ${appid}`);
  const steam = await findSteamRoot();
  await shell.openExternal(
    steam ? `steam://store/${appid}` : `https://store.steampowered.com/app/${appid}`,
  );
}

/** Asks Steam to install an app (opens the install dialog). */
export async function installGame(appid: string): Promise<void> {
  if (!/^\d+$/.test(appid)) throw new Error(`Invalid appid: ${appid}`);
  await shell.openExternal(`steam://install/${appid}`);
}

/**
 * The appid Steam is currently running, or null when nothing is being played.
 * Steam clears this back to 0 on exit.
 */
export async function getRunningAppId(): Promise<string | null> {
  const id = Number(await readUserRegistry(STEAM_KEY, "RunningAppID"));
  return id > 0 ? String(id) : null;
}

/** True when the Steam client itself is running. */
export async function isSteamRunning(): Promise<boolean> {
  return Number(await readUserRegistry(STEAM_KEY, "pid")) > 0;
}
