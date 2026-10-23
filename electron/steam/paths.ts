import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Locating the local Steam install.
 *
 * Steam records its own path in the registry, which is authoritative and
 * survives installs to a non-default drive. `reg query` is used rather than a
 * native binding so the app has no compiled dependency to rebuild per Electron
 * version. Known install locations are tried as a fallback.
 */

const REGISTRY_KEYS: Array<[key: string, value: string]> = [
  ["HKCU\\Software\\Valve\\Steam", "SteamPath"],
  ["HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "InstallPath"],
  ["HKLM\\SOFTWARE\\Valve\\Steam", "InstallPath"],
];

const COMMON_PATHS = [
  "C:\\Program Files (x86)\\Steam",
  "C:\\Program Files\\Steam",
  "D:\\Steam",
  "D:\\Program Files (x86)\\Steam",
  "E:\\Steam",
];

async function readRegistry(key: string, value: string): Promise<string | null> {
  try {
    const { stdout } = await run("reg", ["query", key, "/v", value], {
      windowsHide: true,
    });
    // "    SteamPath    REG_SZ    c:/program files (x86)/steam"
    const match = stdout.match(/REG_SZ\s+(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

let cachedRoot: string | null | undefined;

/** Absolute path to the Steam install, or null if Steam isn't installed. */
export async function findSteamRoot(): Promise<string | null> {
  if (cachedRoot !== undefined) return cachedRoot;

  if (process.platform === "win32") {
    for (const [key, value] of REGISTRY_KEYS) {
      const path = await readRegistry(key, value);
      // Steam writes the path with forward slashes; Node accepts either.
      if (path && existsSync(join(path, "steamapps"))) {
        cachedRoot = path;
        return cachedRoot;
      }
    }
  }

  const home = process.env.HOME ?? "";
  const candidates =
    process.platform === "win32"
      ? COMMON_PATHS
      : process.platform === "darwin"
        ? [join(home, "Library/Application Support/Steam")]
        : [join(home, ".steam/steam"), join(home, ".local/share/Steam")];

  for (const path of candidates) {
    if (existsSync(join(path, "steamapps"))) {
      cachedRoot = path;
      return cachedRoot;
    }
  }

  cachedRoot = null;
  return cachedRoot;
}

/** Forget the cached location, so a Steam install mid-session is picked up. */
export const resetSteamRootCache = () => {
  cachedRoot = undefined;
};

/**
 * Reads a DWORD from the registry as a number, or null.
 * Used for Steam's RunningAppID, which is how we know what is being played.
 */
export async function readRegistryDword(key: string, value: string): Promise<number | null> {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await run("reg", ["query", key, "/v", value], { windowsHide: true });
    const match = stdout.match(/REG_DWORD\s+0x([0-9a-fA-F]+)/);
    return match ? parseInt(match[1], 16) : null;
  } catch {
    return null;
  }
}
