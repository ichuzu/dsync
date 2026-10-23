import { app } from "electron";
import { autoUpdater } from "electron-updater";

/**
 * Updates from GitHub Releases (the "publish" block in package.json).
 *
 * electron-updater reads latest.yml from the newest release, downloads the
 * new installer in the background, and installs it when the app quits — or
 * straight away if the user clicks "Restart to update". The repo is public,
 * so no token is involved. Only the packaged app checks; a dev run would
 * just find no update metadata.
 */

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

let readyVersion: string | null = null;

export function startAutoUpdates(onReady: (version: string) => void): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", (info) => {
    readyVersion = info.version;
    onReady(info.version);
  });
  // Offline, GitHub down, no release yet: try again at the next check.
  autoUpdater.on("error", () => {});
  const check = () => void autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, CHECK_EVERY_MS);
}

/** The downloaded version waiting to install, if any. */
export const pendingUpdate = () => readyVersion;

/** Quits and runs the downloaded installer silently, then relaunches. */
export function installUpdateNow(): void {
  if (readyVersion) autoUpdater.quitAndInstall(true, true);
}
