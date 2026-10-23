import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  protocol,
  shell,
  Tray,
  nativeImage,
  screen,
  globalShortcut,
} from "electron";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { createReadStream, existsSync, watch } from "node:fs";
import { join, normalize, sep } from "node:path";
import { Readable } from "node:stream";

import {
  CHANNELS,
  DEFAULT_SETTINGS,
  type DesktopSettings,
  type RedactedSettings,
  type SteamStatus,
  type ArtworkResult,
} from "./ipc";
import { findLibraryFolders, scanLocalLibrary, type LocalGame } from "./steam/localLibrary";
import {
  getRunningAppId,
  installGame,
  isSteamRunning,
  launchGame,
  openStorePage,
} from "./steam/launch";
import { findSteamRoot } from "./steam/paths";
import { readTaskbarTheme, watchTaskbarTheme } from "./taskbarTheme";
import { toIco } from "./ico";
import { installUpdateNow, pendingUpdate, startAutoUpdates } from "./updater";
import { getForegroundWindow, setForegroundWindow, stopWinHelper, warmWinHelper } from "./winHelper";
import { readSteamCollections } from "./steam/collections";
import { readNonSteamGames, runningShortcut, shortcutInfo } from "./steam/shortcuts";
import { findArtwork, saveArtwork } from "./steam/artwork";
import { cancelSteamSignIn, signInWithSteam } from "./steam/openid";
import { createSteamCache, handleSteamRequest } from "../src/server/steamRouter";

// Windows ties taskbar grouping, jump lists and toast attribution to the
// AppUserModelID. Electron's default is derived from the exe path, which makes
// the taskbar button reuse a stale identity (and its cached icon) across
// rebuilds — so pin it to the same id electron-builder ships in package.json.
if (process.platform === "win32") app.setAppUserModelId("com.dsync.app");

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:8080";

/**
 * The packaged app is served from a custom scheme rather than file://, so it
 * gets a stable origin (localStorage survives updates) and so /api/steam/* can
 * be answered in-process. That is what retires the Supabase edge function: the
 * exact same routes the dev server exposes, served natively, with the API key
 * never leaving the main process.
 */
const APP_SCHEME = "dsync";
const APP_ORIGIN = `${APP_SCHEME}://app`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

// ---------------------------------------------------------------- settings --

const settingsFile = () => join(app.getPath("userData"), "settings.json");
let settings: DesktopSettings = { ...DEFAULT_SETTINGS };

async function loadSettings(): Promise<void> {
  try {
    const raw = await readFile(settingsFile(), "utf8");
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  applyLoginItem();
}

async function saveSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings> {
  settings = { ...settings, ...patch };
  applyLoginItem();
  try {
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(settingsFile(), JSON.stringify(settings, null, 2), "utf8");
  } catch {
    // Read-only profile — the setting still applies for this session.
  }
  return settings;
}

/** A copy safe to send to the renderer, with the secret replaced by a flag. */
function redactSettings(s: DesktopSettings): RedactedSettings {
  const { steamApiKey: key, steamGridDbKey: gridKey, ...rest } = s;
  return {
    ...rest,
    hasSteamApiKey: Boolean(key?.trim() || process.env.STEAM_API_KEY?.trim()),
    hasSteamGridDbKey: Boolean(gridKey?.trim() || process.env.STEAMGRIDDB_API_KEY?.trim()),
  };
}

function applyLoginItem(): void {
  if (isDev) return; // never register a dev build for autostart
  app.setLoginItemSettings({
    openAtLogin: settings.launchOnLogin,
    // Start hidden to the tray; the user asked for it to be there, not in front.
    args: ["--hidden"],
  });
}

// ------------------------------------------------------------ steam bridge --

/**
 * The Steam Web API key. Read from the environment for a dev run, or from the
 * settings file for a packaged app, so it is never bundled into the renderer.
 */
const steamApiKey = () =>
  process.env.STEAM_API_KEY?.trim() || settings.steamApiKey?.trim() || undefined;
const steamCache = createSteamCache();

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};

