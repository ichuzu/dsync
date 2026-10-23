import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Clock,
  CalendarDays,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  RefreshCcw,
  Lock,
  Trophy,
  Target,
  Timer,
  Hourglass,
  CalendarClock,
  Plus,
  Check,
  Youtube,
  Play,
  Loader2,
} from "lucide-react";
import {
  Achievement,
  Game,
  Rarity,
  completionPercentage,
  isPerfectGame,
} from "@/types/game";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressBar } from "@/components/ProgressBar";
import { DownloadGlyph, DownloadProgressArt } from "@/components/GameFrame";
import { CompletionTimes } from "@/components/CompletionTimes";
import { LAUNCHERS } from "@/lib/launchers";
import { Logo } from "@/components/Logo";
import { useSteam } from "@/hooks/useSteam";
import { useCollections } from "@/hooks/useCollections";
import { GameNotes } from "@/components/GameNotes";
import { OVERLAY_HOTKEY_LABEL } from "@/pages/Overlay";
import { fetchSteamAchievements } from "@/lib/steamClient";
import { getImageCandidates } from "@/lib/steamImage";
import { cn } from "@/lib/utils";
import { getDesktop, isDesktop, installGame, launchGame, openInSteam } from "@/lib/desktop";
import { useDesktop } from "@/hooks/useDesktop";
import gamePlaceholder from "@/assets/game-placeholder.jpg";

interface GameDetailDrawerProps {
  game: Game | null;
  open: boolean;
  onClose: () => void;
}

const RARITY_DOT: Record<Rarity, string> = {
  legendary: "bg-rarity-legendary",
  epic: "bg-rarity-epic",
  rare: "bg-rarity-rare",
  uncommon: "bg-rarity-uncommon",
  common: "bg-rarity-common",
};

const isSteamApp = (game: Game) => game.launcher === "steam" && Number(game.id) > 1000;

