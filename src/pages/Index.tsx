import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GameCard } from "@/components/GameCard";
import { GameListItem } from "@/components/GameListItem";
import { GameDetailDrawer } from "@/components/GameDetailDrawer";
import { AppNav } from "@/components/AppNav";
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
  Lock,
  RefreshCw,
  Sparkles,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { mockGames } from "@/data/mockGames";
import {
  Game,
  completionPercentage,
  isCurrentlyPlaying,
  isPerfectGame,
} from "@/types/game";
import { useSteam } from "@/hooks/useSteam";
import { useDesktop } from "@/hooks/useDesktop";
import { useCollections } from "@/hooks/useCollections";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "playing" | "perfect" | "in-progress" | "unsynced";
type SortKey = "recent" | "completion" | "playtime" | "title";
type ViewMode = "grid" | "list";

const PAGE_SIZE = 36;

/** Library grid: as many 220px columns as fit, matching the portrait cards. */
const GAME_GRID = "grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]";

const Index = () => {
  const steam = useSteam();
  const desktop = useDesktop();
  const localGames = useMemo(() => new Map(desktop.installed.map(game => [game.appid, game])), [desktop.installed]);
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
    // Average of each game's completion percentage (not a weighted aggregate),
    // across only the games that have achievements.
    const avgCompletion =
      withAch.length === 0
        ? 0
        : withAch.reduce((sum, g) => sum + completionPercentage(g), 0) / withAch.length;
    return {
      earned,
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
      <AppNav />

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
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success shadow-[0_0_8px_hsl(var(--success))]" />
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

        {/* Slim hero stat bar */}
        <StatBar
          items={[
            { icon: <Library className="h-4 w-4" />, label: "Games", value: games.length.toLocaleString() },
            {
              icon: <Award className="h-4 w-4" />,
              label: "Achievements",
              value: kpi.unlocked.toLocaleString(),
            },
            {
              icon: <Sparkles className="h-4 w-4 text-rarity-legendary" />,
              label: "Perfect",
              value: kpi.perfect.toLocaleString(),
            },
            {
              icon: <TrendingUp className="h-4 w-4 text-success" />,
              label: "Avg completion",
              value: `${kpi.avg.toFixed(0)}%`,
            },
          ]}
          hint={statsRefining ? "refining…" : undefined}
        />

        {/* Library */}
        <main className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search games or genres…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            {collections.length > 0 && (
              <Select value={collectionFilter} onValueChange={setCollectionFilter}>
                <SelectTrigger className="w-full lg:w-44">
                  <SelectValue placeholder="Collection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All collections</SelectItem>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-full lg:w-44">
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
          {steam.status === "error" && steam.library.length > 0 && (
            <p className="text-xs text-destructive">
              Couldn't load your Steam library: {steam.error}
            </p>
          )}

          {/* Content */}
          {libraryLoading ? (
            <LoadingGrid />
          ) : visibleGames.length === 0 ? (
            usingSteam && steam.library.length === 0 && steam.status === "error" ? (
              <EmptyState
                icon={<Lock className="h-7 w-7 text-destructive" />}
                iconClass="bg-destructive/15"
                title="Couldn't reach your Steam library"
                description={steam.error ?? "Steam didn't respond."}
                actions={
                  <>
                    <Button asChild size="sm">
                      <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">
                        Get a Steam API key
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={steam.refresh}>
                      Retry
                    </Button>
                  </>
                }
              />
            ) : usingSteam && steam.library.length === 0 ? (
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
              <div className={GAME_GRID}>
                {shown.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    frameState={usingSteam && desktop.steam?.installed && !desktop.loading && game.launcher === "steam" ? (localGames.get(game.id)?.state === "installed" ? "play" : "download") : "idle"}
                    downloadProgress={desktop.downloads.get(game.id)?.downloadProgress}
                    live={!!nowPlaying && game.id === nowPlaying.gameId}
                    onClick={() => setSelectedGame(game)}
                  />
                ))}
              </div>
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

const StatBar = ({
  items,
  hint,
}: {
  items: Array<{ icon: ReactNode; label: string; value: string }>;
  hint?: string;
}) => (
  <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-border bg-gradient-hero px-5 py-4">
    {items.map((item) => (
      <div key={item.label} className="flex items-center gap-2.5">
        <span className="text-primary">{item.icon}</span>
        <span className="text-xl font-bold tabular-nums text-foreground">{item.value}</span>
        <span className="text-xs text-muted-foreground">{item.label}</span>
      </div>
    ))}
    {hint && <span className="ml-auto text-[11px] text-muted-foreground">{hint}</span>}
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
  <div className={GAME_GRID}>
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="overflow-hidden rounded-xl border border-border">
        <Skeleton className="aspect-[2/3] w-full rounded-none" />
        <div className="space-y-2 p-4">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2 w-full" />
        </div>
      </div>
    ))}
  </div>
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
