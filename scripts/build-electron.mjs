import { build, context } from "esbuild";
import { rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

/**
 * Builds the Electron main and preload bundles.
 *
 * esbuild directly rather than vite-plugin-electron: that plugin's current
 * release needs Vite >= 6 and this project is on Vite 5, and doing it here also
 * settles the module-format problem cleanly. package.json is `"type": "module"`,
 * so a plain `.js` file would be loaded as ESM — the output is therefore CJS
 * with an explicit `.cjs` extension, which Electron loads unambiguously and
 * which lets main.ts keep using __dirname.
 *
 *   node scripts/build-electron.mjs          one-shot build
 *   node scripts/build-electron.mjs --watch  rebuild on change
 */

const watch = process.argv.includes("--watch");
const dev = watch || process.argv.includes("--dev");

/** @type {import("esbuild").BuildOptions} */
const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  sourcemap: dev,
  minify: !dev,
  // Electron and Node built-ins are provided by the runtime, never bundled.
  external: ["electron", ...nodeBuiltins()],
  logLevel: "info",
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
};

function nodeBuiltins() {
  // Prefix form covers both "fs" and "node:fs" spellings.
  return [
    "assert", "buffer", "child_process", "crypto", "dns", "events", "fs", "http",
    "https", "module", "net", "os", "path", "process", "stream", "string_decoder",
    "timers", "tls", "url", "util", "worker_threads", "zlib",
  ].flatMap((m) => [m, `node:${m}`]);
}

await rm("dist-electron", { recursive: true, force: true });

/**
 * build/dsync-helper.exe: the small Windows helper the main process asks
 * about focus, the registry and running processes (electron/winHelper.ts).
 * Compiled with the C# compiler that ships with Windows (.NET Framework 4),
 * so nothing extra is installed. Skipped when it is already newer than its
 * source, and on other platforms; if it can't be built, the app falls back
 * to a PowerShell version of the same helper.
 */
async function buildHelper() {
  if (process.platform !== "win32") return;
  // join() for backslashes: csc reads "/" inside an argument as a switch.
  const source = join("electron", "native", "dsync-helper.cs");
  const output = join("build", "dsync-helper.exe");
  const [src, out] = await Promise.all([stat(source), stat(output).catch(() => null)]);
  if (out && out.mtimeMs >= src.mtimeMs) return;
  const csc = join(process.env.WINDIR ?? "C:/Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  try {
    await promisify(execFile)(csc, ["-nologo", "-optimize+", "-target:exe", `-out:${output}`, source]);
    console.log("[electron] built dsync-helper.exe");
  } catch (err) {
    console.warn("[electron] couldn't build dsync-helper.exe; the PowerShell fallback will be used:", err.message);
  }
}
await buildHelper();

const targets = [
  { ...shared, entryPoints: { main: "electron/main.ts" } },
  { ...shared, entryPoints: { preload: "electron/preload.ts" } },
];

if (watch) {
  const contexts = await Promise.all(targets.map((t) => context(t)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("[electron] watching main + preload");
} else {
  await Promise.all(targets.map((t) => build(t)));
  console.log("[electron] built main.cjs + preload.cjs");
}
