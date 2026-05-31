import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { GameCard } from "@/components/GameCard";
import { GameListItem } from "@/components/GameListItem";
import { GameDetailDrawer } from "@/components/GameDetailDrawer";
import { AchievementStats } from "@/components/AchievementStats";
import { CollectionsPanel } from "@/components/CollectionsPanel";
import { AuthButton } from "@/components/AuthButton";
import { UserProfile } from "@/components/UserProfile";
import Box from "@mui/material/Box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Library,
  Award,
  TrendingUp,
  Gamepad2,
  Lock,
  RefreshCw,
  Sparkles,
  LayoutGrid,
  List as ListIcon,
  BarChart3,
} from "lucide-react";
import { mockGames } from "@/data/mockGames";
import {
  Game,
  RarityBreakdown,
  completionPercentage,
  isCurrentlyPlaying,
  isPerfectGame,
} from "@/types/game";
import { useSteam } from "@/hooks/useSteam";
import { useCollections } from "@/hooks/useCollections";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "playing" | "perfect" | "in-progress" | "unsynced";
type SortKey = "recent" | "completion" | "playtime" | "title";
type ViewMode = "grid" | "list";

const PAGE_SIZE = 36;

const EMPTY_BREAKDOWN: RarityBreakdown = {
  common: 0,
  uncommon: 0,
  rare: 0,
  epic: 0,
  legendary: 0,
};

