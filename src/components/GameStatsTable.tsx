import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Search, Table2 } from "lucide-react";
import { ProgressBar } from "@/components/ProgressBar";
import {
  Game,
  completionPercentage,
  isCurrentlyPlaying,
  isPerfectGame,
} from "@/types/game";
import { cn } from "@/lib/utils";

/** How the rows are ordered. */
type SortKey =
  | "title"
  | "genre"
  | "playtime"
  | "recent"
  | "achievements"
  | "completion"
  | "started"
  | "lastPlayed";

type Filter = "all" | "playing" | "perfect" | "progress" | "never" | "noAch";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "playing", label: "Playing" },
  { key: "perfect", label: "Perfect" },
  { key: "progress", label: "In progress" },
  { key: "never", label: "Never played" },
  { key: "noAch", label: "No achievements" },
];

const PAGE = 25;

interface GameStatsTableProps {
  games: Game[];
  /** appid to genre, for Steam libraries where genres resolve in the background. */
  genreOf: (game: Game) => string | undefined;
  /** appid to earliest achievement-unlock date (YYYY-MM-DD). */
  started: Record<string, string>;
  loading?: boolean;
}

/** Perfect, then playing, then never played, then in progress. First match wins. */
const statusOf = (g: Game) => {
  if (isPerfectGame(g)) return { key: "perfect", label: "Perfect", className: "text-perfect" } as const;
  if (isCurrentlyPlaying(g)) return { key: "playing", label: "Playing", className: "text-success" } as const;
  if (g.playtimeHours === 0) return { key: "never", label: "Never played", className: "text-muted-foreground" } as const;
  return { key: "progress", label: "In progress", className: "text-foreground/70" } as const;
};

const matchesFilter = (g: Game, filter: Filter): boolean => {
  switch (filter) {
    case "playing":
      return isCurrentlyPlaying(g);
    case "perfect":
      return isPerfectGame(g);
    case "progress":
      return g.totalAchievements > 0 && !isPerfectGame(g) && g.earnedAchievements > 0;
    case "never":
      return g.playtimeHours === 0;
    case "noAch":
      return g.totalAchievements === 0;
    default:
      return true;
  }
};

const formatHours = (h: number): string =>
  h === 0 ? "—" : h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString();