/** Serves the built renderer plus the native /api/steam routes. */
function registerAppProtocol(): void {
  const root = join(__dirname, "../dist");

  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);

    // --- native Steam API, same routes as the dev server ---
    if (url.pathname.startsWith("/api/steam/")) {
      const body =
        request.method === "POST" ? await request.json().catch(() => ({})) : undefined;

      const { status, body: payload } = await handleSteamRequest(
        {
          route: url.pathname.replace("/api/steam/", ""),
          method: request.method,
          params: url.searchParams,
          body,
        },
        steamApiKey(),
        steamCache,
      );

      return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- static assets, with an SPA fallback to index.html ---
    let filePath = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!filePath.startsWith(root)) return new Response("Forbidden", { status: 403 });

    const ext = filePath.slice(filePath.lastIndexOf("."));
    if (!MIME[ext]) filePath = join(root, "index.html");

    try {
      const stream = createReadStream(filePath);
      const type = MIME[filePath.slice(filePath.lastIndexOf("."))] ?? "text/plain";
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers: { "Content-Type": type },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

// ---------------------------------------------------------------- watchers --

let lastLibrary = "";
let lastDownloads = "";
let lastRunning: string | null | undefined;

const send = (channel: string, payload: unknown) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
};

/**
 * Keeps the renderer up to date with installs, downloads and the running game.
 *
 * Installs and downloads: Steam rewrites an app's manifest whenever its state
 * changes, so the library folders are watched and only re-read when one of
 * them changes (a burst of writes, as during a download, is debounced into
 * one re-read). While a download is running the manifests are also re-read
 * every couple of seconds, for a live progress bar; otherwise a slow poll is
 * just a safety net for missed watch events (network drives, new folders).
 *
 * The running game is checked every few seconds; that is one cheap question
 * to the long-lived helper (see winHelper.ts), not a spawned process.
 */
function startWatchers(): void {
  const DOWNLOAD_POLL_MS = 2500;
  const IDLE_POLL_MS = 60_000;
  const RUNNING_POLL_MS = 2500;

  let scanning = false;
  let rescanQueued = false;
  let lastScan = 0;

  const scan = async () => {
    if (scanning) {
      rescanQueued = true;
      return;
    }
    scanning = true;
    lastScan = Date.now();
    try {
      const games = await scanLocalLibrary();

      const librarySignature = games.map((g) => `${g.appid}:${g.state}`).join(",");
      if (librarySignature !== lastLibrary) {
        lastLibrary = librarySignature;
        send(CHANNELS.onLibraryChanged, games);
      }

      const downloading = games.filter((g) => g.downloadProgress !== null);
      const downloadSignature = downloading
        .map((g) => `${g.appid}:${g.downloadProgress?.toFixed(1)}`)
        .join(",");
      if (downloadSignature !== lastDownloads) {
        const finished = lastDownloads !== "" && downloadSignature === "";
        lastDownloads = downloadSignature;
        send(CHANNELS.onDownloadsChanged, downloading);
        if (finished) notify("Download complete", "Your Steam downloads have finished.");
      }
    } catch {
      // A drive went away mid-scan; the next scan will pick it back up.
    } finally {
      scanning = false;
      if (rescanQueued) {
        rescanQueued = false;
        void scan();
      }
    }
  };

  // Watch every steamapps folder; a burst of writes becomes one re-read.
  let debounce: NodeJS.Timeout | undefined;
  const onFolderChange = (_event: string, file: string | Buffer | null) => {
    if (file && !String(file).toLowerCase().endsWith(".acf")) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => void scan(), 750);
  };
  void findLibraryFolders().then((folders) => {
    for (const folder of folders) {
      try {
        watch(folder, { persistent: false }, onFolderChange);
      } catch {
        // Unwatchable (permissions, odd drive): the slow poll covers it.
      }
    }
  });

  setInterval(() => {
    const interval = lastDownloads ? DOWNLOAD_POLL_MS : IDLE_POLL_MS;
    if (Date.now() - lastScan >= interval) void scan();
  }, DOWNLOAD_POLL_MS);

  const checkRunning = async () => {
    try {
      // Steam apps from the registry; non-Steam games by their process.
      const running = (await getRunningAppId()) ?? (await runningShortcut());
      if (running !== lastRunning) {
        const started = running && running !== lastRunning;
        lastRunning = running;
        send(CHANNELS.onRunningAppChanged, running);
        syncOverlay();
        if (started) {
          const games = await scanLocalLibrary();
          const game = games.find((g) => g.appid === running);
          if (game) notify("Now playing", game.name);
        }
      }
    } catch {
      // Helper unavailable: presence just stays unknown until it's back.
    }
  };

  void scan();
  void checkRunning();
  setInterval(checkRunning, RUNNING_POLL_MS);
}

