import { Clock, Sparkles, RefreshCcw } from "lucide-react";
import { Game, RarityBreakdown, completionPercentage, isPerfectGame } from "@/types/game";
import { LAUNCHERS } from "@/lib/launchers";
import { Logo } from "@/components/Logo";
import { GameFrame, type FrameState } from "@/components/GameFrame";
import { ProgressBar } from "@/components/ProgressBar";
import { fetchSteamCover } from "@/lib/steamClient";
import { getImageCandidates } from "@/lib/steamImage";
import { cn } from "@/lib/utils";
import gamePlaceholder from "@/assets/game-placeholder.jpg";

interface GameCardProps {
  game: Game;
  onClick: () => void;
  /** True only for the game the user is in right now (live presence). */
  live?: boolean;
  /**
   * Live download percentage (0-100). The orange download bar on the frame
   * renders only while this is a number and scales to it; leave it undefined
   * and the bar stays hidden.
   */
  downloadProgress?: number | null;
  frameState?: FrameState;
}

/** Translucent backing for the pills overlaid on cover art (see --scrim). */
const SCRIM = "bg-[hsl(var(--scrim)/0.6)] backdrop-blur-[6px]";

export const GameCard = ({ game, onClick, live, downloadProgress, frameState = "idle" }: GameCardProps) => {
  const completion = completionPercentage(game);
  const perfect = isPerfectGame(game);
  const playing = Boolean(live);
  const launcher = LAUNCHERS[game.launcher];

  // Portrait art (library_600x900.jpg first) with a resilient fallback chain:
  // walk the CDN variants, then the server store lookup, then the placeholder.
  const artCandidates = getImageCandidates(game.id, "portrait");
  const initialSrc = artCandidates[0] || game.coverImage || gamePlaceholder;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-full w-full flex-col items-stretch bg-transparent text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        // Keep the artist's angular frame prominent without a second box or glow.
        perfect
          ? "[&:hover_.frame-piece]:bg-perfect"
          : "[&:hover_.frame-piece]:bg-primary",
      )}
    >
      {/* Cover */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-card">
        <img
          src={initialSrc}
          alt={game.title}
          loading="lazy"
          onError={(e) => {
            // Walk the CDN art variants, then the server store lookup (hashed
            // assets for unreleased games), then the local placeholder.
            const img = e.currentTarget;
            const next = Number(img.dataset.fb ?? "0") + 1;
            if (next < artCandidates.length) {
              img.dataset.fb = String(next);
              img.src = artCandidates[next];
            } else if (img.dataset.fb !== "store" && img.dataset.fb !== "placeholder") {
              img.dataset.fb = "store";
              fetchSteamCover(game.id)
                .then((url) => {
                  img.src = url || gamePlaceholder;
                })
                .catch(() => {
                  img.src = gamePlaceholder;
                });
            } else if (img.dataset.fb !== "placeholder") {
              img.dataset.fb = "placeholder";
              img.src = gamePlaceholder;
            }
          }}
          className="block h-full w-full object-cover p-[6px]"
        />

        {/* Hover reveal — label only, no tint over the art */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="rounded-md bg-[hsl(var(--scrim)/0.72)] px-2.5 py-1 text-xs font-bold text-primary backdrop-blur-[6px]">
            View details →
          </span>
        </div>

        {/* Launcher pill */}
        <div className={cn("absolute left-3 top-3 flex items-center gap-1.5 rounded-md px-2 py-1", SCRIM)}>
          <Logo name={launcher.logoKey} alt={game.nonSteam ? "Non-Steam" : launcher.name} className="h-4 w-4 rounded-sm" />
          <span className="text-xs font-semibold text-white">{game.nonSteam ? "Non-Steam" : launcher.name}</span>
        </div>

        {/* Perfect + sync */}
        <div className="absolute right-5 top-5 flex items-center gap-1.5">
          {playing && (
            <div className="flex items-center gap-1 rounded-md bg-success/20 px-2 py-1 text-success backdrop-blur-[6px]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              <span className="text-[11px] font-bold">Playing</span>
            </div>
          )}
          {perfect && (
            <div className="flex items-center gap-1 rounded-md bg-perfect/20 px-2 py-1 text-perfect backdrop-blur-[6px]">
              <Sparkles size={12} />
              <span className="text-[11px] font-bold">Perfect</span>
            </div>
          )}
          {/* Only flag games that still need syncing — synced is the norm. */}
          {!game.synced && (
            <div
              title="Sync pending"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-warning/20 text-warning backdrop-blur-[6px]"
            >
              <RefreshCcw size={14} />
            </div>
          )}
        </div>

        {/* HUD frame */}
        <GameFrame
          state={playing ? "play" : frameState}
          downloadProgress={downloadProgress}
          color={perfect ? "hsl(var(--perfect) / 0.85)" : "hsl(var(--foreground) / 0.8)"}
          gap={7}
        />
      </div>

      {/* Stats */}
      <div className="w-full px-1 py-4">
        <p className="truncate font-semibold text-foreground">{game.title}</p>
        <div className="mb-3 flex items-center gap-2 text-muted-foreground">
          {game.genre && (
            <>
              <span className="truncate text-xs">{game.genre}</span>
              <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-current" />
            </>
          )}
          <span className="flex shrink-0 items-center gap-1">
            <Clock size={12} />
            <span className="text-xs">{game.playtimeHours}h</span>
          </span>
        </div>

        <div className="mb-2 flex justify-between text-sm">
          <span className="text-muted-foreground">Achievements</span>
          <span className="font-semibold">
            {game.earnedAchievements}/{game.totalAchievements}
          </span>
        </div>

        <ProgressBar
          value={completion}
          label={`${game.title} achievement completion`}
          barClassName={perfect ? "bg-perfect" : undefined}
        />

        <div className="mt-2.5 flex items-center justify-between">
          <RarityDots breakdown={game.rarityBreakdown} />
          <span className={cn("text-sm font-bold", perfect ? "text-perfect" : "text-foreground")}>
            {completion.toFixed(0)}%
          </span>
        </div>
      </div>
    </button>
  );
};

const TIERS: Array<{ key: keyof RarityBreakdown; dot: string; label: string }> = [
  { key: "legendary", dot: "bg-rarity-legendary", label: "Legendary" },
  { key: "epic", dot: "bg-rarity-epic", label: "Epic" },
  { key: "rare", dot: "bg-rarity-rare", label: "Rare" },
];

const RarityDots = ({ breakdown }: { breakdown: RarityBreakdown }) => (
  <div className="flex gap-2">
    {TIERS.map((t) => (
      <span key={t.key} title={`${breakdown[t.key]} ${t.label}`} className="flex items-center gap-1">
        <span className={cn("h-2 w-2 rounded-full", t.dot)} />
        <span className="text-xs text-muted-foreground">{breakdown[t.key]}</span>
      </span>
    ))}
  </div>
);
