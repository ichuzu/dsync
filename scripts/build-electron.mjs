import { build, context } from "esbuild";
import { rm } from "node:fs/promises";

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
