import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { findSteamRoot } from "./paths";
import { asNumber, asObject, asString, parseVdf } from "./vdf";

/**
 * Reads what is actually installed on this machine, straight out of Steam's
 * own bookkeeping.
 *
 *   steamapps/libraryfolders.vdf   -> every library folder, incl. other drives
 *   steamapps/appmanifest_<id>.acf -> one per installed app: name, size, state
 *
 * This needs no API key and no public profile, and it knows things the Web API
 * never reports: install size on disk, whether an update is queued, and live
 * download progress.
 */

/** Bit flags Steam sets in an app manifest's StateFlags field. */
const STATE = {
  FULLY_INSTALLED: 1 << 2, // 4
  UPDATE_REQUIRED: 1 << 3, // 8
  UPDATE_RUNNING: 1 << 4, // 16
  UPDATE_PAUSED: 1 << 9, // 512
} as const;

export type InstallState = "installed" | "updating" | "paused" | "update-required" | "unknown";

export interface LocalGame {
  appid: string;
  name: string;
  /** Absolute path to the game's install directory. */
  installDir: string;
  /** Bytes the install occupies on disk. */
  sizeOnDisk: number;
  state: InstallState;
  /** 0–100 while downloading, else null. */
  downloadProgress: number | null;
  bytesDownloaded: number;
  bytesToDownload: number;
  /** Epoch seconds of Steam's last update, or 0. */
  lastUpdated: number;
}

function stateFrom(flags: number): InstallState {
  if (flags & STATE.UPDATE_PAUSED) return "paused";
  if (flags & STATE.UPDATE_RUNNING) return "updating";
  if (flags & STATE.UPDATE_REQUIRED) return "update-required";
  if (flags & STATE.FULLY_INSTALLED) return "installed";
  return "unknown";
}

/** Every steamapps folder Steam knows about, across all drives. */
export async function findLibraryFolders(): Promise<string[]> {
  const root = await findSteamRoot();
  if (!root) return [];

  const primary = join(root, "steamapps");

  // Windows paths are case-insensitive and the registry hands back a
  // lower-cased one, so key on a normalised form to avoid scanning the same
  // folder twice under two spellings.
  const key = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);
  const folders = new Map<string, string>([[key(primary), primary]]);

  try {
    const raw = await readFile(join(primary, "libraryfolders.vdf"), "utf8");
    const parsed = parseVdf(raw);
    for (const entry of Object.values(parsed)) {
      const obj = asObject(entry);
      const path = obj && asString(obj.path);
      if (!path) continue;
      const folder = join(path, "steamapps");
      if (!folders.has(key(folder))) folders.set(key(folder), folder);
    }
  } catch {
    // No libraryfolders.vdf (fresh install, or Steam mid-write) — the primary
    // folder alone is still a correct, if partial, answer.
  }

  return [...folders.values()];
}

async function readManifest(file: string): Promise<LocalGame | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null; // deleted between readdir and here
  }

  const app = parseVdf(raw);
  const appid = asString(app.appid);
  if (!appid) return null;

  const toDownload = asNumber(app.BytesToDownload);
  const downloaded = asNumber(app.BytesDownloaded);
  const flags = asNumber(app.StateFlags);
  const state = stateFrom(flags);
  const downloading = state === "updating" || state === "paused";

  return {
    appid,
    name: asString(app.name) ?? `App ${appid}`,
    installDir: asString(app.installdir) ?? "",
    sizeOnDisk: asNumber(app.SizeOnDisk),
    state,
    downloadProgress:
      downloading && toDownload > 0
        ? Math.min(100, Math.max(0, (downloaded / toDownload) * 100))
        : null,
    bytesDownloaded: downloaded,
    bytesToDownload: toDownload,
    lastUpdated: asNumber(app.LastUpdated),
  };
}

/**
 * Scans every library folder for installed apps.
 *
 * Steam's own tools and runtimes live alongside real games in steamapps; they
 * are filtered out by appid so the library doesn't fill with "Steamworks
 * Common Redistributables".
 */
const NON_GAME_APPIDS = new Set([
  "228980", // Steamworks Common Redistributables
  "1070560", // Steam Linux Runtime
  "1391110", // Steam Linux Runtime - Soldier
  "1493710", // Proton Experimental
  "1628350", // Steam Linux Runtime - Sniper
]);

export async function scanLocalLibrary(): Promise<LocalGame[]> {
  const folders = await findLibraryFolders();
  const games = new Map<string, LocalGame>();

  await Promise.all(
    folders.map(async (folder) => {
      let entries: string[];
      try {
        entries = await readdir(folder);
      } catch {
        return; // drive unplugged, or a stale entry in libraryfolders.vdf
      }

      const manifests = entries.filter(
        (f) => f.startsWith("appmanifest_") && f.endsWith(".acf"),
      );

      await Promise.all(
        manifests.map(async (file) => {
          const game = await readManifest(join(folder, file));
          if (!game || NON_GAME_APPIDS.has(game.appid)) return;
          // A game can appear in two folders mid-move; the installed copy wins.
          const existing = games.get(game.appid);
          if (!existing || game.state === "installed") games.set(game.appid, game);
        }),
      );
    }),
  );

  return [...games.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Only the apps currently downloading or updating, for the progress bars. */
export async function scanDownloads(): Promise<LocalGame[]> {
  const all = await scanLocalLibrary();
  return all.filter((g) => g.downloadProgress !== null);
}
