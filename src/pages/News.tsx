import { useMemo, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { GameNewsFeed } from "@/components/GameNewsFeed";
import { ReleaseCalendar, type CalendarGame } from "@/components/ReleaseCalendar";
import { useForYou } from "@/hooks/useForYou";
import { mockGames } from "@/data/mockGames";
import type { Game } from "@/types/game";
import { useSteam } from "@/hooks/useSteam";
import { useFollowedGames } from "@/hooks/useFollowedGames";
import { cn } from "@/lib/utils";

// How many recently-played games to follow by default (until the user picks).
const DEFAULT_FOLLOW_COUNT = 8;

type Source = "library" | "wishlist";

const SOURCES: Array<{ key: Source; label: string }> = [
  { key: "library", label: "Your games" },
  { key: "wishlist", label: "Wishlist" },
];

const News = () => {
  const steam = useSteam();
  const usingSteam = steam.connected;
  const games: Game[] = usingSteam ? steam.library : mockGames;

  const [source, setSource] = useState<Source>("library");

  const { followed: customFollowed, setFollowed } = useFollowedGames();

  // Default subscriptions: the games you've played most recently. Once you
  // customize the list it sticks; until then we follow these automatically.
  const recentDefault = useMemo(() => {
    const recent = games
      .filter((g) => (g.recentPlaytimeHours ?? 0) > 0)
      .sort((a, b) => (b.recentPlaytimeHours ?? 0) - (a.recentPlaytimeHours ?? 0));
    const base = recent.length
      ? recent
      : [...games].sort((a, b) => b.playtimeHours - a.playtimeHours);
    return base.slice(0, DEFAULT_FOLLOW_COUNT).map((g) => g.id);
  }, [games]);

  const forYou = useForYou(usingSteam ? steam.profile?.steamId : undefined);
  const calendarGames = useMemo<CalendarGame[]>(() => {
    const wishlist = steam.upcoming.map((g) => ({ ...g, kind: "wishlist" as const }));
    const onWishlist = new Set(wishlist.map((g) => g.appid));
    const picks = forYou.games
      .filter((g) => !onWishlist.has(g.appid))
      .map((g) => ({ ...g, kind: "foryou" as const }));
    return [...wishlist, ...picks];
  }, [steam.upcoming, forYou.games]);

  const effectiveFollowed = customFollowed ?? recentDefault;
  const followedSet = useMemo(() => new Set(effectiveFollowed), [effectiveFollowed]);

  const toggleFollow = (id: string) => {
    const base = customFollowed ?? recentDefault;
    setFollowed(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };

  return (
    <div className="min-h-screen">
      <AppNav />

      <div className="container mx-auto space-y-4 px-4 py-6">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">News &amp; releases</h1>

          {/* Both feeds used to stack as full-height cards; only one is on
              screen at a time now so the page stays a sensible length. */}
          {usingSteam && (
            <div className="ml-auto inline-flex rounded-lg border border-border p-0.5">
              {SOURCES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSource(key)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                    source === key
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </header>

        {source === "library" ? (
          <GameNewsFeed
            news={usingSteam ? steam.news : []}
            followed={followedSet}
            candidates={games.map((g) => ({ id: g.id, title: g.title }))}
            onToggleFollow={toggleFollow}
            manageable={usingSteam}
            loading={usingSteam && steam.newsLoading}
            emptyMessage="Sign in with Steam to follow your games and see the latest news, updates, and patch notes."
          />
        ) : (
          <GameNewsFeed
            title="News from your wishlist"
            news={steam.wishlistNews}
            followed={new Set<string>()}
            candidates={[]}
            onToggleFollow={() => {}}
            manageable={false}
            loading={steam.wishlistNewsLoading}
            emptyMessage="No recent news from your wishlist. (Your Steam wishlist must be public.)"
          />
        )}

        {usingSteam && (
          <ReleaseCalendar
            games={calendarGames}
            loading={steam.upcomingLoading || forYou.loading}
            emptyMessage="No upcoming releases on your wishlist yet. (Your Steam wishlist must be public.)"
          />
        )}
      </div>
    </div>
  );
};

export default News;
