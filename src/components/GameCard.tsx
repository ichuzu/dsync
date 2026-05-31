import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import { Clock, Sparkles, CheckCircle2, RefreshCcw } from "lucide-react";
import { Game, RarityBreakdown, completionPercentage, isPerfectGame } from "@/types/game";
import { LAUNCHERS } from "@/lib/launchers";
import { Logo } from "@/components/Logo";
import { fetchSteamCover } from "@/lib/steamClient";
import gamePlaceholder from "@/assets/game-placeholder.jpg";

interface GameCardProps {
  game: Game;
  onClick: () => void;
  /** True only for the game the user is in right now (live presence). */
  live?: boolean;
}

const GOLD = "hsl(41, 92%, 56%)";

export const GameCard = ({ game, onClick, live }: GameCardProps) => {
  const completion = completionPercentage(game);
  const perfect = isPerfectGame(game);
  const playing = Boolean(live);
  const launcher = LAUNCHERS[game.launcher];

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        position: "relative",
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        overflow: "hidden",
        transition: "transform .3s ease, box-shadow .3s ease, border-color .3s ease",
        "&:hover": {
          transform: "translateY(-6px)",
          borderColor: "primary.main",
          boxShadow: "0 0 32px hsl(24 95% 53% / 0.35)",
        },
        "&:hover .cover-img": { transform: "scale(1.06)" },
        "&:hover .hover-reveal": { opacity: 1 },
      }}
    >
      <CardActionArea
        onClick={onClick}
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          height: "100%",
        }}
      >
        {/* Cover */}
        <Box sx={{ position: "relative", width: "100%", aspectRatio: "3 / 4", overflow: "hidden" }}>
          <Box
            component="img"
            src={game.coverImage || gamePlaceholder}
            alt={game.title}
            className="cover-img"
            loading="lazy"
            onError={(e) => {
              // Portrait cover → landscape header → store API (hashed asset,
              // for unreleased games) → local placeholder.
              const img = e.currentTarget as HTMLImageElement;
              const stage = img.dataset.fb;
              const numeric = /^\d+$/.test(game.id);
              if (!stage && numeric) {
                img.dataset.fb = "header";
                img.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/header.jpg`;
              } else if (stage === "header" && numeric) {
                img.dataset.fb = "store";
                fetchSteamCover(game.id)
                  .then((url) => {
                    img.src = url || gamePlaceholder;
                  })
                  .catch(() => {
                    img.src = gamePlaceholder;
                  });
              } else if (stage !== "placeholder") {
                img.dataset.fb = "placeholder";
                img.src = gamePlaceholder;
              }
            }}
            sx={{
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transition: "transform .5s ease",
            }}
          />

          {/* Base gradient so the title is always legible */}
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to top, hsl(24 8% 10%) 0%, hsl(24 8% 10% / 0.15) 45%, transparent 70%)",
            }}
          />

          {/* Hover reveal */}
          <Box
            className="hover-reveal"
            sx={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              transition: "opacity .3s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "hsl(20 12% 4% / 0.45)",
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: "primary.main" }}>
              View details →
            </Typography>
          </Box>

          {/* Launcher pill */}
          <Box
            sx={{
              position: "absolute",
              top: 12,
              left: 12,
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1,
              py: 0.5,
              borderRadius: 1.5,
              bgcolor: "hsl(20 12% 4% / 0.6)",
              backdropFilter: "blur(6px)",
            }}
          >
            <Logo
              name={launcher.logoKey}
              alt={launcher.name}
              className="h-4 w-4 rounded-sm"
            />
            <Typography variant="caption" sx={{ fontWeight: 600, color: "common.white" }}>
              {launcher.name}
            </Typography>
          </Box>

          {/* Perfect + sync */}
          <Box
            sx={{
              position: "absolute",
              top: 12,
              right: 12,
              display: "flex",
              alignItems: "center",
              gap: 0.75,
            }}
          >
            {playing && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1.5,
                  bgcolor: "hsl(142 66% 45% / 0.2)",
                  color: "hsl(142 66% 45%)",
                  backdropFilter: "blur(6px)",
                }}
              >
                <Box
                  className="animate-pulse"
                  sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "hsl(142 66% 45%)" }}
                />
                <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>
                  Playing
                </Typography>
              </Box>
            )}
            {perfect && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1.5,
                  bgcolor: "hsl(41 92% 56% / 0.2)",
                  color: GOLD,
                  backdropFilter: "blur(6px)",
                }}
              >
                <Sparkles size={12} />
                <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>
                  Perfect
                </Typography>
              </Box>
            )}
            {/* Only flag games that still need syncing — synced is the norm. */}
            {!game.synced && (
              <Box
                title="Sync pending"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  backdropFilter: "blur(6px)",
                  bgcolor: "hsl(38 92% 50% / 0.2)",
                  color: "hsl(38 92% 50%)",
                }}
              >
                <RefreshCcw size={14} />
              </Box>
            )}
          </Box>

          {/* Title */}
          <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0, p: 1.5 }}>
            <Typography noWrap sx={{ fontWeight: 600, color: "text.primary" }}>
              {game.title}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
              {game.genre && (
                <>
                  <Typography variant="caption">{game.genre}</Typography>
                  <Box
                    component="span"
                    sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: "currentColor" }}
                  />
                </>
              )}
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Clock size={12} />
                <Typography variant="caption">{game.playtimeHours}h</Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Stats */}
        <CardContent sx={{ width: "100%", p: 2, "&:last-child": { pb: 2 } }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Achievements
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {game.earnedAchievements}/{game.totalAchievements}
            </Typography>
          </Box>

          <LinearProgress
            variant="determinate"
            value={completion}
            sx={{
              height: 8,
              borderRadius: 5,
              bgcolor: "hsl(24 7% 14%)",
              "& .MuiLinearProgress-bar": {
                borderRadius: 5,
                backgroundColor: perfect ? GOLD : "primary.main",
              },
            }}
          />

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mt: 1.25,
            }}
          >
            <RarityDots breakdown={game.rarityBreakdown} />
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, color: perfect ? GOLD : "text.primary" }}
            >
              {completion.toFixed(0)}%
            </Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

const RarityDots = ({ breakdown }: { breakdown: RarityBreakdown }) => {
  const tiers: Array<{ key: keyof RarityBreakdown; color: string; label: string }> = [
    { key: "legendary", color: "hsl(41, 92%, 56%)", label: "Legendary" },
    { key: "epic", color: "hsl(270, 70%, 65%)", label: "Epic" },
    { key: "rare", color: "hsl(205, 80%, 58%)", label: "Rare" },
  ];

  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      {tiers.map((t) => (
        <Box
          key={t.key}
          title={`${breakdown[t.key]} ${t.label}`}
          sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
        >
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: t.color }} />
          <Typography variant="caption" color="text.secondary">
            {breakdown[t.key]}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};
