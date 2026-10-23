# Dsync — features, changes, and roadmap

Updated: 2026-09-20

## Product direction

Dsync is a desktop companion for the games you play. Its strongest immediate addition is help during a session: search a resource or mission, see a reference image and guide, and return to playing. Preserve the custom logos and game borders made by your friend. **Latest design decision: retain the current Dsync frontend and adopt only the preview's card framing.** The broader preview layouts felt too corporate to the user.

## Implemented in this session

### UI cleanup after game-aware wiki changes

- Replaced the separate game-filter input and native dropdown with one searchable game picker, using Dsync's existing popover and command components.
- Consolidated the page header and made automatic game following a compact switch.
- Moved game status, wiki source, and completion-time information into a desktop sidebar; on narrow screens these appear below the guide.
- Removed empty completion-time columns when no times have been saved. Source lookup and manual editing remain available.
- Reduced duplicate panels, redundant spacing, and overly wide article text. Search and image results now appear near the top.
- Added direct starter-game choices to the empty state. Retained the current app theme, navigation, logos, and library card borders.

### Game-aware wiki and completion times

- Wiki game picker combines the Steam account library, locally installed games, and a small set of examples. Games can be filtered by name.
- **Follow current game** uses desktop Steam running-game detection, with web presence as the browser alternative. Reads the running game immediately on mounting, follows subsequent game changes, and returns to the manual selection when the game stops.
- Manually choosing a game turns following off for the current view and saves the chosen game locally.
- Every game detail drawer now links to that game's wiki selection.
- In-app article/image search is connected for **Warframe, Baldur's Gate 3, and Terraria**. Search caches, article sources, attribution, and bookmarks are separated by wiki.
- Other games have a per-game saved HTTPS wiki link, external gameplay-wiki discovery, and a clearly labelled PCGamingWiki fixes/compatibility link. This is not yet full in-app article coverage for every game.
- HowLongToBeat sections appear in game details and the wiki. They link to a source lookup and store main-story, main-plus-extras, and completionist hours separately per game, with an optional source page link.
- **Limitation:** the HowLongToBeat site returned HTTP 403 for automated access. Automatic completion-time retrieval is not implemented. Times are user-entered and explicitly labelled as manually saved, not verified live data. No estimates were invented.
- Browser checks covered game selection, isolated results, initial running-game detection, switching/stopping games, and per-game completion-time persistence using an isolated profile and mocked native events.

### Wishlist calendar opens Steam

- Calendar day entries, monthly release cards, and undated release entries now hand desktop clicks to the existing native Steam store-page command.
- Desktop opens `steam://store/<appid>` through the bridge; ordinary browser use retains website links. Native launch failures show a toast.
- Verified the native handoff with a mocked bridge; no actual game purchase or download was triggered.

### Wiki integration revision

- Restyled the wiki with the app's existing theme tokens, shared Input/Button components, container width, and card surfaces. Removed the separate amber/editorial styling.
- Search now runs after a short typing pause; results include article thumbnails and short descriptions before opening a guide.
- Added visual starter cards, clear-search control, and thumbnail fallbacks for pages without images.
- Preserved source search order when enriching results with images in a batch request.
- Removed the design options link, the preview page and its styles. Old `/designs` URLs redirect to `/wiki`.
- Original screenshots remain historical artifacts only. The three preview layouts below describe earlier exploration, not current routes or options.

### Steam badge branding

- Steam launcher badges now use Steam's own icon rather than the Dsync launcher mark, across game cards, lists, and details.
- Saved the icon locally as `public/logos/steam.ico`, sourced from https://store.steampowered.com/favicon.ico.
- The main Dsync logo and the friend's frame/download artwork remain in place.

### Steam installation from Dsync

