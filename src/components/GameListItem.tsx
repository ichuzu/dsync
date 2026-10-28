import { Clock, Sparkles, ChevronRight } from "lucide-react";
import { Game, completionPercentage, isPerfectGame } from "@/types/game";
import { LAUNCHERS } from "@/lib/launchers";
import { Logo } from "@/components/Logo";
import { ProgressBar } from "@/components/ProgressBar";
import { getImageCandidates } from "@/lib/steamImage";
import { cn } from "@/lib/utils";
import gamePlaceholder from "@/assets/game-placeholder.jpg";

interface GameListItemProps {
  game: Game;
  onClick: () => void;
  live?: boolean;
}

export const GameListItem = ({ game, onClick, live }: GameListItemProps) => {
  const completion = completionPercentage(game);
  const perfect = isPerfectGame(game);
  const playing = Boolean(live);
  const launcher = LAUNCHERS[game.launcher];

  // Portrait thumbnail with a CDN-variant fallback walk before the placeholder.
  const artCandidates = getImageCandidates(game.id, "portrait");
  const initialSrc = artCandidates[0] || game.coverImage || gamePlaceholder;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-2.5 transition-colors duration-200 hover:border-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img
        src={initialSrc}
        alt={game.title}
        loading="lazy"
        onError={(e) => {
          const img = e.currentTarget;
          const next = Number(img.dataset.fb ?? "0") + 1;
          if (next < artCandidates.length) {
            img.dataset.fb = String(next);
            img.src = artCandidates[next];
          } else if (img.dataset.fb !== "placeholder") {
            img.dataset.fb = "placeholder";
            img.src = gamePlaceholder;
          }
        }}
        className="h-[58px] w-11 shrink-0 rounded-md object-cover"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Logo name={launcher.logoKey} alt={game.nonSteam ? "Non-Steam" : launcher.name} className="h-3.5 w-3.5 rounded-sm" />
          {playing && (
            <span
              title="Currently playing"
              className="h-[7px] w-[7px] shrink-0 rounded-full bg-success shadow-[0_0_6px_hsl(var(--success))]"
            />
          )}
          <p className="truncate font-semibold">{game.title}</p>
          {perfect && <Sparkles size={13} className="shrink-0 text-perfect" />}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <ProgressBar
            value={completion}
            label={`${game.title} achievement completion`}
            className="h-1.5 max-w-[220px] flex-1"
            barClassName={perfect ? "bg-perfect" : undefined}
          />
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {game.earnedAchievements}/{game.totalAchievements}
          </span>
        </div>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className={cn("font-bold", perfect ? "text-perfect" : "text-foreground")}>
          {completion.toFixed(0)}%
        </p>
        <div className="flex items-center justify-end gap-1 text-muted-foreground">
          <Clock size={12} />
          <span className="text-xs">{game.playtimeHours}h</span>
        </div>
      </div>

      <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
    </div>
  );
};
