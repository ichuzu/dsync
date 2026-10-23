import type { LocalGame } from "./steam/localLibrary";
import type { SteamCollection } from "./steam/collections";

/**
 * The contract between the Electron main process and the renderer.
 *
 * Both sides import these names, so a renamed channel or a changed payload is
 * a TypeScript error rather than a silently dead listener at runtime.
 */

export const CHANNELS = {
  // Renderer -> main (invoke/handle)
  localLibrary: "dsync:local-library",
  launchGame: "dsync:launch-game",
  installGame: "dsync:install-game",
  openStore: "dsync:open-store",
  runningApp: "dsync:running-app",
  steamStatus: "dsync:steam-status",
  getSettings: "dsync:get-settings",
  setSettings: "dsync:set-settings",
  notify: "dsync:notify",
  signIn: "dsync:steam-sign-in",
  steamCollections: "dsync:steam-collections",
  setAppIcon: "dsync:set-app-icon",
  taskbarTheme: "dsync:taskbar-theme",
  fitOverlay: "dsync:fit-overlay",
  setOverlayEditing: "dsync:overlay-editing",
  setOverlayInteractive: "dsync:overlay-interactive",

  // Main -> renderer (send/on)
  onLibraryChanged: "dsync:library-changed",
  onDownloadsChanged: "dsync:downloads-changed",
  onRunningAppChanged: "dsync:running-app-changed",
  onTaskbarThemeChanged: "dsync:taskbar-theme-changed",
  onOverlayEditing: "dsync:overlay-editing-changed",
} as const;

export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface SteamStatus {
  /** Steam is installed and we found its folders. */
  installed: boolean;
  /** The Steam client process is up. */
  running: boolean;
  /** Absolute path to the install, for display. */
  root: string | null;
}

export interface DesktopSettings {
  /** Start Dsync when the user logs in. */
  launchOnLogin: boolean;
  /** Closing the window hides to the tray instead of quitting. */
  minimiseToTray: boolean;
  /** Toast when a download finishes or a game starts. */
  notifications: boolean;
  /** Show the in-game overlay whenever a game is running. */
  achievementOverlay: boolean;
  /** Which corner the overlay sits in, or "custom" once dragged in edit mode. */
  overlayCorner?: OverlayCorner | "custom";
  /** Where the overlay was last left (and its width), in screen coordinates. */
  overlayBounds?: { x: number; y: number; width: number; height: number };
  /** Overlay window opacity, 0.4–1. */
  overlayOpacity?: number;
  /**
   * Steam Web API key. Held in the main process only and never sent to the
   * renderer, which is why a packaged build needs no .env and no hosted proxy.
   */
  steamApiKey?: string;
}

/**
 * What the renderer actually receives: the same settings with the secret
 * swapped for a boolean, so the key never crosses the bridge.
 */
export interface RedactedSettings extends Omit<DesktopSettings, "steamApiKey"> {
  hasSteamApiKey: boolean;
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  launchOnLogin: false,
  minimiseToTray: true,
  notifications: true,
  achievementOverlay: true,
};

/**
 * The surface exposed on `window.dsync` by the preload script.
 *
 * Only these functions cross the context bridge — the renderer never gets
 * `require`, `ipcRenderer`, or anything else from Node.
 */
export interface DsyncBridge {
  /** Always true; its presence is how the renderer detects the desktop build. */
  readonly isDesktop: true;
  readonly platform: NodeJS.Platform;
  readonly version: string;

  getLocalLibrary(): Promise<LocalGame[]>;
  getSteamStatus(): Promise<SteamStatus>;
  getRunningApp(): Promise<string | null>;

  /**
   * The Steam client's library collections, read from its local files. Pass
   * the signed-in Steam ID to pick the right account on a shared PC.
   */
  getSteamCollections(steamId?: string): Promise<SteamCollection[]>;

  /**
   * Signs in with Steam via the system browser and a loopback redirect.
   * Resolves with the verified 64-bit Steam ID.
   */
  signInWithSteam(): Promise<string>;

  launchGame(appid: string): Promise<void>;
  installGame(appid: string): Promise<void>;
  openStorePage(appid: string): Promise<void>;

  getSettings(): Promise<RedactedSettings>;
  setSettings(patch: Partial<DesktopSettings>): Promise<RedactedSettings>;
  notify(title: string, body: string): Promise<void>;

  /**
   * Replaces the window, taskbar and tray icon with a PNG (data URL) the
   * renderer painted in the current theme. Also kept for the next launch.
   */
  setAppIcon(pngDataUrl: string): Promise<void>;

  /** Whether the Windows taskbar is light or dark (separate from the app mode). */
  getTaskbarTheme(): Promise<"light" | "dark">;

  /** Overlay window only: resize to fit its content (height in px). */
  fitOverlay(height: number): Promise<void>;
  /** Overlay window only: leave (or enter) edit mode, as the hotkey does. */
  setOverlayEditing(on: boolean): Promise<void>;
  /**
   * Overlay window only: take the mouse while the pointer is over something
   * clickable (the notes box); the rest of the overlay stays click-through.
   */
  setOverlayInteractive(on: boolean): Promise<void>;
  /** Overlay window only: edit mode switched on or off. */
  onOverlayEditing(fn: (on: boolean) => void): () => void;
  onTaskbarThemeChanged(fn: (theme: "light" | "dark") => void): () => void;

  /** Each returns an unsubscribe function. */
  onLibraryChanged(fn: (games: LocalGame[]) => void): () => void;
  onDownloadsChanged(fn: (downloading: LocalGame[]) => void): () => void;
  onRunningAppChanged(fn: (appid: string | null) => void): () => void;
}

export type { LocalGame, SteamCollection };