const youtubeGuideUrl = (gameTitle: string, achievementName: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${gameTitle} ${achievementName} achievement guide`,
  )}`;

export const GameDetailDrawer = ({ game, open, onClose }: GameDetailDrawerProps) => (
  <Sheet open={open && Boolean(game)} onOpenChange={(next) => !next && onClose()}>
    {/* SheetContent ships its own close button as its last child; the arbitrary
        variants below move it onto the banner and give it a scrim so it stays
        legible over cover art. */}
    <SheetContent
      side="right"
      className={cn(
        "flex w-full flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-[460px]",
        "[&>button]:right-2 [&>button]:top-2 [&>button]:z-10 [&>button]:rounded-full",
        "[&>button]:bg-[hsl(var(--scrim)/0.6)] [&>button]:p-1.5 [&>button]:opacity-100",
        "[&>button]:backdrop-blur-[6px] [&>button:hover]:bg-[hsl(var(--scrim)/0.85)]",
      )}
    >
      {game && <GameDetailContent key={game.id} game={game} />}
    </SheetContent>
  </Sheet>
);

type AchFilter = "all" | "unlocked" | "locked";

const GameDetailContent = ({ game }: { game: Game }) => {
  const steam = useSteam();
  const { installed, downloads, steam: localSteam, loading: localLoading, runningAppId } = useDesktop();
  const { collections, toggleGame, create } = useCollections();
  const launcher = LAUNCHERS[game.launcher];
  const canFetch = steam.connected && isSteamApp(game) && Boolean(steam.profile?.steamId);

  const [achievements, setAchievements] = useState<Achievement[] | null>(null);
  const [loading, setLoading] = useState(canFetch);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AchFilter>("all");
  const [addingCol, setAddingCol] = useState(false);
  const [colName, setColName] = useState("");
  const [installPending, setInstallPending] = useState(false);
  const [installNotice, setInstallNotice] = useState("");
  const [installError, setInstallError] = useState(false);

  useEffect(() => {
    if (!canFetch) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSteamAchievements(steam.profile!.steamId, game.id)
      .then((list) => !cancelled && setAchievements(list))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefer counts derived from the fetched list (accurate even for games that
  // weren't enriched during the initial library sync).
  const total = achievements ? achievements.length : game.totalAchievements;
  const earned = achievements ? achievements.filter((a) => a.unlocked).length : game.earnedAchievements;
  const completion = achievements
    ? total === 0
      ? 0
      : (earned / total) * 100
    : completionPercentage(game);
  const perfect = total > 0 ? earned === total : isPerfectGame(game);
  // Whether the in-game overlay setting is on (desktop only).
  const [overlayOn, setOverlayOn] = useState(true);
  useEffect(() => {
    void getDesktop()?.getSettings().then((s) => setOverlayOn(s.achievementOverlay));
  }, []);

  // The desktop build sees a launch within seconds; Steam presence lags ~1 min.
  const playing =
    runningAppId === game.id ||
    Boolean(steam.presence?.inGame && steam.presence.gameId === game.id);

  // "What's next" — the easiest achievement still locked (highest global unlock
  // %, i.e. the one the most players already have). The app's headline feature.
  const recommendedNext =
    achievements && achievements.some((a) => !a.unlocked)
      ? [...achievements]
          .filter((a) => !a.unlocked)
          .sort((a, b) => b.globalUnlockPct - a.globalUnlockPct)[0]
      : null;

  // Derived per-game statistics.
  const left = Math.max(total - earned, 0);
  const hoursPerAch = earned > 0 ? game.playtimeHours / earned : null;
  const estToComplete =
    hoursPerAch != null && left > 0 ? Math.round(hoursPerAch * left) : null;
  const unlockedDates = (achievements ?? [])
    .filter((a) => a.unlocked && a.unlockedDate)
    .map((a) => a.unlockedDate as string);
  const startedDate = unlockedDates.length ? [...unlockedDates].sort()[0] : undefined;

  const addNewCollection = () => {
    const made = create(colName);
    if (made) toggleGame(made.id, game.id);
    setColName("");
    setAddingCol(false);
  };

  const bannerCandidates = isSteamApp(game) ? getImageCandidates(game.id, "landscape") : [];
  const bannerSrc = bannerCandidates[0] || game.coverImage || gamePlaceholder;

  /** Present in the local Steam install, so it can actually be launched. */
  const localGame = downloads.get(game.id) ?? installed.find((g) => g.appid === game.id);
  const isInstalled = localGame?.state === "installed";
  const downloadProgress = localGame?.downloadProgress;
  const hasDownload = typeof downloadProgress === "number";

  const requestInstall = async () => {
    setInstallPending(true);
    setInstallNotice("");
    setInstallError(false);
    try {
      if (!await installGame(game.id)) throw new Error("Open the Dsync desktop app to install games.");
      setInstallNotice("Installation requested. Choose a drive and confirm in Steam to begin.");
    } catch (error) {
      setInstallError(true);
      setInstallNotice(error instanceof Error ? error.message : "Couldn't open Steam. Please try again.");
    } finally {
      setInstallPending(false);
    }
  };

  const filtered = (achievements ?? []).filter((a) =>
    filter === "all" ? true : filter === "unlocked" ? a.unlocked : !a.unlocked,
  );

  return (
    <div className="flex h-full flex-col">
      {/* Banner */}
      <div className="relative h-[170px] shrink-0">
        <img
          src={bannerSrc}
          alt={game.title}
          onError={(e) => {
            const img = e.currentTarget;
            const next = Number(img.dataset.fb ?? "0") + 1;
            if (next < bannerCandidates.length) {
              img.dataset.fb = String(next);
              img.src = bannerCandidates[next];
            } else if (img.dataset.fb !== "placeholder") {
              img.dataset.fb = "placeholder";
              img.src = gamePlaceholder;
            }
          }}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--background))_0%,hsl(var(--background)/0.2)_60%,hsl(var(--background)/0.4)_100%)]" />

        <div className="absolute bottom-3 left-4 right-4">
          <div className="mb-1 flex items-center gap-2">
            <Logo name={launcher.logoKey} alt={launcher.name} className="h-4 w-4 rounded-sm" />
            <span className="text-xs text-muted-foreground">
              {launcher.name}
              {game.genre ? ` · ${game.genre}` : ""}
            </span>
            {playing && (
              <span className="flex items-center gap-1 rounded-md bg-success/20 px-1.5 py-0.5 text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                <span className="text-[10px] font-bold">Playing</span>
              </span>
            )}
          </div>
          <SheetTitle className="text-lg font-bold leading-tight">{game.title}</SheetTitle>
          <SheetDescription className="sr-only">
            Achievement progress and details for {game.title}.
          </SheetDescription>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        <Button asChild variant="outline" className="mb-5 w-full">
          <Link to={`/wiki?game=${encodeURIComponent(game.id)}&title=${encodeURIComponent(game.title)}`}>Game wiki & guides</Link>
        </Button>
        <div className="mb-5"><CompletionTimes key={game.id} game={game} /></div>
        {/* Quick facts */}
        <div className="mb-5 flex gap-3">
          <Fact icon={<Clock size={15} />} label="Playtime" value={`${game.playtimeHours}h`} />
          <Fact icon={<CalendarDays size={15} />} label="Last played" value={game.lastPlayed ?? "—"} />
          <Fact
            icon={game.synced ? <CheckCircle2 size={15} /> : <RefreshCcw size={15} />}
            label="Sync"
            value={game.synced ? "Synced" : "Pending"}
          />
        </div>

        {/* Completion */}
        <div className="mb-5">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Achievements</h3>
            <div className="flex items-center gap-2">
              {perfect && (
                <span className="flex items-center gap-1 text-perfect">
                  <Sparkles size={14} />
                  <span className="text-xs font-bold">Perfect</span>
                </span>
              )}
              <span className="font-bold">
                {earned}/{total}
              </span>
            </div>
          </div>
          <ProgressBar
            value={completion}
            label={`${game.title} achievement completion`}
            className="h-2.5"
            barClassName={perfect ? "bg-perfect" : undefined}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            {completion.toFixed(0)}% complete
          </span>
        </div>

        {/* Per-game stats */}
        {total > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Stats</h3>
            <div className="grid grid-cols-2 gap-3">
              <Fact icon={<Target size={15} />} label="Achievements left" value={String(left)} />
              <Fact
                icon={<Timer size={15} />}
                label="Per achievement"
                value={hoursPerAch != null ? `${hoursPerAch.toFixed(1)}h` : "—"}
              />
              <Fact
                icon={<Hourglass size={15} />}
                label="Est. to 100%"
                value={perfect ? "Complete" : estToComplete != null ? `~${estToComplete}h` : "—"}
              />
              <Fact icon={<CalendarClock size={15} />} label="Started" value={startedDate ?? "—"} />
            </div>
            {estToComplete != null && !perfect && (
              <p className="mt-2 text-xs text-muted-foreground">
                ~{estToComplete}h more at your current pace ({hoursPerAch?.toFixed(1)}h per
                achievement) to unlock the remaining {left}.
              </p>
            )}
          </div>
        )}

        {/* Notes, shared with the in-game overlay */}
        <div className="mb-5">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Your notes</h3>
          <GameNotes appid={game.id} />
        </div>

        {/* Collections */}
        <div className="mb-5">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Collections</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {collections.map((c) => {
              const inIt = c.gameIds.includes(game.id);
              return (
                <AchChip key={c.id} active={inIt} onClick={() => toggleGame(c.id, game.id)}>
                  {inIt && <Check size={11} className="mr-1 inline" />}
                  {c.name}
                </AchChip>
              );
            })}
            {addingCol ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addNewCollection();
                    if (e.key === "Escape") setAddingCol(false);
                  }}
                  placeholder="Name…"
                  className="h-7 w-28 rounded-md border border-border bg-input px-2 text-xs text-foreground outline-none"
                />
                <button type="button" onClick={addNewCollection} className="text-primary">
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCol(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus size={12} /> New
              </button>
            )}
          </div>
        </div>

        {/* Individual achievements */}
        {canFetch ? (
          <div>
            {recommendedNext && (
              <div className="mb-4 rounded-lg border border-primary bg-primary/[0.08] p-3">
                <span className="text-xs font-extrabold tracking-wide text-primary">
                  ★ GO FOR THIS NEXT
                </span>
                <div className="mt-2 flex items-center gap-3">
                  {recommendedNext.icon ? (
                    <img
                      src={recommendedNext.icon}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-md"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Trophy size={20} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{recommendedNext.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {recommendedNext.globalUnlockPct
                        ? `${recommendedNext.globalUnlockPct.toFixed(1)}% of players have this — your easiest win`
                        : "Your easiest remaining achievement"}
                    </p>
                  </div>
                </div>
                <Button asChild size="sm" className="mt-3 w-full">
                  <a
                    href={youtubeGuideUrl(game.title, recommendedNext.name)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Youtube size={16} className="mr-2" /> Watch a guide
                  </a>
                </Button>
              </div>
            )}

            <div className="mb-3 flex gap-1.5">
              <AchChip active={filter === "all"} onClick={() => setFilter("all")}>
                All {total > 0 ? total : ""}
              </AchChip>
              <AchChip active={filter === "unlocked"} onClick={() => setFilter("unlocked")}>
                Unlocked {earned}
              </AchChip>
              <AchChip active={filter === "locked"} onClick={() => setFilter("locked")}>
                Locked {Math.max(total - earned, 0)}
              </AchChip>
            </div>

            {loading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
                    <div className="flex-1 space-y-2 py-1">
                      <Skeleton className="h-3 w-3/5" />
                      <Skeleton className="h-3 w-[90%]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">Couldn't load achievements: {error}</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {total === 0 ? "This game has no achievements." : `No ${filter} achievements.`}
              </p>
            ) : (
              <div className="flex flex-col">
                {filtered.map((a) => (
                  <AchievementRow key={a.id} a={a} gameTitle={game.title} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isSteamApp(game)
              ? "Sign in with Steam to see individual achievements."
              : "Individual achievements are available for Steam games."}
          </p>
        )}
      </div>

      {/* Footer */}
      {isSteamApp(game) && (
        <div className="shrink-0 space-y-3 border-t border-border p-4">
          {isDesktop() && hasDownload && (
            <div className="space-y-2" role="status">
              <p className="text-xs text-muted-foreground">
                {localGame?.state === "paused" ? "Paused in Steam" : "Downloading / updating in Steam"} · {downloadProgress.toFixed(0)}%
              </p>
              <DownloadProgressArt value={downloadProgress} label={`${game.title} download progress`} />
            </div>
          )}
          {installNotice && <p role={installError ? "alert" : "status"} className={cn("text-xs", installError ? "text-destructive" : "text-muted-foreground")}>{installNotice}</p>}
          <div className="flex gap-2">
          {playing ? (
            isDesktop() ? (
              overlayOn ? (
                <p className="flex flex-1 items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 text-xs text-muted-foreground">
                  <Trophy size={14} className="shrink-0 text-success" />
                  <span>In-game overlay is on · <kbd className="font-semibold text-foreground">{OVERLAY_HOTKEY_LABEL}</kbd> to edit it</span>
                </p>
              ) : (
                <Button
                  className="flex-1"
                  onClick={() => void getDesktop()?.setSettings({ achievementOverlay: true }).then(() => setOverlayOn(true))}
                >
                  <Trophy size={16} className="mr-2" /> Turn on in-game overlay
                </Button>
              )
            ) : (
              <Button className="flex-1" disabled>
                <Play size={16} className="mr-2" /> Playing now
              </Button>
            )
          ) : (
            isInstalled && (
              <Button className="flex-1" onClick={() => void launchGame(game.id)}>
                <Play size={16} className="mr-2" /> Play
              </Button>
            )
          )}
          {isDesktop() && !isInstalled && !hasDownload && (
            <Button className="flex-1" disabled={localLoading || installPending || !localSteam?.installed} onClick={requestInstall}>
              {localLoading || installPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <DownloadGlyph />}
              {localLoading ? "Checking Steam…" : installPending ? "Opening Steam…" : localGame ? "Install / update" : "Install via Steam"}
            </Button>
          )}
          {/* On the desktop build this opens Steam itself; in a browser it
              falls through to the store website. */}
          <Button
            asChild={!isDesktop()}
            variant={isDesktop() || isInstalled ? "outline" : "default"}
            className="flex-1"
            onClick={isDesktop() ? () => void openInSteam(game.id) : undefined}
          >
            {isDesktop() ? (
              <span>
                View on Steam <ExternalLink size={16} className="ml-2" />
              </span>
            ) : (
              <a
                href={`https://store.steampowered.com/app/${game.id}`}
                target="_blank"
                rel="noreferrer"
              >
                View on Steam <ExternalLink size={16} className="ml-2" />
              </a>
            )}
          </Button>
          </div>
          {isDesktop() && !localLoading && !localSteam?.installed && <p className="text-xs text-muted-foreground">Steam must be installed on this PC to install games.</p>}
        </div>
      )}
    </div>
  );
};

const AchievementRow = ({ a, gameTitle }: { a: Achievement; gameTitle: string }) => (
  <div
    className={cn(
      "group flex items-start gap-3 border-t border-border py-2.5",
      a.unlocked ? "opacity-100" : "opacity-70",
    )}
  >
    {a.icon ? (
      <img
        src={a.icon}
        alt=""
        loading="lazy"
        className={cn("h-10 w-10 shrink-0 rounded-md", !a.unlocked && "grayscale")}
      />
    ) : (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Trophy size={18} />
      </div>
    )}

    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold">{a.name}</p>
      {a.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
      )}
      <div className="mt-1 flex items-center gap-1.5">
        <span className={cn("h-[7px] w-[7px] rounded-full", RARITY_DOT[a.rarity])} />
        <span className="text-xs text-muted-foreground">
          {a.globalUnlockPct ? `${a.globalUnlockPct.toFixed(1)}% of players` : "Rarity n/a"}
        </span>
        {a.unlocked && a.unlockedDate && (
          <span className="text-xs text-muted-foreground">· {a.unlockedDate}</span>
        )}
      </div>
    </div>

    <div className="mt-1 flex shrink-0 items-center gap-2">
      <a
        href={youtubeGuideUrl(gameTitle, a.name)}
        target="_blank"
        rel="noreferrer"
        title="Find a guide on YouTube"
        aria-label={`Find a YouTube guide for ${a.name}`}
        className="text-muted-foreground opacity-60 transition-colors hover:text-[#ff0033] hover:opacity-100 group-hover:opacity-100"
      >
        <Youtube size={16} />
      </a>
      <span className={a.unlocked ? "text-success" : "text-muted-foreground/50"}>
        {a.unlocked ? <CheckCircle2 size={16} /> : <Lock size={14} />}
      </span>
    </div>
  </div>
);

const AchChip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-full border px-2.5 py-1 text-xs transition-colors",
      active
        ? "border-primary bg-primary/15 text-primary"
        : "border-border text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

const Fact = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <div className="flex-1 rounded-lg border border-border bg-card p-2.5">
    <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
      {icon}
      <span className="text-xs">{label}</span>
    </div>
    <p className="truncate text-sm font-semibold">{value}</p>
  </div>
);