- Added **Install via Steam** to desktop game details for uninstalled Steam games.
- Uses the existing restricted desktop bridge to open `steam://install/<appid>`; Steam asks for the destination and confirmation and owns the actual download.
- Shows opening/requested/error feedback rather than claiming a download started when the dialog opens.
- Shows Steam-reported download/update progress and paused state in the drawer.
- Shows Play only when the local manifest reports the game as installed; install/update is offered for other incomplete states without progress.
- Handles failures of local Steam detection without leaving an endless loading state.
- No silent installation, custom download engine, or automatic download was performed during implementation.
- Uses the friend's `Border_BLeft_Download.png` for the install control and `Border_BLeft_DownloadProgressMT.png` for progress, with the original orange fill region.
- Library frames now reflect local install state: play artwork for installed Steam games, download artwork for uninstalled games, and the custom progress bar while Steam reports a download. Achievement synchronisation no longer determines the download glyph.
- Drawer progress subscribes to live download updates rather than relying on the less-frequent library-state events.

### Warframe wiki

- New **Wiki** tab and `/wiki` page.
- A direct wiki link in Warframe's game detail drawer.
- Live search of the independent Warframe Wiki for resources, missions, quests, and other articles.
- Article text grouped by headings, including acquisition and gathering information where supplied by the wiki.
- Reference image when the article exposes one. Iradite currently shows its item icon, not an in-world deposit photograph.
- Iradite opens first, with Earth / Cetus / Plains of Eidolon shown explicitly.
- Quick links to Iradite, Grokdrul, The Archwing, and Spy.
- Saved guide titles stored locally, with a session-only notice if storage fails.
- Loading, no-result, unavailable-image, connection-error, retry, and full-wiki fallback states.
- Requests have a timeout and cancellation; search and article responses are cached in memory.
- Plain text rendering: remote article HTML and scripts are not injected.
- Source links and CC BY-NC-SA 3.0 attribution.
- Mobile navigation wraps to accommodate the added Wiki tab.

### Frontend examples

Earlier design exploration (now removed from the app) included:

1. **Charcoal** — matte neutral surfaces, restrained orange, a spacious library, and a guide sidebar. Explored but not selected as the app layout.
2. **Compact slate** — cool muted colours and compact game rows for a denser desktop view.
3. **Field notes** — warm light surfaces and a reading-oriented style.

Those previews used sample games and the original `DsyncWordmark` and `GameFrame` components without changing the artwork. Their screenshots are retained for reference.

These are design previews, not a replacement for the main library. The current theme settings remain intact. No redesign of the friend's logos or border assets was made.

### Chosen direction: original frontend with preview card framing

- Retained the existing library layout, navigation, theme controls, game information, achievements, and detail drawer.
- Applied the preview's portrait framing to actual library cards: inset cover artwork by 6px, tightened frame-piece spacing to 7px, and increased frame visibility.
- Removed the cards' extra rounded outer box, hover glow, lift, and cover zoom so the original angular artwork defines their shape.
- Kept theme-aware hover colour and perfect-game colours, plus play/download states, existing badges, keyboard focus, and click behaviour.
- The frame and logo art remain the friend's existing assets; these are presentation changes, not replacement artwork.
- The three design examples were subsequently removed from the app after the user selected the existing frontend.

## Limits and costs

- This implementation calls the public Warframe Wiki API directly. No paid AI service, AI subscription, or API key is configured or required by this feature.
- Internet access is needed for live search, article text, and wiki images. Saved titles survive restarting; full articles are not downloaded for offline use.
- In-app wiki adapters currently cover Warframe, Baldur's Gate 3, and Terraria. Other games support saved external wiki links pending dedicated adapters.
- Article previews omit tables, embedded maps, and interactive content. Full-article links provide those details.
- This is an in-app companion page, not an overlay injected into a running game.
- The wiki reports **CC BY-NC-SA 3.0** for its text, including a noncommercial restriction. Resolve content licensing before monetising redistribution. Image rights can differ.
- Wiki availability, completeness, and article updates remain external dependencies. No generated farming advice is presented as verified fact.

## Existing project features observed (not newly added here)

