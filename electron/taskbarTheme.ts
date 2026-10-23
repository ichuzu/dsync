import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { nativeTheme } from "electron";

const run = promisify(execFile);

/**
 * Whether the Windows taskbar is light or dark, so the app icon can pick a
 * contrasting ink.
 *
 * Windows keeps two separate switches: AppsUseLightTheme (what
 * nativeTheme reports) and SystemUsesLightTheme (taskbar, Start, tray). Only
 * the second matters for the icon, and Electron doesn't expose it, so it is
 * read from the registry. nativeTheme's "updated" event fires on most theme
 * changes; a slow poll catches a change to the taskbar alone.
 */

export type TaskbarTheme = "light" | "dark";

const KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";

export async function readTaskbarTheme(): Promise<TaskbarTheme> {
  if (process.platform !== "win32") return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  try {
    const { stdout } = await run("reg", ["query", KEY, "/v", "SystemUsesLightTheme"], { windowsHide: true });
    return /REG_DWORD\s+0x0*1\b/.test(stdout) ? "light" : "dark";
  } catch {
    // Older Windows without the setting has a dark taskbar.
    return "dark";
  }
}

/** Calls `onChange` whenever the taskbar flips. Returns a stop function. */
export function watchTaskbarTheme(onChange: (theme: TaskbarTheme) => void): () => void {
  let last: TaskbarTheme | null = null;
  const check = async () => {
    const now = await readTaskbarTheme();
    if (now !== last) {
      last = now;
      onChange(now);
    }
  };
  void check();
  nativeTheme.on("updated", check);
  const timer = setInterval(check, 30_000);
  return () => {
    nativeTheme.off("updated", check);
    clearInterval(timer);
  };
}
