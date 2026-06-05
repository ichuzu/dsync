import { useEffect, useState, type ReactNode } from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import {
  X,
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
} from "lucide-react";
import {
  Achievement,
  Game,
  Rarity,
  completionPercentage,
  isPerfectGame,
} from "@/types/game";
import { LAUNCHERS } from "@/lib/launchers";
import { Logo } from "@/components/Logo";
import { useSteam } from "@/hooks/useSteam";
import { useCollections } from "@/hooks/useCollections";
import { fetchSteamAchievements } from "@/lib/steamClient";
import { getImageCandidates } from "@/lib/steamImage";
import gamePlaceholder from "@/assets/game-placeholder.jpg";

interface GameDetailDrawerProps {
  game: Game | null;
  open: boolean;
  onClose: () => void;
}

const GOLD = "hsl(41, 92%, 56%)";

const RARITY_COLOR: Record<Rarity, string> = {
  legendary: "hsl(41, 92%, 56%)",
  epic: "hsl(270, 65%, 65%)",
  rare: "hsl(205, 80%, 58%)",
  uncommon: "hsl(142, 55%, 50%)",
  common: "hsl(24, 6%, 60%)",
};

const isSteamApp = (game: Game) => game.launcher === "steam" && Number(game.id) > 1000;

const youtubeGuideUrl = (gameTitle: string, achievementName: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${gameTitle} ${achievementName} achievement guide`,
  )}`;

export const GameDetailDrawer = ({ game, open, onClose }: GameDetailDrawerProps) => (
  <Drawer
    anchor="right"
    open={open && Boolean(game)}
    onClose={onClose}
    PaperProps={{
      sx: {
        width: { xs: "100%", sm: 460 },
        bgcolor: "background.default",
        backgroundImage: "none",
      },
    }}
  >
    {game && <GameDetailContent key={game.id} game={game} onClose={onClose} />}
  </Drawer>
);

type AchFilter = "all" | "unlocked" | "locked";

const GameDetailContent = ({ game, onClose }: { game: Game; onClose: () => void }) => {
  const steam = useSteam();
  const { collections, toggleGame, create } = useCollections();
  const launcher = LAUNCHERS[game.launcher];
  const canFetch = steam.connected && isSteamApp(game) && Boolean(steam.profile?.steamId);

  const [achievements, setAchievements] = useState<Achievement[] | null>(null);
  const [loading, setLoading] = useState(canFetch);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AchFilter>("all");
  const [addingCol, setAddingCol] = useState(false);
  const [colName, setColName] = useState("");

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
  const playing = Boolean(
    steam.presence?.inGame && steam.presence.gameId === game.id,
  );

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

  const filtered = (achievements ?? []).filter((a) =>
    filter === "all" ? true : filter === "unlocked" ? a.unlocked : !a.unlocked,
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Banner */}
      <Box sx={{ position: "relative", height: 170, flexShrink: 0 }}>
        <Box
          component="img"
          src={bannerSrc}
          alt={game.title}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            const next = Number(img.dataset.fb ?? "0") + 1;
            if (next < bannerCandidates.length) {
              img.dataset.fb = String(next);
              img.src = bannerCandidates[next];
            } else if (img.dataset.fb !== "placeholder") {
              img.dataset.fb = "placeholder";
              img.src = gamePlaceholder;
            }
          }}
          sx={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, hsl(20 9% 6%) 0%, hsl(20 9% 6% / 0.2) 60%, hsl(20 9% 6% / 0.4) 100%)",
          }}
        />
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            bgcolor: "hsl(20 12% 4% / 0.6)",
            backdropFilter: "blur(6px)",
            "&:hover": { bgcolor: "hsl(20 12% 4% / 0.85)" },
          }}
        >
          <X size={18} />
        </IconButton>
        <Box sx={{ position: "absolute", left: 16, right: 16, bottom: 12 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Logo name={launcher.logoKey} alt={launcher.name} className="h-4 w-4 rounded-sm" />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {launcher.name}
              {game.genre ? ` · ${game.genre}` : ""}
            </Typography>
            {playing && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: "hsl(142 66% 45% / 0.2)",
                  color: "hsl(142 66% 45%)",
                }}
              >
                <Box
                  className="animate-pulse"
                  sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "hsl(142 66% 45%)" }}
                />
                <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 10 }}>
                  Playing
                </Typography>
              </Box>
            )}
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {game.title}
          </Typography>
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ p: 2.5, overflowY: "auto", flex: 1 }}>
        {/* Quick facts */}
        <Box sx={{ display: "flex", gap: 1.5, mb: 2.5 }}>
          <Fact icon={<Clock size={15} />} label="Playtime" value={`${game.playtimeHours}h`} />
          <Fact icon={<CalendarDays size={15} />} label="Last played" value={game.lastPlayed ?? "—"} />
          <Fact
            icon={game.synced ? <CheckCircle2 size={15} /> : <RefreshCcw size={15} />}
            label="Sync"
            value={game.synced ? "Synced" : "Pending"}
          />
        </Box>

        {/* Completion */}
        <Box sx={{ mb: 2.5 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
            <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
              Achievements
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {perfect && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: GOLD }}>
                  <Sparkles size={14} />
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    Perfect
                  </Typography>
                </Box>
              )}
              <Typography sx={{ fontWeight: 700 }}>
                {earned}/{total}
              </Typography>
            </Box>
          </Box>
          <LinearProgress
            variant="determinate"
            value={completion}
            sx={{
              height: 10,
              borderRadius: 5,
              bgcolor: "hsl(24 7% 14%)",
              "& .MuiLinearProgress-bar": {
                borderRadius: 5,
                backgroundColor: perfect ? GOLD : "primary.main",
              },
            }}
          />
          <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block" }}>
            {completion.toFixed(0)}% complete
          </Typography>
        </Box>

        {/* Per-game stats */}
        {total > 0 && (
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="subtitle2" sx={{ color: "text.secondary", mb: 1 }}>
              Stats
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
              <Fact icon={<Target size={15} />} label="Achievements left" value={String(left)} />
              <Fact
                icon={<Timer size={15} />}
                label="Per achievement"
                value={hoursPerAch != null ? `${hoursPerAch.toFixed(1)}h` : "—"}
              />
              <Fact
                icon={<Hourglass size={15} />}
                label="Est. to 100%"
                value={
                  perfect ? "Complete" : estToComplete != null ? `~${estToComplete}h` : "—"
                }
              />
              <Fact icon={<CalendarClock size={15} />} label="Started" value={startedDate ?? "—"} />
            </Box>
            {estToComplete != null && !perfect && (
              <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, display: "block" }}>
                ~{estToComplete}h more at your current pace ({hoursPerAch?.toFixed(1)}h per
                achievement) to unlock the remaining {left}.
              </Typography>
            )}
          </Box>
        )}

        {/* Collections */}
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" sx={{ color: "text.secondary", mb: 1 }}>
            Collections
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
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
              <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
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
              </Box>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCol(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus size={12} /> New
              </button>
            )}
          </Box>
        </Box>

        {/* Individual achievements */}
        {canFetch ? (
          <Box>
            {recommendedNext && (
              <Box
                sx={{
                  mb: 2,
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "primary.main",
                  bgcolor: "hsl(24 95% 53% / 0.08)",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: "primary.main", fontWeight: 800, letterSpacing: 0.5 }}
                >
                  ★ GO FOR THIS NEXT
                </Typography>
                <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", mt: 1 }}>
                  {recommendedNext.icon ? (
                    <Box
                      component="img"
                      src={recommendedNext.icon}
                      alt=""
                      sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: 1 }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        flexShrink: 0,
                        borderRadius: 1,
                        bgcolor: "hsl(24 7% 14%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "text.secondary",
                      }}
                    >
                      <Trophy size={20} />
                    </Box>
                  )}
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                      {recommendedNext.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {recommendedNext.globalUnlockPct
                        ? `${recommendedNext.globalUnlockPct.toFixed(1)}% of players have this — your easiest win`
                        : "Your easiest remaining achievement"}
                    </Typography>
                  </Box>
                </Box>
                <Button
                  fullWidth
                  size="small"
                  variant="contained"
                  sx={{ mt: 1.5 }}
                  href={youtubeGuideUrl(game.title, recommendedNext.name)}
                  target="_blank"
                  rel="noreferrer"
                  startIcon={<Youtube size={16} />}
                >
                  Watch a guide
                </Button>
              </Box>
            )}
            <Box sx={{ display: "flex", gap: 0.75, mb: 1.5 }}>
              <AchChip active={filter === "all"} onClick={() => setFilter("all")}>
                All {total > 0 ? total : ""}
              </AchChip>
              <AchChip active={filter === "unlocked"} onClick={() => setFilter("unlocked")}>
                Unlocked {earned}
              </AchChip>
              <AchChip active={filter === "locked"} onClick={() => setFilter("locked")}>
                Locked {Math.max(total - earned, 0)}
              </AchChip>
            </Box>

            {loading ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Box key={i} sx={{ display: "flex", gap: 1.5 }}>
                    <Skeleton variant="rounded" width={40} height={40} />
                    <Box sx={{ flex: 1 }}>
                      <Skeleton width="60%" />
                      <Skeleton width="90%" height={12} />
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : error ? (
              <Typography variant="body2" sx={{ color: "error.main" }}>
                Couldn't load achievements: {error}
              </Typography>
            ) : filtered.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {total === 0
                  ? "This game has no achievements."
                  : `No ${filter} achievements.`}
              </Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                {filtered.map((a) => (
                  <AchievementRow key={a.id} a={a} gameTitle={game.title} />
                ))}
              </Box>
            )}
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {isSteamApp(game)
              ? "Sign in with Steam to see individual achievements."
              : "Individual achievements are available for Steam games."}
          </Typography>
        )}
      </Box>

      {/* Footer */}
      {isSteamApp(game) && (
        <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider", flexShrink: 0 }}>
          <Button
            fullWidth
            variant="contained"
            href={`https://store.steampowered.com/app/${game.id}`}
            target="_blank"
            rel="noreferrer"
            endIcon={<ExternalLink size={16} />}
          >
            View on Steam
          </Button>
        </Box>
      )}
    </Box>
  );
};

