import { app } from "electron";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { findSteamRoot } from "./paths";
import { existingArt } from "./artwork";

/**
 * Non-Steam games the user added to Steam ("Add a Non-Steam Game").
 *
 * Steam keeps them per account in a binary VDF file:
 *
 *   userdata/<accountId>/config/shortcuts.vdf
 *
 * with one entry per game: name, exe, start dir, tags, last played. Custom
 * artwork set in Steam lives beside it in config/grid/<appid>p.png etc.
 *
 * Each shortcut has a 32-bit appid with the high bit set, so it never
 * clashes with a real Steam app; Steam collections refer to shortcuts by the
 * same id. Launching goes through steam://rungameid/ with the 64-bit game id
 * (appid << 32 | 0x02000000), so Steam's overlay and controller config apply
 * just as when starting it from Steam.
 */

export interface NonSteamGame {
  /** The unsigned 32-bit shortcut appid, as a string. */
  appid: string;
  name: string;
  exe: string;
  /** For steam://rungameid/. */
  launchId: string;
  /** Epoch seconds, or null if never played through Steam. */
  lastPlayed: number | null;
  tags: string[];
  /** Portrait artwork set in Steam, else the exe's icon, as a data URL. */
  image: string | null;
  /** Steam already has a cover or banner for it (set by hand or by Dsync). */
  hasArtwork: boolean;
}

/** appid -> its account's grid folder, name and exe, from the last read. */
const known = new Map<string, { gridDir: string; name: string; exe: string }>();

/** Where Steam keeps custom art for this shortcut, and its name. */
export const shortcutInfo = (appid: string) => known.get(appid) ?? null;

const STEAMID64_BASE = 76561197960265728n;

// --- binary VDF ---------------------------------------------------------
// Maps are 0x00 <key> ... 0x08; strings 0x01 <key> <value>; ints 0x02 <key>
// <int32 LE>; 0x07 is a uint64. Keys and string values are NUL-terminated.

type VdfValue = string | number | VdfMap;
interface VdfMap {
  [key: string]: VdfValue;
}

function parseBinaryVdf(buf: Buffer): VdfMap {
  let i = 0;
  const readString = () => {
    const start = i;
    while (i < buf.length && buf[i] !== 0) i++;
    const value = buf.toString("utf8", start, i);
    i++;
    return value;
  };
  const readMap = (): VdfMap => {
    const out: VdfMap = {};
    while (i < buf.length) {
      const type = buf[i++];
      if (type === 0x08) return out;
      const key = readString();
      if (type === 0x00) out[key] = readMap();
      else if (type === 0x01) out[key] = readString();
      else if (type === 0x02) {
        out[key] = buf.readInt32LE(i);
        i += 4;
      } else if (type === 0x07) {
        out[key] = Number(buf.readBigUInt64LE(i));
        i += 8;
      } else throw new Error(`Unknown VDF type ${type}`);
    }
    return out;
  };
  return readMap();
}

/** Keys vary in case between Steam versions ("AppName" vs "appname"). */
const field = (entry: VdfMap, name: string): VdfValue | undefined => {
  const key = Object.keys(entry).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? entry[key] : undefined;
};

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

async function gridImage(gridDir: string, appid: string): Promise<string | null> {
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    const file = join(gridDir, `${appid}p${ext}`);
    const info = await stat(file).catch(() => null);
    // Generous cap: these become data URLs held in renderer memory.
    if (info && info.size < 6_000_000) {
      return `data:${MIME[ext]};base64,${(await readFile(file)).toString("base64")}`;
    }
  }
  return null;
}

async function exeIcon(exe: string): Promise<string | null> {
  try {
    const icon = await app.getFileIcon(exe.replace(/^"|"$/g, ""), { size: "large" });
    return icon.isEmpty() ? null : icon.toDataURL();
  } catch {
    return null;
  }
}

const run = promisify(execFile);
let lastCheck = 0;
let lastRunning: string | null = null;

/**
 * Which non-Steam game is running, by its exe in the process list. Steam's
 * RunningAppID registry value covers only real Steam apps, so this is the
 * fallback for shortcuts. tasklist is cheap but not free, so the answer is
 * reused for a few seconds.
 */
export async function runningShortcut(): Promise<string | null> {
  if (process.platform !== "win32" || known.size === 0) return null;
  if (Date.now() - lastCheck < 5000) return lastRunning;
  lastCheck = Date.now();
  try {
    const { stdout } = await run("tasklist", ["/FO", "CSV", "/NH"], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    const images = new Set(
      stdout
        .split(/\r?\n/)
        .map((line) => line.split(",")[0]?.replace(/"/g, "").toLowerCase())
        .filter(Boolean),
    );
    lastRunning = null;
    for (const [appid, info] of known) {
      const image = basename(info.exe.replace(/^"|"$/g, "")).toLowerCase();
      if (image && images.has(image)) {
        lastRunning = appid;
        break;
      }
    }
  } catch {
    lastRunning = null;
  }
  return lastRunning;
}

/** The user's non-Steam games, or an empty list when there are none. */
export async function readNonSteamGames(steamId?: string): Promise<NonSteamGame[]> {
  const root = await findSteamRoot();
  if (!root) return [];

  // The signed-in account's folder, else every account on this PC.
  let accounts: string[] = [];
  try {
    if (steamId) accounts = [String(BigInt(steamId) - STEAMID64_BASE)];
  } catch {
    /* fall through */
  }
  if (!accounts.length || !(await stat(join(root, "userdata", accounts[0], "config", "shortcuts.vdf")).catch(() => null))) {
    accounts = await readdir(join(root, "userdata")).catch(() => []);
  }

  const games: NonSteamGame[] = [];
  for (const account of accounts) {
    const config = join(root, "userdata", account, "config");
    let parsed: VdfMap;
    try {
      parsed = parseBinaryVdf(await readFile(join(config, "shortcuts.vdf")));
    } catch {
      continue;
    }
    const shortcuts = (field(parsed, "shortcuts") as VdfMap | undefined) ?? {};
    for (const entry of Object.values(shortcuts)) {
      if (typeof entry !== "object") continue;
      const rawId = field(entry, "appid");
      const name = String(field(entry, "AppName") ?? "").trim();
      if (typeof rawId !== "number" || !name) continue;
      const appid = String(rawId >>> 0);
      if (games.some((g) => g.appid === appid)) continue;
      const exe = String(field(entry, "Exe") ?? "");
      const last = Number(field(entry, "LastPlayTime") ?? 0);
      const tags = Object.values((field(entry, "tags") as VdfMap | undefined) ?? {}).map(String);
      const gridDir = join(config, "grid");
      const art = await existingArt(gridDir, appid);
      known.set(appid, { gridDir, name, exe });
      games.push({
        appid,
        name,
        exe,
        launchId: ((BigInt(appid) << 32n) | 0x02000000n).toString(),
        lastPlayed: last > 0 ? last : null,
        tags,
        image: (await gridImage(gridDir, appid)) ?? (exe ? await exeIcon(exe) : null),
        hasArtwork: art.has("cover") || art.has("header"),
      });
    }
  }
  return games.sort((a, b) => a.name.localeCompare(b.name));
}

