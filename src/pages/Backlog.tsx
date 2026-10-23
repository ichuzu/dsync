import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Hourglass,
  ListTodo,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { GameDetailDrawer } from "@/components/GameDetailDrawer";
import { ProgressBar } from "@/components/ProgressBar";
import { SteamImage } from "@/components/SteamImage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCollections } from "@/hooks/useCollections";
import { useSteam } from "@/hooks/useSteam";
import { backlogProgress, formatHours, type BacklogGoal, type BacklogProgress } from "@/lib/backlog";
import { useHltb } from "@/hooks/useHltb";
import { getSteamCollections, isDesktop, type SteamCollection } from "@/lib/desktop";
import { describeRule, resolveDynamicCollection } from "@/lib/dynamicCollections";
import type { LibraryTags } from "@/lib/steam";
import { fetchSteamLibraryTags } from "@/lib/steamClient";
import type { Game } from "@/types/game";
import { cn } from "@/lib/utils";

type SortKey = "closest" | "shortest" | "played" | "untouched";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "closest", label: "Closest to done" },
  { key: "shortest", label: "Least time left" },
  { key: "played", label: "Most played" },
  { key: "untouched", label: "Never started first" },
];

/** Unknowns sort last whichever way the list runs. */
const orNull = (n: number | null, fallback: number) => (n == null ? fallback : n);

const comparators: Record<SortKey, (a: BacklogProgress, b: BacklogProgress) => number> = {
  closest: (a, b) => orNull(b.percent, -1) - orNull(a.percent, -1),
  shortest: (a, b) => orNull(a.hoursLeft, Infinity) - orNull(b.hoursLeft, Infinity),
  played: (a, b) => b.playtimeHours - a.playtimeHours,
  untouched: (a, b) => Number(b.untouched) - Number(a.untouched) || a.playtimeHours - b.playtimeHours,
};

const LAST_COLLECTION_KEY = "dsync.backlog.collection";
const GOAL_KEY = "dsync.backlog.goal";

const GOALS: Array<{ key: BacklogGoal; label: string }> = [
  { key: "beat", label: "Beat it" },
  { key: "complete", label: "100% it" },
];

