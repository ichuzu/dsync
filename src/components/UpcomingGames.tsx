import { useMemo, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { GameTile } from "@/components/GameTile";
import type { UpcomingGame } from "@/lib/steam";

const INITIAL = 12;
const DAY = 86_400_000;

const storeUrl = (appid: number) => `https://store.steampowered.com/app/${appid}`;

/**
 * Short release badge. Only show a day countdown when Steam gave a day-level
 * date (`precise`); otherwise show its own text ("July 2026", "Q1 2026", …)
 * rather than inventing a misleadingly precise countdown.
 */
const releaseBadge = (g: UpcomingGame): string => {
  if (g.precise && g.releaseDate) {
    const ms = g.releaseDate * 1000 - Date.now();
    if (ms <= 0) return "soon";
    const days = Math.ceil(ms / DAY);
    if (days <= 1) return "1d";
    if (days <= 90) return `${days}d`;
    return new Date(g.releaseDate * 1000).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  }
  const text = g.releaseString.trim();
  if (!text || /^to be announced$/i.test(text)) return "TBA";
  return text;
};

export const UpcomingGames = ({
  games,
  loading = false,
  emptyMessage,
}: {
  games: UpcomingGame[];
  loading?: boolean;
  emptyMessage: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  // Soonest releases first; undated (TBA) pushed to the bottom.
  const ordered = useMemo(
    () => [...games].sort((a, b) => (a.releaseDate || Infinity) - (b.releaseDate || Infinity)),
    [games],
  );
  const shown = expanded ? ordered : ordered.slice(0, INITIAL);

  return (
    <Card className="bg-gradient-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Upcoming on your wishlist</h3>
        {loading && games.length > 0 && (
          <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {loading && games.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {shown.map((g) => (
              <GameTile
                key={g.appid}
                appid={g.appid}
                title={g.name}
                badge={releaseBadge(g)}
                href={storeUrl(g.appid)}
              />
            ))}
          </div>

          {games.length > INITIAL && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-4 text-sm font-medium text-primary hover:underline"
            >
              {expanded ? "Show less" : `Show ${games.length - INITIAL} more`}
            </button>
          )}
        </>
      )}
    </Card>
  );
};
