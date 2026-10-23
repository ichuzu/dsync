import type {
  DsyncBridge,
  LocalGame,
  SteamCollection,
  SteamStatus,
  DesktopSettings,
} from "../../electron/ipc";

/**
 * Renderer-side access to the desktop bridge.
 *
 * The same build runs in a browser and inside Electron, so every caller has to
 * cope with the bridge being absent. `getDesktop()` returns null on the web and
 * the helpers below degrade to no-ops, which keeps the `isDesktop ? … : …`
 * branching out of the components.
 */

declare global {
  interface Window {
    dsync?: DsyncBridge;
  }
}

/** The bridge, or null when running in a normal browser. */
export const getDesktop = (): DsyncBridge | null =>
  typeof window !== "undefined" && window.dsync?.isDesktop ? window.dsync : null;

/** True only inside the packaged/dev Electron app. */
export const isDesktop = (): boolean => getDesktop() !== null;

/**
 * Locally installed games, or an empty list on the web.
 *
 * Note this is a different, complementary source to the Steam Web API library:
 * it covers what is on this machine (including games the Web API hides behind
 * a private profile) but not games owned and uninstalled.
 */
export const getLocalLibrary = async (): Promise<LocalGame[]> =>
  (await getDesktop()?.getLocalLibrary()) ?? [];

/**
 * The Steam client's library collections, or an empty list on the web (the
 * Web API has no way to read them).
 */
export const getSteamCollections = async (steamId?: string): Promise<SteamCollection[]> =>
  (await getDesktop()?.getSteamCollections(steamId)) ?? [];

export const getSteamStatus = async (): Promise<SteamStatus | null> =>
  (await getDesktop()?.getSteamStatus()) ?? null;

/**
 * Signs in with Steam through the system browser, resolving with the verified
 * Steam ID. Returns null on the web, where the caller should fall back to the
 * ordinary page redirect.
 */
export const signInWithSteam = async (): Promise<string | null> => {
  const desktop = getDesktop();
  return desktop ? desktop.signInWithSteam() : null;
};

/**
 * Opens a game's store page in the Steam client. Returns false on the web so
 * the caller can fall back to a normal link.
 */
export const openInSteam = async (appid: string): Promise<boolean> => {
  const desktop = getDesktop();
  if (!desktop) return false;
  await desktop.openStorePage(appid);
  return true;
};

/**
 * Launches a game through Steam. Returns false on the web, so callers can fall
 * back to opening the store page in a tab.
 */
export const launchGame = async (appid: string): Promise<boolean> => {
  const desktop = getDesktop();
  if (!desktop) return false;
  await desktop.launchGame(appid);
  return true;
};

export const installGame = async (appid: string): Promise<boolean> => {
  const desktop = getDesktop();
  if (!desktop) return false;
  await desktop.installGame(appid);
  return true;
};

/** Subscribes to a desktop event; a no-op unsubscribe on the web. */
const noop = () => {};

export const onLibraryChanged = (fn: (games: LocalGame[]) => void) =>
  getDesktop()?.onLibraryChanged(fn) ?? noop;

export const onDownloadsChanged = (fn: (games: LocalGame[]) => void) =>
  getDesktop()?.onDownloadsChanged(fn) ?? noop;

export const onRunningAppChanged = (fn: (appid: string | null) => void) =>
  getDesktop()?.onRunningAppChanged(fn) ?? noop;

export type { LocalGame, SteamCollection, SteamStatus, DesktopSettings };
