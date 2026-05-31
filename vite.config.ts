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
