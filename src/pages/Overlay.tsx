import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, EyeOff, Move, Pin, PinOff } from "lucide-react";
import type { Achievement } from "@/types/game";
import { fetchSteamAchievements } from "@/lib/steamClient";
import { getDesktop, getLocalLibrary, getNonSteamGames, onRunningAppChanged } from "@/lib/desktop";
import { asAchievements, onCustomAchievementsChanged, readCustomAchievements } from "@/lib/customAchievements";

/** Non-Steam shortcut appids have the high bit set. */
const isShortcut = (appid: string) => Number(appid) > 0x7fffffff;
import { usePins } from "@/lib/overlayPins";
import { GameNotes } from "@/components/GameNotes";
import { AchievementTips } from "@/components/AchievementTips";
import { cn } from "@/lib/utils";

/**
 * The in-game overlay (see the overlay section of electron/main.ts).
 *
 * Normally it is a quiet, click-through card: the game, the next
 * achievement to go for, any pinned ones, and the game's notes, which can be
 * clicked and typed into any time. It sizes itself to that content.
 * OVERLAY_HOTKEY switches it into edit mode, where it can be dragged and
 * resized and achievements pinned; the same keys lock it again. Everything else (on/off, corner,
 * opacity) lives in Dsync's settings, so the overlay itself has no buttons.
 *
 * Rendered outside the app's providers: the overlay must not kick off the
 * library, stats and news syncs the main window already runs. It reads the
 * Steam session the main window saved instead.
 */

export const OVERLAY_HOTKEY_LABEL = "Ctrl+Shift+D";

const POLL_MS = 60_000;
const SESSION_KEY = "dsync.steam.session";

const readSteamId = (): string | null => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null")?.steamId ?? null;
  } catch {
    return null;
  }
};

const drag = { WebkitAppRegion: "drag" } as React.CSSProperties;
const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