const AchievementRow = ({ a, gameTitle }: { a: Achievement; gameTitle: string }) => (
  <Box
    className="group"
    sx={{
      display: "flex",
      gap: 1.5,
      alignItems: "flex-start",
      py: 1.25,
      borderTop: "1px solid",
      borderColor: "divider",
      opacity: a.unlocked ? 1 : 0.7,
    }}
  >
    {a.icon ? (
      <Box
        component="img"
        src={a.icon}
        alt=""
        loading="lazy"
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 1,
          filter: a.unlocked ? "none" : "grayscale(1)",
        }}
      />
    ) : (
      <Box
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 1,
          bgcolor: "hsl(24 7% 14%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.secondary",
        }}
      >
        <Trophy size={18} />
      </Box>
    )}

    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {a.name}
      </Typography>
      {a.description && (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {a.description}
        </Typography>
      )}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: RARITY_COLOR[a.rarity] }} />
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {a.globalUnlockPct ? `${a.globalUnlockPct.toFixed(1)}% of players` : "Rarity n/a"}
        </Typography>
        {a.unlocked && a.unlockedDate && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            · {a.unlockedDate}
          </Typography>
        )}
      </Box>
    </Box>

    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0, mt: 0.5 }}>
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
      <Box sx={{ color: a.unlocked ? "success.main" : "text.disabled" }}>
        {a.unlocked ? <CheckCircle2 size={16} /> : <Lock size={14} />}
      </Box>
    </Box>
  </Box>
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
    className={
      "rounded-full border px-2.5 py-1 text-xs transition-colors " +
      (active
        ? "border-primary bg-primary/15 text-primary"
        : "border-border text-muted-foreground hover:text-foreground")
    }
  >
    {children}
  </button>
);

const Fact = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <Box
    sx={{
      flex: 1,
      borderRadius: 2,
      border: "1px solid",
      borderColor: "divider",
      p: 1.25,
      bgcolor: "background.paper",
    }}
  >
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary", mb: 0.5 }}>
      {icon}
      <Typography variant="caption">{label}</Typography>
    </Box>
    <Typography
      variant="body2"
      sx={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
    >
      {value}
    </Typography>
  </Box>
);
