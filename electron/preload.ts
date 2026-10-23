import { contextBridge, ipcRenderer } from "electron";
import {
  CHANNELS,
  type DesktopSettings,
  type DsyncBridge,
  type LocalGame,
} from "./ipc";

/**
 * The only bridge between the renderer and Node.
 *
 * The window runs with contextIsolation on and nodeIntegration off, so the page
 * — which renders remote Steam content — cannot reach the filesystem or spawn
 * processes. It gets exactly the functions below and nothing else.
 */

/** Wires a main->renderer channel to a callback, returning an unsubscribe. */
function subscribe<T>(channel: string, fn: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const bridge: DsyncBridge = {
  isDesktop: true,
  platform: process.platform,
  version: process.env.DSYNC_VERSION ?? "0.0.0",

  getLocalLibrary: () => ipcRenderer.invoke(CHANNELS.localLibrary),
  getSteamStatus: () => ipcRenderer.invoke(CHANNELS.steamStatus),
  getRunningApp: () => ipcRenderer.invoke(CHANNELS.runningApp),
  getSteamCollections: (steamId) => ipcRenderer.invoke(CHANNELS.steamCollections, steamId),

  signInWithSteam: () => ipcRenderer.invoke(CHANNELS.signIn),

  launchGame: (appid) => ipcRenderer.invoke(CHANNELS.launchGame, appid),
  installGame: (appid) => ipcRenderer.invoke(CHANNELS.installGame, appid),
  openStorePage: (appid) => ipcRenderer.invoke(CHANNELS.openStore, appid),

  getSettings: () => ipcRenderer.invoke(CHANNELS.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(CHANNELS.setSettings, patch),
  notify: (title, body) => ipcRenderer.invoke(CHANNELS.notify, { title, body }),
  setAppIcon: (pngDataUrl) => ipcRenderer.invoke(CHANNELS.setAppIcon, pngDataUrl),
  getTaskbarTheme: () => ipcRenderer.invoke(CHANNELS.taskbarTheme),
  fitOverlay: (height) => ipcRenderer.invoke(CHANNELS.fitOverlay, height),
  setOverlayEditing: (on) => ipcRenderer.invoke(CHANNELS.setOverlayEditing, on),
  setOverlayInteractive: (on) => ipcRenderer.invoke(CHANNELS.setOverlayInteractive, on),
  onOverlayEditing: (fn: (on: boolean) => void) => subscribe(CHANNELS.onOverlayEditing, fn),
  onTaskbarThemeChanged: (fn: (theme: "light" | "dark") => void) =>
    subscribe(CHANNELS.onTaskbarThemeChanged, fn),

  onLibraryChanged: (fn: (games: LocalGame[]) => void) =>
    subscribe(CHANNELS.onLibraryChanged, fn),
  onDownloadsChanged: (fn: (games: LocalGame[]) => void) =>
    subscribe(CHANNELS.onDownloadsChanged, fn),
  onRunningAppChanged: (fn: (appid: string | null) => void) =>
    subscribe(CHANNELS.onRunningAppChanged, fn),
};

contextBridge.exposeInMainWorld("dsync", bridge);

export type { DesktopSettings };