export default function Overlay() {
  const steamId = useMemo(readSteamId, []);
  const [appid, setAppid] = useState<string | null>(() => new URLSearchParams(window.location.search).get("appid"));
  const [name, setName] = useState("");
  const [achievements, setAchievements] = useState<Achievement[] | null>(null);
  const [editing, setEditing] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const { pins, toggle: togglePin, save: savePins } = usePins(appid);

  useEffect(() => {
    const desktop = getDesktop();
    const offRunning = onRunningAppChanged((id) => id && setAppid(id));
    const offEditing = desktop?.onOverlayEditing(setEditing) ?? (() => {});
    return () => {
      offRunning();
      offEditing();
    };
  }, []);

  useEffect(() => {
    if (!appid) return;
    setName("");
    if (isShortcut(appid)) {
      void getNonSteamGames().then((games) => setName(games.find((g) => g.appid === appid)?.name ?? ""));
    } else {
      void getLocalLibrary().then((games) => setName(games.find((g) => g.appid === appid)?.name ?? ""));
    }
  }, [appid]);


  // Non-Steam games: the player's own achievement list, live.
  useEffect(() => {
    if (!appid || !isShortcut(appid)) return;
    const load = () => setAchievements(asAchievements(readCustomAchievements(appid)));
    load();
    return onCustomAchievementsChanged(load);
  }, [appid]);

  useEffect(() => {
    if (!appid || !steamId || isShortcut(appid)) return;
    let cancelled = false;
    setAchievements(null);

    const load = async () => {
      try {
        const list = await fetchSteamAchievements(steamId, appid, { fresh: true });
        if (cancelled) return;
        setAchievements(list);
      } catch {
        /* keep showing what we had; the next poll retries */
      }
    };
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [appid, steamId]);

  // Unlocked achievements leave the overlay straight away, pins included.
  useEffect(() => {
    if (!achievements) return;
    const done = new Set(achievements.filter((a) => a.unlocked).map((a) => a.id));
    if (pins.some((p) => done.has(p))) savePins(pins.filter((p) => !done.has(p)));
  }, [achievements]); // eslint-disable-line react-hooks/exhaustive-deps

  // Locked first, easiest (most players have it) first.
  const sorted = useMemo(
    () =>
      [...(achievements ?? [])].sort(
        (a, b) => Number(a.unlocked) - Number(b.unlocked) || b.globalUnlockPct - a.globalUnlockPct,
      ),
    [achievements],
  );
  const upNext = sorted.find((a) => !a.unlocked && !pins.includes(a.id));
  const focus = useMemo(() => {
    const byId = new Map(sorted.map((a) => [a.id, a]));
    const pinned = pins.map((id) => byId.get(id)).filter((a): a is Achievement => Boolean(a) && !a.unlocked);
    return [...pinned, ...(upNext ? [upNext] : [])];
  }, [sorted, pins, upNext]);

  const earned = achievements?.filter((a) => a.unlocked).length ?? 0;
  const total = achievements?.length ?? 0;

  // Size the window to the card, except in edit mode where the user sizes it.
  useLayoutEffect(() => {
    const el = card.current;
    if (!el || editing) return;
    const fit = () => void getDesktop()?.fitOverlay(el.getBoundingClientRect().height);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [editing]);

  return (
    <div
      className={cn(
        "h-screen overflow-hidden bg-background text-foreground",
        editing && "ring-2 ring-inset ring-primary",
      )}
      style={editing ? drag : undefined}
    >
      <div ref={card} className={cn("flex flex-col", editing && "h-full")}>
        {editing && (
          <div className="flex items-center gap-1.5 bg-primary/15 px-2.5 py-1 text-[10.5px] text-primary">
            <Move className="h-3 w-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Drag to move · resize from the edges</span>
            <button
              type="button"
              onClick={() => void getDesktop()?.setOverlayEditing(false)}
              className="rounded bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground"
              style={noDrag}
            >
              Done ({OVERLAY_HOTKEY_LABEL})
            </button>
          </div>
        )}

        <div className="flex items-baseline gap-2 px-2.5 pt-2">
          <p className="min-w-0 flex-1 truncate text-[12px] font-semibold">{name || "Current game"}</p>
          {total > 0 && (
            <p className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
              {earned}/{total} · {Math.round((earned / total) * 100)}%
            </p>
          )}
        </div>

        <div className={cn("min-h-0 px-1.5 py-1", editing && "flex-1 overflow-y-auto")} style={editing ? noDrag : undefined}>
          {!steamId && !(appid && isShortcut(appid)) ? (
            <Hint>Sign in with Steam in Dsync to see achievements.</Hint>
          ) : !achievements ? (
            <Hint>Loading achievements…</Hint>
          ) : total === 0 ? (
            <Hint>
              {appid && isShortcut(appid)
                ? "Add your own achievements for this game in Dsync (open it in your library)."
                : "No Steam achievements for this game."}
            </Hint>
          ) : focus.length === 0 ? (
            <Hint>Every achievement unlocked. Nice.</Hint>
          ) : (
            <ul className="space-y-0.5">
              {focus.map((a) => (
                <Row
                  key={a.id}
                  a={a}
                  label={a.id === upNext?.id ? "Up next" : "Pinned"}
                  tipsFor={appid && !isShortcut(appid) ? appid : undefined}
                  pinned={pins.includes(a.id)}
                  onPin={editing ? () => togglePin(a.id) : undefined}
                />
              ))}
            </ul>
          )}

          {/* Notes: always typeable. The overlay is click-through, so it claims
              the mouse only while the pointer is over this box. */}
          {appid && (
            <div
              className="mx-0.5 mt-1 border-t border-border/60 pt-1"
              onMouseEnter={() => void getDesktop()?.setOverlayInteractive(true)}
              onMouseLeave={() => void getDesktop()?.setOverlayInteractive(false)}
            >
              <GameNotes appid={appid} compact placeholder="Add a note… (type / for to-dos and more)" />
            </div>
          )}

          {/* Edit mode: pin any other locked achievement. */}
          {editing && sorted.some((a) => !a.unlocked) && (
            <div className="mt-2 px-1 pb-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pin achievements to keep in view
              </p>
              <ul className="space-y-0.5">
                {sorted
                  .filter((a) => !a.unlocked && !pins.includes(a.id) && a.id !== upNext?.id)
                  .map((a) => (
                    <Row key={a.id} a={a} pinned={false} onPin={() => togglePin(a.id)} />
                  ))}
              </ul>
            </div>
          )}
        </div>

        {!editing && pins.length === 0 && (
          <p className="px-2.5 pb-1.5 text-[9.5px] text-muted-foreground/70">
            {OVERLAY_HOTKEY_LABEL} to move this or pin achievements
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  a,
  label,
  pinned,
  onPin,
  tipsFor,
}: {
  a: Achievement;
  label?: string;
  pinned: boolean;
  onPin?: () => void;
  /** The game's appid, to show written guide help under the description. */
  tipsFor?: string;
}) {
  return (
    <li className="flex gap-2 rounded-md px-1 py-1">
      <img src={a.icon} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        {label && (
          <p className="text-[9px] font-semibold uppercase tracking-wide text-primary">
            {label}
          </p>
        )}
        <p className="text-[12.5px] font-semibold leading-tight">
          {a.name}
          {a.hidden && <EyeOff className="ml-1 inline h-3 w-3 align-[-1px] text-muted-foreground" aria-label="Hidden achievement" />}
          {a.unlocked && <Check className="ml-1 inline h-3 w-3 align-[-1px] text-success" />}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">{a.description || "No description"}</p>
        {tipsFor && !a.unlocked && <AchievementTips appid={tipsFor} name={a.name} compact className="mt-0.5" />}
        <p className="text-[9.5px] tabular-nums text-muted-foreground/80">{a.globalUnlockPct.toFixed(1)}% of players</p>
      </div>
      {onPin && !a.unlocked && (
        <button
          type="button"
          onClick={onPin}
          aria-label={pinned ? `Unpin ${a.name}` : `Pin ${a.name}`}
          className={cn("self-start rounded p-1 hover:bg-muted", pinned ? "text-primary" : "text-muted-foreground")}
        >
          {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
      )}
    </li>
  );
}

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className="px-1 py-2 text-[11.5px] text-muted-foreground">{children}</p>
);