const Backlog = () => {
  const steam = useSteam();
  const { collections, toggleGame } = useCollections();
  const [importOpen, setImportOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("closest");
  const [goal, setGoal] = useState<BacklogGoal>(() => {
    try {
      return localStorage.getItem(GOAL_KEY) === "beat" ? "beat" : "complete";
    } catch {
      return "complete";
    }
  });
  const chooseGoal = (next: BacklogGoal) => {
    setGoal(next);
    try {
      localStorage.setItem(GOAL_KEY, next);
    } catch {
      /* ignore */
    }
  };
  const [selected, setSelected] = useState<Game | null>(null);

  // Default to the last one viewed, else anything called "Backlog".
  const [collectionId, setCollectionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_COLLECTION_KEY);
    } catch {
      return null;
    }
  });
  const collection =
    collections.find((c) => c.id === collectionId) ??
    collections.find((c) => c.name.toLowerCase() === "backlog") ??
    null;

  useEffect(() => {
    if (!collection) return;
    try {
      localStorage.setItem(LAST_COLLECTION_KEY, collection.id);
    } catch {
      /* ignore */
    }
  }, [collection]);

  const byId = useMemo(() => new Map(steam.library.map((g) => [g.id, g])), [steam.library]);

  const games = useMemo(
    () => (collection?.gameIds ?? []).map((id) => byId.get(id)).filter((g): g is Game => Boolean(g)),
    [collection, byId],
  );
  const missing = (collection?.gameIds.length ?? 0) - games.length;
  const hltb = useHltb(games);

  const rows = useMemo(() => {
    const rows = games.map((game) => ({
      game,
      progress: backlogProgress(game, goal, hltb.times[game.id]),
      hltbUrl: hltb.times[game.id]?.url,
    }));
    rows.sort((a, b) => comparators[sort](a.progress, b.progress));
    return rows;
  }, [games, goal, hltb.times, sort]);

  const summary = useMemo(() => {
    const known = rows.filter((r) => r.progress.hoursLeft != null);
    return {
      total: rows.length,
      untouched: rows.filter((r) => r.progress.untouched).length,
      almostDone: rows.filter((r) => (r.progress.percent ?? 0) >= 75 && !r.progress.done).length,
      done: rows.filter((r) => r.progress.done).length,
      hoursLeft: known.reduce((sum, r) => sum + (r.progress.hoursLeft ?? 0), 0),
      estimated: known.length,
    };
  }, [rows]);

  return (
    <div className="min-h-screen">
      <AppNav />

      <div className="container mx-auto space-y-5 px-4 py-6">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Backlog cleanup</h1>
            <p className="text-sm text-muted-foreground">
              How far through each game you are, and roughly how long is left.
            </p>
          </div>

          {collections.length > 0 && (
            <Select value={collection?.id ?? ""} onValueChange={setCollectionId}>
              <SelectTrigger className="w-48" aria-label="Collection">
                <SelectValue placeholder="Pick a collection" />
              </SelectTrigger>
              <SelectContent>
                {collections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.gameIds.length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {isDesktop() && (
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Download className="mr-1.5 h-4 w-4" />
              Import from Steam
            </Button>
          )}
        </header>

        {!steam.connected ? (
          <Empty
            title="Sign in with Steam first"
            body="Progress and time left come from your Steam achievements and playtime."
          />
        ) : !collection ? (
          <Empty
            title="No backlog yet"
            body={
              isDesktop()
                ? "Import your Backlog collection from the Steam client, or make a collection on the Library page."
                : "Make a collection on the Library page. Importing Steam collections needs the desktop app."
            }
            action={
              isDesktop() && (
                <Button size="sm" onClick={() => setImportOpen(true)}>
                  <Download className="mr-1.5 h-4 w-4" />
                  Import from Steam
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile icon={ListTodo} label="In backlog" value={summary.total} />
              <Tile icon={Sparkles} label="Never started" value={summary.untouched} />
              <Tile icon={CheckCircle2} label="75%+ done" value={summary.almostDone} />
              <Tile
                icon={Hourglass}
                label={`Hours left (${summary.estimated} estimated)`}
                value={summary.estimated ? `~${formatHours(summary.hoursLeft)}` : "—"}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border p-0.5" aria-label="Goal">
                {GOALS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => chooseGoal(key)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      goal === key
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {SORTS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      sort === key
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {steam.statsLoading && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading achievement counts…
                </span>
              )}
              {hltb.pending > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Looking up HowLongToBeat ({hltb.pending}{" "}
                  left)…
                </span>
              )}
              {missing > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {missing} game{missing === 1 ? "" : "s"} in this collection aren't in your
                  Steam library
                </span>
              )}
            </div>

            {rows.length === 0 ? (
              <Empty title="This collection is empty" body="Add games to it from the Library." />
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {rows.map(({ game, progress, hltbUrl }) => (
                  <BacklogRow
                    key={game.id}
                    game={game}
                    progress={progress}
                    hltbUrl={hltbUrl}
                    onOpen={() => setSelected(game)}
                    onRemove={() => toggleGame(collection.id, game.id)}
                  />
                ))}
              </ul>
            )}

            <p className="text-xs text-muted-foreground">
              Time left is HowLongToBeat's average (main story for “Beat it”, completionist for
              “100% it”) minus your playtime, refreshed the first time Dsync starts each day. Hours you've saved in a game's details panel take
              priority. With no HLTB match, “100% it” falls back to your pace: hours per achievement
              × achievements left. Removing a game here only changes Dsync, not Steam.
            </p>
          </>
        )}
      </div>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        steamId={steam.profile?.steamId}
        onImported={setCollectionId}
      />

      <GameDetailDrawer game={selected} open={selected !== null} onClose={() => setSelected(null)} />
    </div>
  );
};

const BacklogRow = ({
  game,
  progress,
  hltbUrl,
  onOpen,
  onRemove,
}: {
  game: Game;
  progress: BacklogProgress;
  hltbUrl?: string;
  onOpen: () => void;
  onRemove: () => void;
}) => (
  <li className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-1 items-center gap-3 text-left"
      aria-label={`Open ${game.title}`}
    >
      <SteamImage appid={game.id} className="h-11 w-24 shrink-0 rounded-md object-cover" />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{game.title}</span>
          {progress.untouched && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Not started
            </span>
          )}
          {progress.done && (
            <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
              100%
            </span>
          )}
        </div>

        {progress.percent != null ? (
          <div className="flex items-center gap-2">
            <ProgressBar
              value={progress.percent}
              className="h-1.5 max-w-xs flex-1"
              label={`${game.title} completion`}
            />
            <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
              {Math.round(progress.percent)}% · {progress.earned}/{progress.total}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No achievements to track</p>
        )}
      </div>
    </button>

    <div className="hidden w-20 shrink-0 text-right sm:block">
      <p className="text-sm tabular-nums text-foreground">{formatHours(progress.playtimeHours)}</p>
      <p className="text-[10px] text-muted-foreground">played</p>
    </div>

    <div className="w-24 shrink-0 text-right">
      {progress.done ? (
        <p className="text-sm text-primary">Done</p>
      ) : progress.hoursLeft != null ? (
        <>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            ~{formatHours(progress.hoursLeft)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            left ·{" "}
            {progress.source === "hltb" && hltbUrl ? (
              <a
                href={hltbUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-primary hover:underline"
                title="View this match on HowLongToBeat"
              >
                HLTB
              </a>
            ) : progress.source === "hltb" ? (
              "HLTB"
            ) : (
              "your pace"
            )}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No estimate</p>
      )}
    </div>

    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
      onClick={onRemove}
      aria-label={`Remove ${game.title} from this collection`}
      title="Remove from this collection"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  </li>
);

const ImportDialog = ({
  open,
  onOpenChange,
  steamId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steamId?: string;
  onImported: (collectionId: string) => void;
}) => {
  const { collections, importFromSteam } = useCollections();
  const { library } = useSteam();
  const [steamCollections, setSteamCollections] = useState<SteamCollection[] | null>(null);
  const [libraryTags, setLibraryTags] = useState<LibraryTags | null>(null);
  const [tagsFailed, setTagsFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSteamCollections(null);
    getSteamCollections(steamId)
      .then((list) => !cancelled && setSteamCollections(list))
      .catch(() => !cancelled && setSteamCollections([]));
    return () => {
      cancelled = true;
    };
  }, [open, steamId]);

  // Tags are only needed for dynamic collections, and take a few seconds.
  const hasDynamic = steamCollections?.some((c) => c.dynamic) ?? false;
  useEffect(() => {
    if (!open || !hasDynamic || !steamId || libraryTags) return;
    let cancelled = false;
    setTagsFailed(false);
    fetchSteamLibraryTags(steamId)
      .then((tags) => !cancelled && setLibraryTags(tags))
      .catch(() => !cancelled && setTagsFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, hasDynamic, steamId, libraryTags]);

  const titles = useMemo(() => new Map(library.map((g) => [g.id, g.title])), [library]);

  // Hidden is Steam's own bin for games the user doesn't want to see.
  const hiddenIds = useMemo(
    () => new Set(steamCollections?.find((c) => c.id === "hidden")?.appids ?? []),
    [steamCollections],
  );

  // Every collection's games; dynamic ones stay null until the tags arrive.
  const rows = useMemo(() => {
    const owned = library.map((g) => g.id);
    return (steamCollections ?? [])
      .filter((c) => c.id !== "hidden")
      .map((c) => ({
        collection: c,
        games: !c.dynamic
          ? c.appids
          : libraryTags
            ? resolveDynamicCollection(c, owned, libraryTags, hiddenIds)
            : null,
      }));
  }, [steamCollections, library, libraryTags, hiddenIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a Steam collection</DialogTitle>
          <DialogDescription>
            Read from the Steam client on this PC. Importing again later refreshes the copy.
          </DialogDescription>
        </DialogHeader>

        {steamCollections === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No collections found. Make sure Steam is installed and you've signed in to it on this
            PC.
          </p>
        ) : (
          <ul className="max-h-[26rem] space-y-1 overflow-y-auto">
            {rows.map(({ collection: c, games }) => {
              const imported = collections.some((x) => x.steamCollectionId === c.id);
              const canExpand = Boolean(games && games.length > 0);
              const isOpen = expanded === c.id && canExpand;
              return (
                <li key={c.id} className="rounded-md hover:bg-muted/40">
                  <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      onClick={() => setExpanded(isOpen ? null : c.id)}
                      aria-expanded={isOpen}
                      disabled={!canExpand}
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-90",
                          !canExpand && "opacity-0",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {c.name}
                          {c.dynamic && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                              dynamic
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.dynamic && `${describeRule(c, libraryTags)} · `}
                          {games
                            ? `${games.length} game${games.length === 1 ? "" : "s"}`
                            : tagsFailed
                              ? "couldn't load store tags"
                              : "working out games…"}
                        </p>
                      </div>
                    </button>
                    <Button
                      size="sm"
                      variant={imported ? "outline" : "default"}
                      disabled={!games}
                      onClick={() => {
                        onImported(importFromSteam({ id: c.id, name: c.name, appids: games ?? [] }));
                        onOpenChange(false);
                      }}
                    >
                      {imported ? "Re-sync" : "Import"}
                    </Button>
                  </div>

                  {isOpen && games && (
                    <ul className="mb-2 ml-8 mr-2 gap-4 text-xs text-muted-foreground sm:columns-2">
                      {games
                        .map((id) => ({ id, title: titles.get(id) ?? `App ${id}` }))
                        .sort((a, b) => a.title.localeCompare(b.title))
                        .map(({ id, title }) => (
                          <li key={id} className="truncate py-0.5">
                            {title}
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {hasDynamic && (
          <p className="text-xs text-muted-foreground">
            Dynamic collections are worked out from Steam store tags, so they can be a game or two
            off from the Steam client. Importing one saves today's matches; Re-sync updates them.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Tile = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
}) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </div>
    <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
  </div>
);

const Empty = ({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) => (
  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-14 text-center">
    <ListTodo className="h-8 w-8 text-muted-foreground" />
    <h2 className="text-base font-semibold text-foreground">{title}</h2>
    <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    {action}
  </div>
);

export default Backlog;
