import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { steamApi } from "./vite-plugin-steam";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (including non-VITE_ ones like STEAM_API_KEY) for the
  // dev server. STEAM_API_KEY stays server-side — it is never exposed to the
  // client because it lacks the VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      host: "::",
      port: 8080,
      // Poll instead of using fs.watch. On Windows, opening a file that another
      // process is still writing throws EBUSY, and chokidar re-emits that as an
      // unhandled 'error' on the watcher — which takes the whole dev server
      // down. Polling never opens a handle, so a half-written file is simply
      // picked up on the next tick. The interval trades a little latency for
      // much less CPU than chokidar's 100ms default.
      watch: {
        usePolling: true,
        interval: 300,
        binaryInterval: 1000,
      },
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      steamApi({ apiKey: env.STEAM_API_KEY }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
