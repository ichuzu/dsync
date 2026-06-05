import { useMemo } from "react";
import { AppNav } from "@/components/AppNav";
import { GameNewsFeed } from "@/components/GameNewsFeed";
import { UpcomingGames } from "@/components/UpcomingGames";
import { mockGames } from "@/data/mockGames";
import type { Game } from "@/types/game";
import { useSteam } from "@/hooks/useSteam";
import { useFollowedGames } from "@/hooks/useFollowedGames";

// How many recently-played games to follow by default (until the user picks).
const DEFAULT_FOLLOW_COUNT = 8;

const News = () => {
  const steam = useSteam();
  const usingSteam = steam.connected;
  const games: Game[] = usingSteam ? steam.library : mockGames;

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

  const effectiveFollowed = customFollowed ?? recentDefault;
  const followedSet = useMemo(() => new Set(effectiveFollowed), [effectiveFollowed]);

  const toggleFollow = (id: string) => {
    const base = customFollowed ?? recentDefault;
    setFollowed(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };

  return (
    <div className="min-h-screen">
      <AppNav />

      <div className="container mx-auto space-y-6 px-4 py-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">News &amp; releases</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The latest updates, patch notes, and upcoming launches for the games you care about.
          </p>
        </header>

        <GameNewsFeed
          news={usingSteam ? steam.news : []}
          followed={followedSet}
          candidates={games.map((g) => ({ id: g.id, title: g.title }))}
          onToggleFollow={toggleFollow}
          manageable={usingSteam}
          loading={usingSteam && steam.newsLoading}
          emptyMessage="Sign in with Steam to follow your games and see the latest news, updates, and patch notes."
        />

        {usingSteam && (
          <>
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
            <UpcomingGames
              games={steam.upcoming}
              loading={steam.upcomingLoading}
              emptyMessage="No upcoming releases on your wishlist. (Your Steam wishlist must be public.)"
            />
          </>
        )}
      </div>
    </div>
  );
};

export default News;
