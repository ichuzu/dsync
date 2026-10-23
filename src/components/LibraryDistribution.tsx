import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Game, completionPercentage } from "@/types/game";
import { cn } from "@/lib/utils";

interface Bucket {
  label: string;
  test: (g: Game) => boolean;
}

/** Playtime bands, coarse at the bottom and wide at the top. */
const PLAYTIME_BUCKETS: Bucket[] = [
  { label: "Never played", test: (g) => g.playtimeHours === 0 },
  { label: "Under 1h", test: (g) => g.playtimeHours > 0 && g.playtimeHours < 1 },
  { label: "1 - 10h", test: (g) => g.playtimeHours >= 1 && g.playtimeHours < 10 },
  { label: "10 - 50h", test: (g) => g.playtimeHours >= 10 && g.playtimeHours < 50 },
  { label: "50 - 100h", test: (g) => g.playtimeHours >= 50 && g.playtimeHours < 100 },
  { label: "100h+", test: (g) => g.playtimeHours >= 100 },
];

/** Completion bands. Only games that actually have achievements are counted. */
const COMPLETION_BUCKETS: Bucket[] = [
  { label: "0%", test: (g) => completionPercentage(g) === 0 },
  { label: "1 - 24%", test: (g) => completionPercentage(g) > 0 && completionPercentage(g) < 25 },
  { label: "25 - 49%", test: (g) => completionPercentage(g) >= 25 && completionPercentage(g) < 50 },
  { label: "50 - 74%", test: (g) => completionPercentage(g) >= 50 && completionPercentage(g) < 75 },
  { label: "75 - 99%", test: (g) => completionPercentage(g) >= 75 && completionPercentage(g) < 100 },
  { label: "100%", test: (g) => completionPercentage(g) === 100 },
];

const tally = (games: Game[], buckets: Bucket[]) => {
  const counts = buckets.map((b) => ({
    label: b.label,
    count: games.filter(b.test).length,
  }));
  const max = Math.max(...counts.map((c) => c.count), 1);
  const total = counts.reduce((s, c) => s + c.count, 0) || 1;
  return counts.map((c) => ({ ...c, max, share: (c.count / total) * 100 }));
};

/**
 * How the library spreads across playtime and completion bands. The headline
 * cards give totals; this answers the shape question those totals hide, e.g.
 * whether 4,000 hours came from five games or five hundred.
 */
export const LibraryDistribution = ({ games }: { games: Game[] }) => {
  const playtime = useMemo(() => tally(games, PLAYTIME_BUCKETS), [games]);
  const completion = useMemo(
    () => tally(games.filter((g) => g.totalAchievements > 0), COMPLETION_BUCKETS),
    [games],
  );
  const withAchievements = games.filter((g) => g.totalAchievements > 0).length;

  return (
    <div className="rounded-xl border border-border bg-gradient-card p-6">
      <div className="mb-5 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Library distribution</h3>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Histogram
          title="By playtime"
          caption={`${games.length.toLocaleString()} games`}
          rows={playtime}
        />
        <Histogram
          title="By completion"
          caption={`${withAchievements.toLocaleString()} games with achievements`}
          rows={completion}
          accent
        />
      </div>
    </div>
  );
};

const Histogram = ({
  title,
  caption,
  rows,
  accent,
}: {
  title: string;
  caption: string;
  rows: Array<{ label: string; count: number; max: number; share: number }>;
  accent?: boolean;
}) => (
  <div>
    <div className="mb-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-xs text-muted-foreground">{r.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
            <div
              className={cn("h-full rounded-sm", accent ? "bg-accent/70" : "bg-primary/70")}
              style={{ width: `${(r.count / r.max) * 100}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-foreground">
            {r.count.toLocaleString()}
          </span>
          <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
            {r.share.toFixed(0)}%
          </span>
        </li>
      ))}
    </ul>
  </div>
);
