import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import { Clock, Sparkles, ChevronRight } from "lucide-react";
import { Game, completionPercentage, isPerfectGame } from "@/types/game";
import { LAUNCHERS } from "@/lib/launchers";
import { Logo } from "@/components/Logo";
import gamePlaceholder from "@/assets/game-placeholder.jpg";

const GOLD = "hsl(41, 92%, 56%)";

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

  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.25,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        cursor: "pointer",
        transition: "border-color .2s ease, background-color .2s ease",
        "&:hover": { borderColor: "primary.main", bgcolor: "hsl(24 8% 12%)" },
      }}
    >
      <Box
        component="img"
        src={game.coverImage || gamePlaceholder}
        alt={game.title}
        loading="lazy"
        onError={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          if (!img.dataset.fb) {
            img.dataset.fb = "1";
            img.src = gamePlaceholder;
          }
        }}
        sx={{
          width: 44,
          height: 58,
          flexShrink: 0,
          objectFit: "cover",
          borderRadius: 1,
        }}
      />

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Logo name={launcher.logoKey} alt={launcher.name} className="h-3.5 w-3.5 rounded-sm" />
          {playing && (
            <Box
              className="animate-pulse"
              sx={{
                width: 7,
                height: 7,
                flexShrink: 0,
                borderRadius: "50%",
                bgcolor: "hsl(142 66% 45%)",
              }}
              title="Currently playing"
            />
          )}
          <Typography noWrap sx={{ fontWeight: 600 }}>
            {game.title}
          </Typography>
          {perfect && <Sparkles size={13} color={GOLD} />}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
          <LinearProgress
            variant="determinate"
            value={completion}
            sx={{
              flex: 1,
              maxWidth: 220,
              height: 6,
              borderRadius: 3,
              bgcolor: "hsl(24 7% 14%)",
              "& .MuiLinearProgress-bar": {
                borderRadius: 3,
                backgroundColor: perfect ? GOLD : "primary.main",
              },
            }}
          />
          <Typography variant="caption" sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>
            {game.earnedAchievements}/{game.totalAchievements}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ textAlign: "right", flexShrink: 0, display: { xs: "none", sm: "block" } }}>
        <Typography sx={{ fontWeight: 700, color: perfect ? GOLD : "text.primary" }}>
          {completion.toFixed(0)}%
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5, color: "text.secondary" }}>
          <Clock size={12} />
          <Typography variant="caption">{game.playtimeHours}h</Typography>
        </Box>
      </Box>

      <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
    </Box>
  );
};