const Index = () => {
  const steam = useSteam();
  // Show the real Steam library once connected; otherwise the demo library.
  const usingSteam = steam.connected;
  const libraryLoading =
    usingSteam && (steam.status === "loading" || steam.status === "verifying");
  const games: Game[] = usingSteam ? steam.library : mockGames;

  const { collections } = useCollections();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  const activeCollection = collections.find((c) => c.id === collectionFilter);

  const stats = useMemo(() => {
    // Only games we actually have achievement data for count toward the
    // achievement stats (for a Steam library that's the synced subset).
    const withAch = games.filter((g) => g.totalAchievements > 0);
    const earned = games.reduce((sum, g) => sum + g.earnedAchievements, 0);
    const breakdown = games.reduce<RarityBreakdown>(
      (acc, g) => ({
        common: acc.common + g.rarityBreakdown.common,
        uncommon: acc.uncommon + g.rarityBreakdown.uncommon,
        rare: acc.rare + g.rarityBreakdown.rare,
        epic: acc.epic + g.rarityBreakdown.epic,
        legendary: acc.legendary + g.rarityBreakdown.legendary,
      }),
      { ...EMPTY_BREAKDOWN },
    );
    // Average of each game's completion percentage (not a weighted aggregate),
    // across only the games that have achievements.
    const avgCompletion =
      withAch.length === 0
        ? 0
        : withAch.reduce((sum, g) => sum + completionPercentage(g), 0) / withAch.length;
    return {
      earned,
      breakdown,
      perfectGames: games.filter(isPerfectGame).length,
      avgCompletion,
      gamesWithAch: withAch.length,
    };
  }, [games]);

  // Prefer accurate whole-library stats (computed in the background) over the
  // numbers derived from the fast top-20 sync.
  const accurate = usingSteam ? steam.libraryStats : null;
  const statsRefining = usingSteam && steam.statsLoading && !accurate;
  const kpi = {
    unlocked: accurate ? accurate.totalUnlocked : stats.earned,
    perfect: accurate ? accurate.perfectGames : stats.perfectGames,
    avg: accurate ? accurate.avgCompletion : stats.avgCompletion,
    withAch: accurate ? accurate.gamesWithAchievements : stats.gamesWithAch,
  };
  const kpiHint = (over: number): string | undefined => {
    if (statsRefining) return "refining…";
    if (usingSteam && accurate) return `from ${over.toLocaleString()} games`;
    if (over > 0) return `across ${over.toLocaleString()} games`;
    return undefined;
  };

  const nowPlaying = steam.presence?.inGame ? steam.presence : null;
  const nowPlayingGame = nowPlaying?.gameId
    ? games.find((g) => g.id === nowPlaying.gameId) ?? null
    : null;

  const visibleGames = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = games.filter((game) => {
      const matchesSearch =
        !term ||
        game.title.toLowerCase().includes(term) ||
        game.genre.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "playing" && isCurrentlyPlaying(game)) ||
        (statusFilter === "perfect" && isPerfectGame(game)) ||
        (statusFilter === "in-progress" && !isPerfectGame(game)) ||
        (statusFilter === "unsynced" && !game.synced);
      const matchesCollection =
        collectionFilter === "all" ||
        (activeCollection?.gameIds.includes(game.id) ?? false);
      return matchesSearch && matchesStatus && matchesCollection;
    });

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "completion":
          return completionPercentage(b) - completionPercentage(a);
        case "playtime":
          return b.playtimeHours - a.playtimeHours;
        case "title":
          return a.title.localeCompare(b.title);
        case "recent":
        default:
          return (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? "");
      }
    });
  }, [games, search, statusFilter, collectionFilter, activeCollection, sort]);

  // Reset pagination whenever the result set changes.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, collectionFilter, sort, usingSteam]);

  const shown = visibleGames.slice(0, page * PAGE_SIZE);
  const hasMore = shown.length < visibleGames.length;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCollectionFilter("all");
  };

  const statusChips: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "playing", label: "Recently played" },
    { key: "in-progress", label: "In progress" },
    { key: "perfect", label: "Perfect" },
    { key: "unsynced", label: "Needs sync" },
  ];

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
              <Gamepad2 className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-foreground">Dsync</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/stats"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Stats</span>
            </Link>
            <AuthButton />
          </div>
        </div>
      </nav>

      <div className="container mx-auto space-y-6 px-4 py-6">
        {/* Live now-playing */}
        {nowPlaying && (
          <button
            type="button"
            onClick={() => nowPlayingGame && setSelectedGame(nowPlayingGame)}
            disabled={!nowPlayingGame}
            className="flex w-full items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-left transition-colors enabled:hover:bg-success/15"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            <span className="text-sm">
              <span className="text-muted-foreground">Now playing </span>
              <span className="font-semibold text-foreground">
                {nowPlaying.gameName ?? "a game"}
              </span>
            </span>
            {nowPlayingGame && (
              <span className="ml-auto text-xs font-medium text-primary">
                View achievements →
              </span>
            )}
          </button>
        )}

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={<Library className="h-4 w-4" />} label="Games" value={games.length.toLocaleString()} />
          <Kpi
            icon={<Award className="h-4 w-4" />}
            label="Achievements"
            value={kpi.unlocked.toLocaleString()}
            hint={kpiHint(kpi.withAch)}
          />
          <Kpi
            icon={<Sparkles className="h-4 w-4 text-rarity-legendary" />}
            label="Perfect games"
            value={kpi.perfect.toLocaleString()}
            hint={statsRefining ? "refining…" : undefined}
          />
          <Kpi
            icon={<TrendingUp className="h-4 w-4 text-success" />}
            label="Avg completion"
            value={`${kpi.avg.toFixed(0)}%`}
            hint={kpiHint(kpi.withAch)}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Sidebar */}
          <aside className="space-y-4 lg:col-span-1">
            <UserProfile
              gameCount={games.length}
              achievementCount={kpi.unlocked}
              perfectGames={kpi.perfect}
            />
            <CollectionsPanel selected={collectionFilter} onSelect={setCollectionFilter} />
            <AchievementStats breakdown={stats.breakdown} />
          </aside>

          {/* Main */}
          <main className="space-y-4 lg:col-span-3">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search games or genres…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recently played</SelectItem>
                  <SelectItem value="completion">Completion</SelectItem>
                  <SelectItem value="playtime">Playtime</SelectItem>
                  <SelectItem value="title">Title (A–Z)</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex shrink-0 rounded-md border border-border p-0.5">
                <ViewButton active={view === "grid"} onClick={() => setView("grid")} label="Grid view">
                  <LayoutGrid className="h-4 w-4" />
                </ViewButton>
                <ViewButton active={view === "list"} onClick={() => setView("list")} label="List view">
                  <ListIcon className="h-4 w-4" />
                </ViewButton>
              </div>
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2">
              {statusChips.map((chip) => (
                <FilterChip
                  key={chip.key}
                  active={statusFilter === chip.key}
                  onClick={() => setStatusFilter(chip.key)}
                >
                  {chip.label}
                </FilterChip>
              ))}
            </div>

            {/* Status row: count + data source */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {libraryLoading
                  ? "Loading your library…"
                  : `${visibleGames.length.toLocaleString()} ${
                      visibleGames.length === 1 ? "game" : "games"
                    }`}
              </span>
              {!usingSteam ? (
                <span>Demo library — sign in with Steam to load yours.</span>
              ) : steam.lastSynced ? (
                <button
                  type="button"
                  onClick={steam.refresh}
                  disabled={steam.refreshing}
                  className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-60"
                >
                  <RefreshCw className={cn("h-3 w-3", steam.refreshing && "animate-spin")} />
                  {steam.refreshing ? "Syncing…" : `Synced ${relativeTime(steam.lastSynced)} · Refresh`}
                </button>
              ) : null}
            </div>
            {steam.status === "error" && (
              <p className="text-xs text-destructive">
                Couldn't load your Steam library: {steam.error}
              </p>
            )}

            {/* Content */}
            {libraryLoading ? (
              <LoadingGrid />
            ) : visibleGames.length === 0 ? (
              usingSteam && steam.library.length === 0 ? (
                <EmptyState
                  icon={<Lock className="h-7 w-7 text-warning" />}
                  iconClass="bg-warning/15"
                  title="Your Steam library came back empty"
                  description="Steam only shares your games when your profile is public. Open Edit Profile → Privacy Settings and set Game details (and your profile) to Public, then refresh."
                  actions={
                    <>
                      <Button asChild size="sm">
                        <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noreferrer">
                          Open Steam privacy settings
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" onClick={steam.refresh}>
                        Refresh
                      </Button>
                      <Button variant="ghost" size="sm" onClick={steam.signOut}>
                        Use demo library
                      </Button>
                    </>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Search className="h-7 w-7 text-muted-foreground" />}
                  iconClass="bg-muted"
                  title="No games found"
                  description="Try a different search or clear your filters."
                  actions={
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              )
            ) : view === "grid" ? (
              <>
                <Box
                  sx={{
                    display: "grid",
                    gap: 2.5,
                    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                  }}
                >
                  {shown.map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      live={!!nowPlaying && game.id === nowPlaying.gameId}
                      onClick={() => setSelectedGame(game)}
                    />
                  ))}
                </Box>
                {hasMore && <LoadMore shown={shown.length} total={visibleGames.length} onClick={() => setPage((p) => p + 1)} />}
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {shown.map((game) => (
                    <GameListItem
                      key={game.id}
                      game={game}
                      live={!!nowPlaying && game.id === nowPlaying.gameId}
                      onClick={() => setSelectedGame(game)}
                    />
                  ))}
                </div>
                {hasMore && <LoadMore shown={shown.length} total={visibleGames.length} onClick={() => setPage((p) => p + 1)} />}
              </>
            )}
          </main>
        </div>
      </div>

      <GameDetailDrawer
        game={selectedGame}
        open={selectedGame !== null}
        onClose={() => setSelectedGame(null)}
      />
    </div>
  );
};

