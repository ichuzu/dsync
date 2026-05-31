# Dsync

A unified PC game library and achievement tracker. Connect your **Steam**,
**Epic Games**, and **GOG Galaxy** accounts to see every game and every
achievement in one clean dashboard — sorted, filtered, and ranked against your
friends.

> The app currently ships with a demo library of mock data so you can explore
> the UI immediately. Real Steam sign-in is wired up via Steam OpenID 2.0 and a
> Supabase edge function (see [Steam sign-in](#steam-sign-in)).

## Features

- **Game library** — browse your collection with cover art, playtime, and
  per-game achievement progress.
- **Achievement tracking** — unlocked counts broken down by global rarity
  (common → legendary), plus "perfect game" badges for 100% completions.
- **Launcher dashboard** — connect/disconnect Steam, Epic, and GOG.
- **Search, filter & sort** — by title/genre, launcher, completion status, and
  recency, completion %, playtime, or name.
- **Friends leaderboard** — compare achievement points and perfect games.
- **Auth** — Steam OpenID sign-in plus a one-click demo account.

## Tech stack

- [Vite](https://vitejs.dev/) + [React 18](https://react.dev/) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) with [shadcn/ui](https://ui.shadcn.com/) (Radix primitives)
- [TanStack Query](https://tanstack.com/query) for data fetching
- [Supabase](https://supabase.com/) (auth, Postgres, edge functions)

## Getting started

> Requires [Node.js](https://nodejs.org/) 18+. This project uses
> [Bun](https://bun.sh/) for the lockfile, but npm works too.

```bash
# 1. Install dependencies
bun install        # or: npm install

# 2. Configure environment
cp .env.example .env   # then fill in your Supabase project values

# 3. Start the dev server (http://localhost:8080)
bun run dev        # or: npm run dev
```

### Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `dev`           | Start the Vite dev server            |
| `build`         | Production build                     |
| `build:dev`     | Development-mode build               |
| `preview`       | Preview the production build locally |
| `lint`          | Run ESLint                           |

## Environment variables

Copy `.env.example` to `.env` and set:

| Variable                        | Description                                  |
| ------------------------------- | -------------------------------------------- |
| `VITE_SUPABASE_URL`             | Your Supabase project URL                    |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key (safe to ship) |
| `VITE_SUPABASE_PROJECT_ID`      | Supabase project ref                         |

The anon key is meant to be public; row-level security (see
`supabase/migrations`) guards the data.

## Steam sign-in & data sync

Steam authenticates via **OpenID 2.0** (not OAuth2) and exposes data through the
**Steam Web API**, which requires a secret key and does **not** allow browser
calls (no CORS). So all Steam access goes through a small server-side proxy.

The flow:

1. **Sign in** — `useSteam().signIn()` redirects to `steamcommunity.com/openid/login`.
2. **Callback** — Steam returns to `/steam-callback` with a signed assertion.
   The client posts it to `POST /api/steam/verify`, which replays it to Steam
   (`mode=check_authentication`) and returns the verified 64-bit Steam ID.
3. **Fetch & parse** — the app calls `GET /api/steam/library`, which uses the
   Steam Web API to pull the player's profile, owned games (playtime, last
   played, cover art) and, for the most-played titles, their achievements and
   global rarity — all parsed into the app's `Game` model (`src/lib/steam.ts`).
4. The library renders in place of the demo data; the session is kept in
   `localStorage` so it survives refreshes.

### Running it

1. Get a [Steam Web API key](https://steamcommunity.com/dev/apikey).
2. Add it to `.env` as `STEAM_API_KEY` (no `VITE_` prefix — it stays server-side):
   ```
   STEAM_API_KEY="your_key_here"
   ```
3. Restart `npm run dev`, then click **Sign in with Steam**.

> Your Steam profile and "Game details" privacy must be **Public** for owned
> games and achievements to be returned by the API.

### Dev vs. production

- **Dev** — `/api/steam/*` is served by a Vite middleware
  (`vite-plugin-steam.ts`) running in the dev server's Node process.
- **Production** — the SPA is static, so deploy the equivalent Supabase edge
  function (`supabase/functions/steam-auth`, same routes), set its secret with
  `supabase secrets set STEAM_API_KEY=...`, and point the client at it via
  `VITE_STEAM_API_BASE` (see `.env.example`).

## Project structure

```
src/
  components/        UI components (GameCard [MUI], LauncherDashboard, Logo, …)
    ui/              shadcn/ui primitives
  data/              mock demo library
  hooks/             useAuth, useSteam (session + library), toast
  integrations/      Supabase client + generated types
  lib/               steam.ts (fetch+parse), steamClient.ts, launchers, logos, utils
  pages/             routed pages (Index, NotFound)
  theme/             MUI theme (muiTheme.ts)
  types/             domain types (Game, Achievement, …)
public/logos/        swappable launcher/brand logos (see src/lib/logos.ts)
vite-plugin-steam.ts dev-only Steam Web API middleware
supabase/
  functions/         edge functions (steam-auth = Steam proxy for prod)
  migrations/        database schema
```