- Steam sign-in and library synchronisation, plus a demo library.
- Library grid/list views, filters, collections, achievement progress, and game details.
- News and statistics pages, a release calendar component, and achievement heatmap component.
- Theme selection and existing custom visual assets.
- Electron desktop integration including Steam launch/install links, local library detection, desktop settings, and tray behaviour.

These were already present in the workspace. Their full production behaviour was not audited in this session.

## Ideas from the discussion — proposed, not implemented

| Feature | Intended value | Scope / dependency |
| --- | --- | --- |
| Steam reviews inside game pages | Judge recent player sentiment without another tab | Add review retrieval, useful filters, source links, and freshness |
| Trusted mod links | Point players to Nexus, Steam Workshop, or game-specific sources | Curate per game; link out rather than install mods initially |
| Delisting watch | Notice games announced for removal from stores | Require dated announcements and reliable sources; distinguish rumours |
| More game wikis | Extend the Warframe workflow | Prefer official/independent wikis; evaluate API access and licences separately |
| Followed-game update and release calendar | Plan around releases and major updates | Extend the existing calendar rather than create another one |
| Optional accounts / leaderboards | Compare achievements with friends | Keep local use useful; social features require identity and backend support |
| Friend session tools | Make playing different games together easier | Start with invitations/session context; linked deaths or shared chests require specific game mods |
| Simplified linked-game mod setup | Reduce setup for shared-event challenges | Separate integration project; not generic support for every game |
| LFG | Find players for smaller/co-op games | Needs enough active users, moderation, and privacy controls |
| Compatibility / stability notes | Highlight well-supported fixes for known game/hardware combinations | Use sourced reports; avoid inventing a universal stability score |
| Soundtracks / let's plays | Optional contextual links | Lower priority than useful guides and mod sources |
| Preservation / unavailable games | Help users find legitimate availability information | Separate research and product scope; not an implemented download/archive service |

Suggested sequence: validate wiki and visual direction → game-specific review/mod links → reliable update/delisting information → larger social/integration features if demand justifies them.

## Validation and review

- Windows x64 release built successfully on 2026-09-20 with `npm.cmd run dist`.
- Installer: `D:\Dev\Projects\github\dsync\release\Dsync Setup 0.1.0.exe`.
- Run without installing: `D:\Dev\Projects\github\dsync\release\win-unpacked\Dsync.exe`; keep the entire `win-unpacked` folder together.
- The packaged build includes the frontend and Electron runtime and does not require the development server. Packaging success does not establish the cause of the reported Warframe crashes.

- Production frontend build and TypeScript check.
- Targeted ESLint on new TypeScript components and wiki client.
- Hidden Electron browser smoke check: all three designs, live Iradite article/image, Grokdrul search and article navigation, bookmark persistence across reload, and mobile overflow checks.
- Screenshots: `docs/design-previews/charcoal.png`, `slate.png`, `paper.png`, and `warframe-wiki.png` in the project.
- Existing build warnings: large main JavaScript bundle and outdated Browserslist data.
- Desktop package rebuild/restart requested for hands-on testing.

## Main files

- `src/lib/wiki.ts` — API requests and article section parsing.
- `src/components/GameWiki.tsx` — wiki UI using the app's existing design system.
- `src/pages/Wiki.tsx` — app wiki page.
- Historical design screenshots remain in `docs/design-previews`; the preview page and dedicated styles were removed.
- `src/App.tsx`, `src/components/AppNav.tsx` — routes and navigation.
- `src/components/GameDetailDrawer.tsx` — Warframe guide entry point.
- `scripts/check-wiki.cjs` — browser smoke checks and screenshot capture.

## Sources

- [Warframe Wiki](https://wiki.warframe.com/)
- [Iradite article](https://wiki.warframe.com/w/Iradite)
- [Wiki API rights information](https://wiki.warframe.com/api.php?action=query&meta=siteinfo&siprop=rightsinfo&format=json)
- [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/)

This note separates work completed here from pre-existing features and brainstormed ideas. It does not claim that all ideas in the chat have shipped.
