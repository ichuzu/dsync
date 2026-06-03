import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  Clock,
  CalendarClock,
  Gauge,
  Loader2,
  Trophy,
  Library,
  Award,
  Sparkles,
  TrendingUp,
  Gamepad2,
  PackageOpen,
  Activity,
  PieChart as PieChartIcon,
} from "lucide-react";
import { mockGames } from "@/data/mockGames";
import {
  Game,
  completionPercentage,
  isCurrentlyPlaying,
  isPerfectGame,
} from "@/types/game";
import { useSteam } from "@/hooks/useSteam";
import { ContributionHeatmap } from "@/components/ContributionHeatmap";
import { GenrePieChart, type GenreSlice } from "@/components/GenrePieChart";
import { cn } from "@/lib/utils";

// Slices past this many genres are folded into a single "Other" wedge.
const MAX_GENRE_SLICES = 8;

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY = 86_400_000;

const Stats = () => {
  const steam = useSteam();
  const usingSteam = steam.connected;
  const games: Game[] = usingSteam ? steam.library : mockGames;
  const accurate = usingSteam ? steam.libraryStats : null;
  const refining = usingSteam && steam.statsLoading && !accurate;

  // Genre breakdown, weighted by playtime. Mock games carry their own genre;
  // real Steam games get it from the background-resolved genres map (by appid).
  const genreOf = (g: Game) => (usingSteam ? steam.genres[g.id] : g.genre);
  const genre = useMemo(() => {
    const byGenre = new Map<string, number>();
    let known = 0;
    for (const g of games) {
      if (g.playtimeHours <= 0) continue;
      const name = genreOf(g);
      if (!name) continue;
      byGenre.set(name, (byGenre.get(name) ?? 0) + g.playtimeHours);
      known += g.playtimeHours;
    }
    const sorted = [...byGenre.entries()]
      .map(([name, hours]): GenreSlice => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours);

    let slices = sorted;
    if (sorted.length > MAX_GENRE_SLICES) {
      const head = sorted.slice(0, MAX_GENRE_SLICES);
      const otherHours = sorted
        .slice(MAX_GENRE_SLICES)
        .reduce((sum, s) => sum + s.hours, 0);
      slices = [...head, { name: "Other", hours: otherHours }];
    }
    return { slices, total: known };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, usingSteam, steam.genres]);
  const genresLoading = usingSteam && steam.genresLoading;

  const totals = useMemo(() => {
    const totalHours = games.reduce((sum, g) => sum + g.playtimeHours, 0);
    const withAch = games.filter((g) => g.totalAchievements > 0);
    const demoAvg =
      withAch.length === 0
        ? 0
        : withAch.reduce((s, g) => s + completionPercentage(g), 0) / withAch.length;
    return {
      totalGames: games.length,
      totalHours,
      backlog: games.filter((g) => g.playtimeHours === 0).length,
      playingNow: games.filter(isCurrentlyPlaying).length,
      unlocked: accurate ? accurate.totalUnlocked : games.reduce((s, g) => s + g.earnedAchievements, 0),
      perfect: accurate ? accurate.perfectGames : games.filter(isPerfectGame).length,
      withAchievements: accurate ? accurate.gamesWithAchievements : withAch.length,
      avgCompletion: accurate ? accurate.avgCompletion : demoAvg,
    };
  }, [games, accurate]);

  const createdAt = usingSteam ? steam.profile?.createdAt : undefined;
  const rate = useMemo(() => {
    if (!createdAt) return null;
    const ageDays = Math.max((Date.now() - Date.parse(createdAt)) / DAY, 1);
    const perDay = totals.totalHours / ageDays;
    return {
      ageYears: ageDays / 365.25,
      perDay,
      perWeek: perDay * 7,
      perMonth: perDay * 30.44,
      perYear: perDay * 365.25,
    };
  }, [createdAt, totals.totalHours]);

  const topGames = useMemo(
    () => [...games].sort((a, b) => b.playtimeHours - a.playtimeHours).slice(0, 15),
    [games],
  );
  const maxHours = topGames[0]?.playtimeHours || 1;

  const started = useMemo(() => {
    const list = games
      .map((g) => ({
        game: g,
        date: usingSteam ? steam.libraryStats?.started?.[g.id] : g.lastPlayed,
      }))
      .filter((x): x is { game: Game; date: string } => Boolean(x.date));
    list.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
    return list.slice(0, 30);
  }, [games, usingSteam, steam.libraryStats]);

  const startedLoading = usingSteam && steam.statsLoading && !steam.libraryStats;
  const achHint = refining ? "refining…" : undefined;

  // ---- Achievement activity heatmap ----
  const activity = useMemo(
    () => (usingSteam ? steam.libraryStats?.activity ?? [] : []),
    [usingSteam, steam.libraryStats],
  );
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of games) m.set(g.id, g.title);
    return m;
  }, [games]);
  const activityByDay = useMemo(() => {
    const r: Record<string, number> = {};
    for (const a of activity) r[a.d] = (r[a.d] ?? 0) + a.n;
    return r;
  }, [activity]);
  const years = useMemo(() => {
    const s = new Set<number>();
    for (const a of activity) s.add(Number(a.d.slice(0, 4)));
    return [...s].sort((x, y) => y - x);
  }, [activity]);
  const [yearSel, setYearSel] = useState<number | null>(null);
  const activeYear = yearSel ?? years[0] ?? new Date().getUTCFullYear();
  const [selected, setSelected] = useState<{ kind: "day" | "month"; key: string } | null>(null);

  const monthly = useMemo(() => {
    const arr = new Array(12).fill(0);
    for (const a of activity) {
      if (a.d.slice(0, 4) === String(activeYear)) arr[Number(a.d.slice(5, 7)) - 1] += a.n;
    }
    return arr as number[];
  }, [activity, activeYear]);
  const maxMonth = Math.max(...monthly, 1);
  const yearTotal = monthly.reduce((s, v) => s + v, 0);

  const detailGames = useMemo(() => {
    if (!selected) return [];
    const byGame = new Map<string, number>();
    for (const a of activity) {
      const match = selected.kind === "day" ? a.d === selected.key : a.d.startsWith(selected.key);
      if (match) byGame.set(a.appid, (byGame.get(a.appid) ?? 0) + a.n);
    }
    return [...byGame.entries()]
      .map(([appid, n]) => ({ appid, name: nameById.get(appid) ?? `App ${appid}`, n }))
      .sort((x, y) => y.n - x.n);
  }, [selected, activity, nameById]);
  const detailTotal = detailGames.reduce((s, x) => s + x.n, 0);

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-md">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Library
          </Link>
          <span className="text-lg font-bold tracking-tight text-foreground">Statistics</span>
          {refining && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> computing full library…
            </span>
          )}
        </div>
      </nav>

      <div className="container mx-auto space-y-6 px-4 py-6">
        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={<Library className="h-4 w-4" />} label="Games owned" value={totals.totalGames.toLocaleString()} />
          <Stat icon={<Clock className="h-4 w-4" />} label="Total playtime" value={`${Math.round(totals.totalHours).toLocaleString()}h`} />
          <Stat icon={<Award className="h-4 w-4" />} label="Achievements" value={totals.unlocked.toLocaleString()} hint={achHint} />
          <Stat icon={<Sparkles className="h-4 w-4 text-rarity-legendary" />} label="Perfect games" value={totals.perfect.toLocaleString()} hint={achHint} />
          <Stat icon={<TrendingUp className="h-4 w-4 text-success" />} label="Avg completion" value={`${totals.avgCompletion.toFixed(0)}%`} hint={achHint} />
          <Stat icon={<Trophy className="h-4 w-4" />} label="Games w/ achievements" value={totals.withAchievements.toLocaleString()} hint={achHint} />
          <Stat icon={<Gamepad2 className="h-4 w-4 text-success" />} label="Recently played" value={totals.playingNow.toLocaleString()} hint="last 2 weeks" />
          <Stat icon={<PackageOpen className="h-4 w-4" />} label="Backlog (never played)" value={totals.backlog.toLocaleString()} />
        </div>

        {/* Playtime rate */}
        <Card className="bg-gradient-card p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Average playtime</h3>
              <p className="text-sm text-muted-foreground">
                {Math.round(totals.totalHours).toLocaleString()}h total
                {rate ? ` · account ~${rate.ageYears.toFixed(1)} yrs old` : ""}
              </p>
            </div>
          </div>

          {rate ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <RateTile label="Per day" value={rate.perDay} />
              <RateTile label="Per week" value={rate.perWeek} />
              <RateTile label="Per month" value={rate.perMonth} />
              <RateTile label="Per year" value={rate.perYear} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sign in with Steam (public profile) to see your average playtime per day,
              week, month, and year.
            </p>
          )}
          {rate && (
            <p className="mt-3 text-xs text-muted-foreground">
              Lifetime average — total hours spread evenly across your account age.
            </p>
          )}
        </Card>

        {/* Achievement activity heatmap */}
        <Card className="bg-gradient-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Achievement activity</h3>
            </div>
            {years.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setYearSel(y);
                      setSelected(null);
                    }}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs transition-colors",
                      y === activeYear
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>

          {startedLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Building your activity map…
            </div>
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {usingSteam
                ? "No achievement history yet."
                : "Sign in with Steam to see your achievement activity."}
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                {yearTotal.toLocaleString()} achievements unlocked in {activeYear}
              </p>
              <ContributionHeatmap
                activityByDay={activityByDay}
                year={activeYear}
                selectedDay={selected?.kind === "day" ? selected.key : null}
                onSelectDay={(d) => setSelected(d ? { kind: "day", key: d } : null)}
              />

              {/* Month bars (click to inspect a month) */}
              <div className="mt-5 grid grid-cols-12 gap-1">
                {monthly.map((v, i) => {
                  const key = `${activeYear}-${String(i + 1).padStart(2, "0")}`;
                  const active = selected?.kind === "month" && selected.key === key;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelected(active ? null : { kind: "month", key })}
                      className="group flex flex-col items-center gap-1"
                      title={`${MONTH_ABBR[i]} ${activeYear}: ${v} unlocks`}
                    >
                      <div className="flex h-16 w-full items-end">
                        <div
                          className={cn(
                            "w-full rounded-sm transition-colors",
                            active ? "bg-primary" : "bg-primary/40 group-hover:bg-primary/70",
                          )}
                          style={{ height: `${(v / maxMonth) * 100}%`, minHeight: v > 0 ? 3 : 0 }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-[10px]",
                          active ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {MONTH_ABBR[i]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Detail for the selected day / month */}
              {selected && (
                <div className="mt-5 rounded-lg border border-border bg-background/40 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-foreground">
                      {selected.kind === "day"
                        ? selected.key
                        : `${MONTH_ABBR[Number(selected.key.slice(5, 7)) - 1]} ${activeYear}`}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {detailTotal} {detailTotal === 1 ? "unlock" : "unlocks"} · {detailGames.length}{" "}
                        {detailGames.length === 1 ? "game" : "games"}
                      </span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                  {detailGames.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No unlocks in this period.</p>
                  ) : (
                    <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                      {detailGames.map((g) => (
                        <li
                          key={g.appid}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="truncate text-foreground">{g.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {g.n} {g.n === 1 ? "achievement" : "achievements"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </Card>

        {/* Genre breakdown (by playtime) */}
        <Card className="bg-gradient-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <PieChartIcon className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Genres by playtime</h3>
          </div>
          <GenrePieChart
            data={genre.slices}
            total={genre.total}
            loading={genresLoading}
            emptyMessage={
              usingSteam
                ? "No genre data yet — it's resolved in the background from the Steam store. Try refreshing in a moment."
                : "Sign in with Steam to see how your playtime splits across genres."
            }
          />
          {genre.total > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Share of {Math.round(genre.total).toLocaleString()}h played across your
              top genres.
            </p>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Most played */}
          <Card className="bg-gradient-card p-6">
            <h3 className="mb-4 font-semibold text-foreground">Most played</h3>
            <div className="space-y-3">
              {topGames.map((g) => (
                <div key={g.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-foreground">{g.title}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {g.playtimeHours.toLocaleString()}h
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-brand"
                      style={{ width: `${(g.playtimeHours / maxHours) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Started timeline */}
          <Card className="bg-gradient-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">
                {usingSteam ? "Games by start date" : "Recent activity"}
              </h3>
            </div>

            {startedLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning your library for start dates…
              </div>
            ) : started.length === 0 ? (
              <p className="text-sm text-muted-foreground">No start dates available yet.</p>
            ) : (
              <ul className="space-y-2">
                {started.map(({ game, date }) => (
                  <li
                    key={game.id}
                    className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 last:border-0"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Trophy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm text-foreground">{game.title}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      <span className="tabular-nums">{game.playtimeHours}h</span>
                      <span className="tabular-nums">{date}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {usingSteam && (
              <p className="mt-3 text-xs text-muted-foreground">
                "Started" = your earliest achievement unlock for each game.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

const Stat = ({
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

// Locale-independent so a thousands separator can never read as a decimal
// (e.g. avoid "3.672" looking like 3.6). Small values get one decimal.
const formatHours = (value: number): string =>
  value < 10 ? value.toFixed(1) : String(Math.round(value));

const RateTile = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-border bg-background/40 p-3 text-center">
    <div className="text-2xl font-bold tabular-nums text-foreground">
      {formatHours(value)}
      <span className="text-base text-muted-foreground">h</span>
    </div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

export default Stats;
