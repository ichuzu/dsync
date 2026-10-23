import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/**
 * Remembers and restores which window had focus, across apps (Windows).
 *
 * The overlay's edit mode takes focus from the game; leaving it should hand
 * focus back to exactly the window the player was in. Electron only knows
 * its own windows, so this keeps one small PowerShell process alive that
 * calls user32 directly (no native module to rebuild per Electron version).
 * It is started once and answers line-based commands on stdin:
 *
 *   get       -> the foreground window handle
 *   set <h>   -> bring <h> to the front
 *
 * Windows only lets the foreground process move focus elsewhere; a tapped
 * Alt key, sent while the overlay holds focus, lifts that lock for the call.
 */

const SCRIPT = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Fg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
"@
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  if ($line -eq 'get') { [Console]::Out.WriteLine([Fg]::GetForegroundWindow().ToInt64()) }
  elseif ($line.StartsWith('set ')) {
    $h = [IntPtr][Int64]$line.Substring(4)
    if ([Fg]::IsWindow($h)) {
      if ([Fg]::IsIconic($h)) { [void][Fg]::ShowWindow($h, 9) }
      [Fg]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [Fg]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
      [void][Fg]::SetForegroundWindow($h)
    }
    [Console]::Out.WriteLine('ok')
  }
}
`;

let helper: ChildProcessWithoutNullStreams | null = null;
let buffer = "";
const waiting: Array<(line: string | null) => void> = [];

function ensureHelper(): ChildProcessWithoutNullStreams | null {
  if (process.platform !== "win32") return null;
  if (helper && helper.exitCode === null) return helper;
  const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
  helper = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
    windowsHide: true,
  });
  buffer = "";
  helper.stdout.setEncoding("utf8");
  helper.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      waiting.shift()?.(line);
    }
  });
  helper.on("exit", () => {
    helper = null;
    while (waiting.length) waiting.shift()?.(null);
  });
  return helper;
}

function ask(command: string, timeoutMs = 1500): Promise<string | null> {
  const proc = ensureHelper();
  if (!proc) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const done = (line: string | null) => {
      if (settled) return;
      settled = true;
      resolve(line);
    };
    waiting.push(done);
    setTimeout(() => {
      // Drop our slot so a late answer doesn't go to the next caller.
      const i = waiting.indexOf(done);
      if (i >= 0) waiting.splice(i, 1);
      done(null);
    }, timeoutMs);
    proc.stdin.write(`${command}\n`);
  });
}

/** Starts the helper early, so the first hotkey press isn't slowed by it. */
export function warmForegroundHelper(): void {
  ensureHelper();
}

/** The foreground window's handle, or null if unknown. */
export async function getForegroundWindow(): Promise<string | null> {
  const answer = await ask("get");
  return answer && /^\d+$/.test(answer) && answer !== "0" ? answer : null;
}

/** Brings a window (by handle from getForegroundWindow) back to the front. */
export async function setForegroundWindow(handle: string): Promise<void> {
  if (/^\d+$/.test(handle)) await ask(`set ${handle}`);
}

export function stopForegroundHelper(): void {
  helper?.kill();
  helper = null;
}