function notify(title: string, body: string): void {
  if (!settings.notifications || !Notification.isSupported()) return;
  new Notification({ title, body, icon: appIcon() }).show();
}

// -------------------------------------------------------------- window/tray --

/**
 * The window/tray icon.
 *
 * nativeImage.createFromPath is native code, so it does not go through the
 * patched `fs` that makes an asar archive readable — the file is listed in
 * build.asarUnpack and the path is rewritten to the unpacked copy. Without
 * this the call silently returns an empty image and Windows falls back to
 * whatever icon it had cached.
 */
const bundledIcon = () =>
  nativeImage.createFromPath(
    join(__dirname, "../build/icon.ico").replace(
      `app.asar${sep}`,
      `app.asar.unpacked${sep}`,
    ),
  );

/** The themed icon the renderer painted last session, so launch starts with it. */
const themedIconPath = () => join(app.getPath("userData"), "app-icon.png");

const appIcon = () => {
  if (existsSync(themedIconPath())) {
    const themed = nativeImage.createFromPath(themedIconPath());
    if (!themed.isEmpty()) return themed;
  }
  return bundledIcon();
};

/** Swaps in a renderer-painted icon. Only PNG data URLs, and small ones, are accepted. */
async function setAppIcon(dataUrl: unknown): Promise<void> {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,") || dataUrl.length > 1_000_000) return;
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) return;
  mainWindow?.setIcon(image);
  tray?.setImage(image.resize({ width: 32, height: 32 }));
  await writeFile(themedIconPath(), image.toPNG()).catch(() => {});
  await setTaskbarIcon(image).catch(() => {});
}

/**
 * Keeps the taskbar button in step with the themed icon.
 *
 * When a Start Menu shortcut carries the same AppUserModelID as the window,
 * the taskbar shows the shortcut's icon and only re-reads it when the
 * window is created, so a theme change wouldn't show until a restart. The
 * window therefore gets its own ID (TASKBAR_ID); with no shortcut claiming
 * it, the taskbar uses the window's icon, which setIcon updates live.
 * The process-wide ID stays com.dsync.app for notifications.
 *
 * The icon is also written as an .ico for Dsync's own Start Menu and
 * desktop shortcuts. Each repaint gets a new
 * file name, since Windows caches icons by path, and old files are removed.
 */
async function setTaskbarIcon(image: Electron.NativeImage): Promise<void> {
  if (process.platform !== "win32" || !mainWindow) return;
  const dir = app.getPath("userData");
  const name = `taskbar-icon-${Date.now()}.ico`;
  await writeFile(join(dir, name), toIco(image));
  applyTaskbarIcon(join(dir, name));
  for (const file of await readdir(dir)) {
    if (/^taskbar-icon-d+.ico$/.test(file) && file !== name) await unlink(join(dir, file)).catch(() => {});
  }
}

const TASKBAR_ID = "com.dsync.app.window";