const relativeTime = (ts: number): string => {
  const minutes = Math.round((Date.now() - ts) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const Kpi = ({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-xl border border-border bg-gradient-card p-4">
    <div className="mb-1 flex items-center gap-2 text-muted-foreground">
      <span className="text-primary">{icon}</span>
      <span className="text-xs">{label}</span>
    </div>
    <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
    {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
  </div>
);

const ViewButton = ({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    className={cn(
      "flex h-8 w-8 items-center justify-center rounded transition-colors",
      active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

const LoadMore = ({ shown, total, onClick }: { shown: number; total: number; onClick: () => void }) => (
  <div className="flex flex-col items-center gap-2 pt-2">
    <Button variant="outline" onClick={onClick}>
      Load more
    </Button>
    <span className="text-xs text-muted-foreground">
      Showing {shown.toLocaleString()} of {total.toLocaleString()}
    </span>
  </div>
);

const LoadingGrid = () => (
  <Box
    sx={{
      display: "grid",
      gap: 2.5,
      gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    }}
  >
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="overflow-hidden rounded-xl border border-border">
        <Skeleton className="aspect-[3/4] w-full rounded-none" />
        <div className="space-y-2 p-4">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2 w-full" />
        </div>
      </div>
    ))}
  </Box>
);

const EmptyState = ({
  icon,
  iconClass,
  title,
  description,
  actions,
}: {
  icon: ReactNode;
  iconClass: string;
  title: string;
  description: string;
  actions: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
    <div className={cn("mb-4 flex h-14 w-14 items-center justify-center rounded-full", iconClass)}>
      {icon}
    </div>
    <h3 className="mb-1 font-semibold text-foreground">{title}</h3>
    <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div>
  </div>
);

const FilterChip = ({
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
      "rounded-full border px-3 py-1 text-sm transition-colors",
      active
        ? "border-primary bg-primary/15 text-primary"
        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
    )}
  >
    {children}
  </button>
);

export default Index;
