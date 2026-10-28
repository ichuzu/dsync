import { app } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * One long-lived helper process that answers Windows questions for the main
 * process, so Dsync never spawns reg.exe, tasklist.exe or PowerShell on a
 * timer. Line-based commands on stdin, one answer line each:
 *
 *   get                 -> the foreground window handle
 *   set <h>             -> bring window <h> to the front
 *   reg <key>|<value>   -> a value under HKEY_CURRENT_USER ("" if absent)
 *   procs               -> running process names, "|"-separated
 *
 * The helper is dsync-helper.exe (electron/native/dsync-helper.cs, compiled
 * at build time, ~5 KB, ~10 MB of memory). If it is missing, the same
 * protocol is served by a PowerShell script instead: heavier (~60 MB), but
 * it keeps everything working.
 */

const POWERSHELL_FALLBACK = `
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
  $out = ''
  try {
    if ($line -eq 'get') { $out = [Fg]::GetForegroundWindow().ToInt64() }
    elseif ($line.StartsWith('set ')) {
      $h = [IntPtr][Int64]$line.Substring(4)
      if ([Fg]::IsWindow($h)) {
        if ([Fg]::IsIconic($h)) { [void][Fg]::ShowWindow($h, 9) }
        [Fg]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [Fg]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
        [void][Fg]::SetForegroundWindow($h)
      }
      $out = 'ok'
    }
    elseif ($line.StartsWith('reg ')) {
      $parts = $line.Substring(4).Split('|')
      $v = (Get-ItemProperty -Path ('HKCU:\\' + $parts[0]) -Name $parts[1] -ErrorAction SilentlyContinue).($parts[1])
      if ($v -ne $null) { $out = "$v" }
    }
    elseif ($line -eq 'procs') { $out = ((Get-Process | Select-Object -ExpandProperty ProcessName -Unique) -join '|') }
  } catch { $out = '' }
  [Console]::Out.WriteLine($out)
}
`;

let helper: ChildProcessWithoutNullStreams | null = null;
let buffer = "";
const waiting: Array<(line: string | null) => void> = [];

/** The compiled helper: next to the app when packaged, in build/ in development. */
const helperExe = () =>
  app.isPackaged ? join(process.resourcesPath, "dsync-helper.exe") : join(__dirname, "../build/dsync-helper.exe");

function ensureHelper(): ChildProcessWithoutNullStreams | null {
  if (process.platform !== "win32") return null;
  if (helper && helper.exitCode === null) return helper;
  const exe = helperExe();
  helper = existsSync(exe)
    ? spawn(exe, [], { windowsHide: true })
    : spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(POWERSHELL_FALLBACK, "utf16le").toString("base64")],
        { windowsHide: true },
      );
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

// Requests are answered strictly in order, so they are queued rather than
// sent concurrently; a timed-out request keeps its slot so a late answer
// can't be handed to the next caller.
let chain: Promise<unknown> = Promise.resolve();

function ask(command: string, timeoutMs = 2000): Promise<string | null> {
  const run = () =>
    new Promise<string | null>((resolve) => {
      const proc = ensureHelper();
      if (!proc) return resolve(null);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(null);
      }, timeoutMs);
      waiting.push((line) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve(line);
      });
      proc.stdin.write(`${command}\n`);
    });
  const result = chain.then(run, run);
  chain = result.catch(() => {});
  return result;
}

/** Starts the helper early, so the first question isn't slowed by it. */
export function warmWinHelper(): void {
  ensureHelper();
}

export function stopWinHelper(): void {
  helper?.kill();
  helper = null;
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

/** A value under HKEY_CURRENT_USER, or null if it isn't there (or on error). */
export async function readUserRegistry(key: string, value: string): Promise<string | null> {
  const answer = await ask(`reg ${key}|${value}`);
  return answer ? answer : null;
}

/** Names of running processes (without ".exe"), lower-cased; null if unknown. */
export async function runningProcessNames(): Promise<Set<string> | null> {
  const answer = await ask("procs", 4000);
  return answer ? new Set(answer.toLowerCase().split("|")) : null;
}