function applyTaskbarIcon(icoPath: string): void {
  // No relaunch icon here: when one is set, the taskbar button shows it and
  // ignores the window's icon, which is the one setIcon can change live.
  mainWindow?.setAppDetails({ appId: TASKBAR_ID });
  for (const link of ownShortcuts()) {
    try {
      shell.writeShortcutLink(link, "update", { ...shell.readShortcutLink(link), icon: icoPath, iconIndex: 0 });
    } catch {
      /* a locked or odd shortcut keeps its old icon */
    }
  }
}

/**
 * Start Menu and desktop shortcuts that launch this very exe. Shortcuts to
 * other copies (an older install, a dev build) are left alone.
 */
function ownShortcuts(): string[] {
  const candidates = [
    join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Dsync.lnk"),
    join(app.getPath("desktop"), "Dsync.lnk"),
  ];
  return candidates.filter((link) => {
    if (!existsSync(link)) return false;
    try {
      return normalize(shell.readShortcutLink(link).target).toLowerCase() === normalize(process.execPath).toLowerCase();
    } catch {
      return false;
    }
  });
}

/** On launch, reuse the last themed taskbar icon until the renderer repaints. */
async function restoreTaskbarIcon(): Promise<void> {
  if (process.platform !== "win32") return;
  const dir = app.getPath("userData");
  const last = (await readdir(dir).catch(() => [] as string[]))
    .filter((f) => /^taskbar-icon-d+.ico$/.test(f))
    .sort()
    .pop();
  if (last) applyTaskbarIcon(join(dir, last));
  else mainWindow?.setAppDetails({ appId: TASKBAR_ID });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: "#0e1015",
    autoHideMenuBar: true,
    icon: appIcon(),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // the preload needs require() for electron's own modules
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!process.argv.includes("--hidden")) mainWindow?.show();
  });

  // External links open in the user's browser, never in an app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (!quitting && settings.minimiseToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (isDev) {
    void mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadURL(`${APP_ORIGIN}/`);
  }
}