/** YYYY-MM-DD (or a full ISO timestamp) rendered as a compact "12 Mar 2024". */
const formatDate = (value?: string): string => {
  if (!value) return "—";
  const t = Date.parse(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(t)) return value;
  return new Date(t).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/**
 * Every game in the library as one sortable, filterable row: the per-game
 * counterpart to the aggregate cards above it. Rows are capped and extended
 * with "show more" so a 3,000-game library stays responsive.
 */
export const GameStatsTable = ({ games, genreOf, started, loading }: GameStatsTableProps) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("playtime");
  const [desc, setDesc] = useState(true);
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = games
      .filter((g) => matchesFilter(g, filter))
      .filter((g) => (q ? g.title.toLowerCase().includes(q) : true))
      .map((g) => ({
        game: g,
        genre: genreOf(g) ?? "",
        completion: completionPercentage(g),
        started: started[g.id] ?? "",
        status: statusOf(g),
      }));

    const dir = desc ? -1 : 1;
    const cmp = (a: (typeof list)[number], b: (typeof list)[number]): number => {
      switch (sort) {
        case "title":
          return a.game.title.localeCompare(b.game.title) * dir;
        case "genre":
          return a.genre.localeCompare(b.genre) * dir;
        case "recent":
          return ((a.game.recentPlaytimeHours ?? 0) - (b.game.recentPlaytimeHours ?? 0)) * dir;
        case "achievements":
          return (a.game.earnedAchievements - b.game.earnedAchievements) * dir;
        case "completion":
          return (a.completion - b.completion) * dir;
        case "started":
          return a.started.localeCompare(b.started) * dir;
        case "lastPlayed":
          return (a.game.lastPlayed ?? "").localeCompare(b.game.lastPlayed ?? "") * dir;
        default:
          return (a.game.playtimeHours - b.game.playtimeHours) * dir;
      }
    };
    // Stable tiebreak on title so equal values (lots of 0h rows) never shuffle.
    return list.sort((a, b) => cmp(a, b) || a.game.title.localeCompare(b.game.title));
  }, [games, genreOf, started, query, filter, sort, desc]);

  // The summary reacts to the active filter, so "Never played" tells you how
  // much of the library it covers without leaving the card.
  const summary = useMemo(() => {
    const hours = rows.reduce((s, r) => s + r.game.playtimeHours, 0);
    const withAch = rows.filter((r) => r.game.totalAchievements > 0);
    const avg =
      withAch.length === 0
        ? 0
        : withAch.reduce((s, r) => s + r.completion, 0) / withAch.length;
    const unlocked = rows.reduce((s, r) => s + r.game.earnedAchievements, 0);
    return { count: rows.length, hours, avg, unlocked };
  }, [rows]);

  const sortBy = (key: SortKey) => {
    if (key === sort) {
      setDesc((d) => !d);
    } else {
      setSort(key);
      // Text sorts read best A-Z; numeric ones best highest-first.
      setDesc(key !== "title" && key !== "genre");
    }
    setShown(PAGE);
  };

  const visible = rows.slice(0, shown);

  return (
    <div className="rounded-xl border border-border bg-gradient-card p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Table2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Per-game breakdown</h3>
        </div>
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Find a game..."
            className="w-full rounded-lg border border-border bg-background/40 py-1.5 pl-8 pr-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setFilter(key);
              setShown(PAGE);
            }}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs transition-colors",
              key === filter
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Games" value={summary.count.toLocaleString()} />
        <MiniStat label="Playtime" value={`${Math.round(summary.hours).toLocaleString()}h`} />
        <MiniStat label="Achievements" value={summary.unlocked.toLocaleString()} />
        <MiniStat label="Avg completion" value={`${summary.avg.toFixed(0)}%`} />
      </div>

      {loading && (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> achievement counts still filling in...
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">No games match this filter.</p>
      ) : (
        <>
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <Th onClick={() => sortBy("title")} active={sort === "title"} desc={desc}>
                    Game
                  </Th>
                  <Th onClick={() => sortBy("genre")} active={sort === "genre"} desc={desc}>
                    Genre
                  </Th>
                  <Th numeric onClick={() => sortBy("playtime")} active={sort === "playtime"} desc={desc}>
                    Hours
                  </Th>
                  <Th numeric onClick={() => sortBy("recent")} active={sort === "recent"} desc={desc}>
                    2wk
                  </Th>
                  <Th numeric onClick={() => sortBy("achievements")} active={sort === "achievements"} desc={desc}>
                    Achievements
                  </Th>
                  <Th onClick={() => sortBy("completion")} active={sort === "completion"} desc={desc}>
                    Completion
                  </Th>
                  <Th onClick={() => sortBy("started")} active={sort === "started"} desc={desc}>
                    Started
                  </Th>
                  <Th onClick={() => sortBy("lastPlayed")} active={sort === "lastPlayed"} desc={desc}>
                    Last played
                  </Th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ game, genre, completion, started: startDate, status }) => (
                  <tr
                    key={game.id}
                    className="border-b border-border/50 transition-colors last:border-0 hover:bg-foreground/[0.03]"
                  >
                    <td className="max-w-[240px] px-2 py-2">
                      <div className="truncate text-foreground" title={game.title}>
                        {game.title}
                      </div>
                      <div className={cn("text-[11px]", status.className)}>{status.label}</div>
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{genre || "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-foreground">
                      {formatHours(game.playtimeHours)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {formatHours(game.recentPlaytimeHours ?? 0)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {game.totalAchievements === 0
                        ? "—"
                        : `${game.earnedAchievements} / ${game.totalAchievements}`}
                    </td>
                    <td className="w-32 px-2 py-2">
                      {game.totalAchievements === 0 ? (
                        <span className="text-xs text-muted-foreground">{"—"}</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={completion}
                            className="h-1.5 flex-1"
                            barClassName={completion === 100 ? "bg-perfect" : undefined}
                            label={`${game.title} completion`}
                          />
                          <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                            {completion.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums text-muted-foreground">
                      {formatDate(startDate)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums text-muted-foreground">
                      {formatDate(game.lastPlayed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {shown < rows.length && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE * 2)}
              className="mt-4 w-full rounded-lg border border-border py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              Show more &mdash; {visible.length.toLocaleString()} of {rows.length.toLocaleString()}
            </button>
          )}
        </>
      )}
    </div>
  );
};

const Th = ({
  children,
  onClick,
  active,
  desc,
  numeric,
}: {
  children: string;
  onClick: () => void;
  active: boolean;
  desc: boolean;
  numeric?: boolean;
}) => (
  <th className={cn("px-2 pb-2 font-medium", numeric && "text-right")}>
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 transition-colors hover:text-foreground",
        active && "text-primary",
      )}
    >
      {children}
      {active && (desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
    </button>
  </th>
);

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-background/40 p-3">
    <div className="text-lg font-bold tabular-nums text-foreground">{value}</div>
    <div className="text-[11px] text-muted-foreground">{label}</div>
  </div>
);
