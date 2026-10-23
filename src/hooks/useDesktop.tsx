import { useEffect, useState } from "react";
import {
  getLocalLibrary,
  getDesktop,
  getSteamStatus,
  isDesktop,
  onDownloadsChanged,
  onLibraryChanged,
  onRunningAppChanged,
  type LocalGame,
  type SteamStatus,
} from "@/lib/desktop";

interface DesktopState {
  /** False in a browser; everything below is then empty/idle. */
  desktop: boolean;
  /** Whether Steam is installed and running on this machine. */
  steam: SteamStatus | null;
  /** Games installed locally, kept live by the main process. */
  installed: LocalGame[];
  /** Only those currently downloading, keyed for quick lookup. */
  downloads: Map<string, LocalGame>;
  /** appid of the game being played right now, from Steam itself. */
  runningAppId: string | null;
  loading: boolean;
}

/**
 * Live view of this machine's Steam state.
 *
 * In the desktop build the main process pushes changes, so nothing here polls;
 * in a browser it settles immediately into an inert state and the UI keeps
 * working off the Web API library exactly as before.
 */
export function useDesktop(): DesktopState {
  const desktop = isDesktop();
  const [steam, setSteam] = useState<SteamStatus | null>(null);
  const [installed, setInstalled] = useState<LocalGame[]>([]);
  const [downloads, setDownloads] = useState<Map<string, LocalGame>>(new Map());
  const [runningAppId, setRunningAppId] = useState<string | null>(null);
  const [loading, setLoading] = useState(desktop);

  useEffect(() => {
    if (!desktop) return;

    let cancelled = false;
    let receivedRunningEvent = false;
    void getDesktop()?.getRunningApp().then(id => {
      if (!cancelled && !receivedRunningEvent) setRunningAppId(id);
    }).catch(() => {});

    void (async () => {
      try {
        const [status, games] = await Promise.all([getSteamStatus(), getLocalLibrary()]);
        if (cancelled) return;
        setSteam(status);
        setInstalled(games);
        setDownloads(
          new Map(games.filter((g) => g.downloadProgress !== null).map((g) => [g.appid, g])),
        );
      } catch {
        // Leave native actions unavailable when local Steam detection fails.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const offLibrary = onLibraryChanged(setInstalled);
    const offDownloads = onDownloadsChanged((list) =>
      setDownloads(new Map(list.map((g) => [g.appid, g]))),
    );
    const offRunning = onRunningAppChanged(id => { receivedRunningEvent = true; setRunningAppId(id); });

    return () => {
      cancelled = true;
      offLibrary();
      offDownloads();
      offRunning();
    };
  }, [desktop]);

  return { desktop, steam, installed, downloads, runningAppId, loading };
}