function showWindow(): void {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Quits for real (not to the tray) and installs the downloaded update. */
function restartToUpdate(): void {
  quitting = true;
  installUpdateNow();
}

function createTray(): void {
  // Rebuilt when an update arrives, to add the "Restart to update" item.
  tray?.destroy();
  tray = new Tray(appIcon());
  tray.setToolTip("Dsync");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Dsync", click: showWindow },
      ...(pendingUpdate()
        ? [{ label: `Restart to update (${pendingUpdate()})`, click: restartToUpdate }]
        : []),
      { type: "separator" },
      {
        label: "Start with Windows",
        type: "checkbox",
        checked: settings.launchOnLogin,
        click: (item) => void saveSettings({ launchOnLogin: item.checked }),
      },
      {
        label: "Notifications",
        type: "checkbox",
        checked: settings.notifications,
        click: (item) => void saveSettings({ notifications: item.checked }),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", showWindow);
}

// -------------------------------------------------------------------- ipc ---

function registerIpc(): void {
  ipcMain.handle(CHANNELS.localLibrary, () => scanLocalLibrary());

  ipcMain.handle(CHANNELS.steamStatus, async (): Promise<SteamStatus> => {
    const root = await findSteamRoot();
    return { installed: Boolean(root), running: await isSteamRunning(), root };
  });

  ipcMain.handle(CHANNELS.runningApp, () => getRunningAppId());
  ipcMain.handle(CHANNELS.nonSteamGames, (_e, steamId?: string) =>
    readNonSteamGames(typeof steamId === "string" ? steamId : undefined),
  );
  ipcMain.handle(CHANNELS.pendingUpdate, () => pendingUpdate());
  ipcMain.handle(CHANNELS.installUpdate, () => restartToUpdate());
  ipcMain.handle(CHANNELS.nonSteamArtwork, async (_e, appid: unknown, overwrite: unknown): Promise<ArtworkResult> => {
    const info = typeof appid === "string" ? shortcutInfo(appid) : null;
    if (!info) return { saved: [], source: null, error: "Unknown non-Steam game." };
    const gridKey = settings.steamGridDbKey?.trim() || process.env.STEAMGRIDDB_API_KEY?.trim();
    try {
      const set = await findArtwork(info.name, gridKey);
      if (!set) {
        return {
          saved: [],
          source: null,
          error: gridKey
            ? "No artwork found for this game on the Steam store or SteamGridDB."
            : "Not on the Steam store. Add a free SteamGridDB key in Settings to find art for it.",
        };
      }
      const saved = await saveArtwork(info.gridDir, appid as string, set, overwrite === true);
      return { saved, source: set.source };
    } catch (err) {
      return { saved: [], source: null, error: err instanceof Error ? err.message : "Couldn't fetch artwork." };
    }
  });
  ipcMain.handle(CHANNELS.steamCollections, (_e, steamId?: string) =>
    readSteamCollections(typeof steamId === "string" ? steamId : undefined),
  );

  // Sign-in happens in the user's own browser; bring the window forward once
  // they come back so the app isn't left behind the browser they just used.
  ipcMain.handle(CHANNELS.signIn, async () => {
    const steamId = await signInWithSteam();
    showWindow();
    return steamId;
  });
  ipcMain.handle(CHANNELS.launchGame, (_e, appid: string) => launchGame(appid));
  ipcMain.handle(CHANNELS.installGame, (_e, appid: string) => installGame(appid));
  ipcMain.handle(CHANNELS.openStore, (_e, appid: string) => openStorePage(appid));

  // The API key is deliberately stripped: the renderer only needs to know
  // whether one is configured, never its value.
  ipcMain.handle(CHANNELS.getSettings, () => redactSettings(settings));
  ipcMain.handle(CHANNELS.setSettings, async (_e, patch: Partial<DesktopSettings>) => {
    const saved = redactSettings(await saveSettings(patch));
    applyOverlaySettings(patch);
    return saved;
  });
  ipcMain.handle(CHANNELS.fitOverlay, (_e, height: unknown) => fitOverlay(height));
  ipcMain.handle(CHANNELS.setOverlayEditing, (_e, on: unknown) => setOverlayEditing(on === true));
  ipcMain.handle(CHANNELS.setOverlayInteractive, (_e, on: unknown) => setOverlayInteractive(on));
  ipcMain.handle(CHANNELS.taskbarTheme, () => readTaskbarTheme());
  ipcMain.handle(CHANNELS.setAppIcon, (_e, dataUrl: unknown) => setAppIcon(dataUrl));
  ipcMain.handle(CHANNELS.notify, (_e, { title, body }: { title: string; body: string }) =>
    notify(title, body),
  );
}

// ------------------------------------------------------------- overlay ----

/**
 * The in-game overlay: a small always-on-top window over the game showing
 * the next achievement to go for, any pinned ones, and the game's notes.
 *
 * It behaves like Discord's: switched on or off in Dsync's settings, shown
 * whenever a game is running while it is on, and otherwise hands-off. It is
 * click-through, so it never catches a click meant for the game, except
 * over the notes box, which the renderer claims while the pointer is on it
 * (setIgnoreMouseEvents with forward, so it still sees the pointer move) so
 * notes can be typed any time. Pressing OVERLAY_HOTKEY toggles edit mode,
 * where it can be dragged, resized and achievements pinned; pressing it
 * again locks it in place and remembers the spot.
 *
 * It works over windowed and borderless games; exclusive fullscreen allows
 * nothing on top.
 */
export const OVERLAY_HOTKEY = "CommandOrControl+Shift+D";
const DEFAULT_OVERLAY_OPACITY = 0.88;
const DEFAULT_OVERLAY_WIDTH = 320;
const MARGIN = 16;

let overlayWindow: BrowserWindow | null = null;
let overlayEditing = false;
let overlayEditStart: Electron.Rectangle | null = null;

/** The overlay window if it is open, else null. */
const liveOverlay = (): BrowserWindow | null =>
  overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null;

function overlayUrl(appid: string): string {
  const query = `?appid=${encodeURIComponent(appid)}`;
  return isDev ? `${DEV_URL}/overlay${query}` : `${APP_ORIGIN}/overlay${query}`;
}

/** Open while a game runs and the setting is on; closed otherwise. */
function syncOverlay(): void {
  if (settings.achievementOverlay && lastRunning) openOverlay(lastRunning);
  else closeOverlay();
}

/** The screen the overlay belongs on: where it was left, else under the mouse. */
function overlayDisplay(): Electron.Display {
  const saved = settings.overlayBounds;
  if (saved) {
    const match = screen.getDisplayMatching(saved);
    const a = match.workArea;
    const visible = saved.x < a.x + a.width && saved.x + saved.width > a.x && saved.y < a.y + a.height && saved.y >= a.y - 10;
    if (visible) return match;
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

/** Bounds for a given height: the custom spot, or the chosen corner. */
function overlayBounds(height: number): Electron.Rectangle {
  const saved = settings.overlayBounds;
  const width = saved?.width ?? DEFAULT_OVERLAY_WIDTH;
  const { workArea: a } = overlayDisplay();
  const h = Math.max(60, Math.min(height, a.height - 2 * MARGIN));
  const corner = settings.overlayCorner ?? "top-left";
  if (corner === "custom" && saved) {
    return { x: saved.x, y: Math.min(saved.y, a.y + a.height - h), width, height: h };
  }
  const left = a.x + MARGIN;
  const right = a.x + a.width - width - MARGIN;
  const top = a.y + MARGIN;
  const bottom = a.y + a.height - h - MARGIN;
  const [x, y] =
    corner === "top-right" ? [right, top] : corner === "bottom-left" ? [left, bottom] : corner === "bottom-right" ? [right, bottom] : [left, top];
  return { x, y, width, height: h };
}

function openOverlay(appid: string): void {
  const existing = liveOverlay();
  if (existing) {
    if (!existing.webContents.getURL().includes(`appid=${appid}`)) void existing.loadURL(overlayUrl(appid));
    existing.showInactive();
    return;
  }

  overlayWindow = new BrowserWindow({
    ...overlayBounds(160),
    minWidth: 220,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: "Dsync overlay",
    backgroundColor: "#0f1013",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  // "screen-saver" is the level that stays above borderless-fullscreen games.
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setOpacity(settings.overlayOpacity ?? DEFAULT_OVERLAY_OPACITY);
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  // Keep its own title rather than the page's, so it reads as the overlay in Alt-Tab.
  overlayWindow.on("page-title-updated", (event) => event.preventDefault());
  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  // Shown without taking focus, so the game keeps it.
  overlayWindow.once("ready-to-show", () => overlayWindow?.showInactive());
  overlayWindow.on("closed", () => {
    overlayWindow = null;
    overlayEditing = false;
  });
  void overlayWindow.loadURL(overlayUrl(appid));
}

function closeOverlay(): void {
  liveOverlay()?.close();
  overlayWindow = null;
  overlayEditing = false;
}

/**
 * Edit mode: the overlay takes the mouse and keyboard so it can be moved,
 * resized and typed into. Leaving it saves where it was put; moving it by
 * hand makes the position "custom".
 */
function setOverlayEditing(on: boolean): void {
  const win = liveOverlay();
  if (!win || on === overlayEditing) return;
  overlayEditing = on;
  win.setIgnoreMouseEvents(!on, { forward: true });
  win.setResizable(on);
  win.webContents.send(CHANNELS.onOverlayEditing, on);
  if (on) {
    overlayEditStart = win.getBounds();
    // The fitted card is too short for the notes and pin list; give edit
    // mode room (the card refits itself afterwards).
    const { workArea: a } = screen.getDisplayMatching(overlayEditStart);
    const height = Math.min(Math.max(overlayEditStart.height, 480), a.y + a.height - overlayEditStart.y - MARGIN);
    win.setBounds({ ...overlayEditStart, height });
    win.focus();
    // A fullscreen game can refuse focus to a window it didn't open;
    // the helper's Alt-tap unlock gets the overlay in front regardless.
    void setForegroundWindow(nativeHandle(win));
  } else {
    const end = win.getBounds();
    const moved = overlayEditStart && (end.x !== overlayEditStart.x || end.y !== overlayEditStart.y);
    // Only the spot and width are kept; the height follows the content.
    void saveSettings({ overlayBounds: end, ...(moved ? { overlayCorner: "custom" as const } : {}) });
    // Hand the keyboard back to the window the player was in (the game, or
    // whatever was in front) when they pressed the hotkey.
    const previous = overlayPrevFocus;
    overlayPrevFocus = null;
    if (previous) {
      void setForegroundWindow(previous);
    } else {
      // Unknown: hiding the overlay makes Windows activate the window
      // beneath it, then it comes back without taking focus.
      win.hide();
      setTimeout(() => liveOverlay()?.showInactive(), 60);
    }
  }
}

/** Called by the overlay as the pointer enters or leaves its notes box. */
function setOverlayInteractive(on: unknown): void {
  const win = liveOverlay();
  if (!win || overlayEditing) return;
  win.setIgnoreMouseEvents(on !== true, { forward: true });
}

/** The overlay sizes itself to its content; only the height changes. */
function fitOverlay(height: unknown): void {
  const win = liveOverlay();
  if (!win || overlayEditing || typeof height !== "number" || !Number.isFinite(height)) return;
  win.setBounds(overlayBounds(Math.ceil(height)));
}

/** Applies overlay-related changes from a settings patch. */
function applyOverlaySettings(patch: Partial<DesktopSettings>): void {
  if ("achievementOverlay" in patch) syncOverlay();
  const win = liveOverlay();
  if (!win) return;
  if ("overlayOpacity" in patch) win.setOpacity(settings.overlayOpacity ?? DEFAULT_OVERLAY_OPACITY);
  if ("overlayCorner" in patch && settings.overlayCorner !== "custom") {
    win.setBounds(overlayBounds(win.getBounds().height));
  }
}

/** A window's HWND as a decimal string, for the foreground helper. */
function nativeHandle(win: BrowserWindow): string {
  const buf = win.getNativeWindowHandle();
  return (buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0))).toString();
}

/** The window in front when edit mode began, to give focus back to after. */
let overlayPrevFocus: string | null = null;

function registerOverlayHotkey(): void {
  warmWinHelper();
  globalShortcut.register(OVERLAY_HOTKEY, async () => {
    if (!overlayEditing && liveOverlay()) overlayPrevFocus = await getForegroundWindow();
    setOverlayEditing(!overlayEditing);
  });
}

// ------------------------------------------------------------------ boot ----

// One instance only: a second launch focuses the running window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    stopWinHelper();
  });

  void app.whenReady().then(async () => {
    await loadSettings();
    if (!isDev) registerAppProtocol();
    registerIpc();
    createWindow();
    createTray();
    void restoreTaskbarIcon();
    registerOverlayHotkey();
    startAutoUpdates((version) => {
      send(CHANNELS.onUpdateReady, version);
      createTray();
      if (settings.notifications) {
        const note = new Notification({ title: `Dsync ${version} is ready`, body: "Click to restart and update, or it installs next time you quit.", icon: appIcon() });
        note.on("click", restartToUpdate);
        note.show();
      }
    });
    startWatchers();
    watchTaskbarTheme((theme) => send(CHANNELS.onTaskbarThemeChanged, theme));

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", () => {
    quitting = true;
    cancelSteamSignIn();
  });

  app.on("window-all-closed", () => {
    // The tray keeps the app alive on Windows/Linux; macOS keeps it by
    // convention anyway.
    if (process.platform !== "darwin" && !settings.minimiseToTray) app.quit();
  });
}
