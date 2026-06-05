# Desktop migration — hybrid (local Steamworks + Web API)

Plan to turn Dsync from a web SPA into an Electron desktop app that tracks games
**live** while you play. Decisions locked in: **Electron**, **keep Supabase**,
**full live tracking (sessions + local detection + live achievement
notifications)**.

## The key idea

Steam exposes **two unrelated APIs**, and we use each where it's strong:

| Need | API | Why |
| --- | --- | --- |
| Live achievement unlocks, current-game state, global rarity % | **Local Steamworks API** (`steamworks.js`) | Keyless, real-time, no quota — talks to the running, logged-in Steam client (this is how Steam Achievement Manager works) |
| Library list, covers, profile, whole-library stats sweep | **Steam Web API** (existing `src/lib/steam.ts`) | Works for owned-but-not-installed games; low frequency, so quota is a non-issue |
| Game launch/exit detection, session playtime (incl. Epic/GOG) | **OS process + local file watching** | The only source of true real-time playtime; cross-launcher |

The big consequence: **the live, high-frequency work is keyless and local**, so
the shared-API-key/quota problem from the web version disappears. The Web API
shrinks to occasional metadata calls.

## Process layout (Electron)

- **Main process (Node)** — `steamworks.js` native binding, the process/file
  watcher, the ported Web API proxy, SQLite (local session history), native
  notifications, IPC server.
- **Renderer (Chromium)** — the existing React app, ~unchanged. Replaces
  `fetch('/api/steam/...')` with IPC calls (or main runs a localhost HTTP server
  so `steamClient.ts` barely changes).

Scaffold with **electron-vite** (Vite renderer + Node main).

## Phases

### Phase 0 — Electron shell · ~1–2 days
electron-vite scaffold, load the React app in a window, system tray,
minimize-to-tray, launch-on-startup. Outcome: app runs as a desktop window.

### Phase 1 — Web API proxy into main + login · ~1–2 days
Move the `vite-plugin-steam` route handlers into main (they're already
runtime-agnostic per `steam.ts`'s header). Still needed for library list, covers,
profile, global rarity at rest. **Rework Steam OpenID login**: `steamClient.ts:21`
uses `window.location.origin` as the realm, which is `file://` in Electron and
rejected — use a loopback redirect (`return_to=http://localhost:<port>/steam-callback`)
opened in a browser window.

### Phase 2 — Local detection + sessions · ~1 week
Poll the OS process list; map executables → games (Steam from
`appmanifest_*.acf` + `libraryfolders.vdf`; Epic + GOG from their manifests/DB).
On launch → open session `{appid, startedAt}`; on exit → close + compute real
duration; persist to SQLite. **This is the only source of live playtime** — the
Web API's `playtime_forever` only updates after you quit.

### Phase 3 — Live achievements via `steamworks.js` · ~3–5 days
When Phase 2 detects a **Steam** game launch, main `init()`s `steamworks.js` for
that appid, reads achievement state, and watches for unlocks locally (callbacks /
cheap local polling — no quota). On unlock → native `Notification` + IPC push to
the UI. Global rarity for the running game is also available locally
(`RequestGlobalAchievementPercentages`). Keyless and genuinely real-time — this
is the SAM approach, read-only.

### Phase 4 — Supabase sync · ~few days
Keep Supabase auth (works from the renderer). Add a `play_sessions` table + an
`achievement_unlocks` table with RLS; write local-first to SQLite, sync to
Supabase when online so data follows across devices.

### Phase 5 — Distribution · variable, deferrable
electron-updater + code signing (Apple notarization / Windows cert). Usual reason
shipping takes longer than the code.

**Effort:** MVP (shell + proxy + Tier 1 sessions) ~1 week; polished full version
~3–5 weeks part-time, mostly Phase 2 + distribution.

## Risks / caveats

- **`steamworks.js` is a native addon** — must match Electron's ABI
  (electron-rebuild / prebuilds); packaging native modules is a known but real step.
- **Per-appid init** — the Steamworks API is a global singleton; init on game
  launch, shut down on exit, re-init when the running game changes.
- **Steam must be running + logged in** — fine for a tracker on the gaming PC.
- **Epic/GOG have no local achievement API** — those games get playtime sessions
  only (no live achievements), unless a launcher exposes more.
- **Ownership** — `init(appid)` requires owning the game (you do — you're playing it).
- **TOS** — read-only tracking via Steamworks is benign; do **not** ship
  achievement *writing* (that's the SAM cheat use-case).
- **Target OS** — `steamworks.js` supports Win/Mac/Linux, but Phase 2 detection is
  OS-specific. Dev machine is macOS; PC gaming is Windows-first — pick the first
  tracker target.

## Open decisions

1. **First tracker OS** — Windows (where the players are) or macOS (where you dev)?
2. **How keyless to go** — read installed games from local Steam files too, or
   keep the Web API `GetOwnedGames` for the library list (needed for
   owned-but-not-installed games)?
