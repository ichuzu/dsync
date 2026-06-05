import { useMemo, useState } from "react";
import { Check, Loader2, Newspaper, Plus, Search, Settings2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GameNewsCard } from "@/components/GameNewsCard";
import { NewsArticleDialog } from "@/components/NewsArticleDialog";
import { groupNewsByGame } from "@/lib/news";
import { cn } from "@/lib/utils";
import type { NewsItem } from "@/lib/steam";

// Number of game cards to show before the "show more" toggle.
const INITIAL = 9;

interface Candidate {
  id: string;
  title: string;
}

export const GameNewsFeed = ({
  title = "News from your games",
  news,
  followed,
  candidates,
  onToggleFollow,
  manageable,
  loading = false,
  emptyMessage,
}: {
  title?: string;
  news: NewsItem[];
  /** appids the user follows (effective set). */
  followed: Set<string>;
  /** Library games the user can choose to follow. */
  candidates: Candidate[];
  onToggleFollow: (id: string) => void;
  /** Whether subscription management is available (i.e. a real Steam library). */
  manageable: boolean;
  loading?: boolean;
  emptyMessage: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [managing, setManaging] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<NewsItem | null>(null);

  // When subscriptions are available, only show news from followed games.
  const feed = useMemo(
    () => (manageable ? news.filter((n) => followed.has(String(n.appid))) : news),
    [news, followed, manageable],
  );
  // Collapse to one card per game so multiple updates don't clutter the feed.
  const groups = useMemo(() => groupNewsByGame(feed), [feed]);
  const shown = expanded ? groups : groups.slice(0, INITIAL);

  const filteredCandidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term
      ? candidates.filter((c) => c.title.toLowerCase().includes(term))
      : candidates;
    // Followed games float to the top so they're easy to manage.
    return [...list].sort((a, b) => {
      const fa = followed.has(a.id) ? 0 : 1;
      const fb = followed.has(b.id) ? 0 : 1;
      return fa - fb || a.title.localeCompare(b.title);
    });
  }, [candidates, query, followed]);

  return (
    <Card className="bg-gradient-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Newspaper className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">{title}</h3>
        {loading && feed.length > 0 && (
          <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        {manageable && (
          <button
            type="button"
            onClick={() => setManaging((v) => !v)}
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              managing
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Following {followed.size}
          </button>
        )}
      </div>

      {/* Manage subscriptions */}
      {manageable && managing && (
        <div className="mb-4 rounded-lg border border-border bg-background/40 p-3">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Find a game to follow…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <ul className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {filteredCandidates.map((c) => {
              const isFollowing = followed.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onToggleFollow(c.id)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isFollowing
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-transparent",
                      )}
                    >
                      {isFollowing ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{c.title}</span>
                  </button>
                </li>
              );
            })}
            {filteredCandidates.length === 0 && (
              <li className="px-2 py-2 text-sm text-muted-foreground">No games match "{query}".</li>
            )}
          </ul>
        </div>
      )}

      {loading && feed.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-[16/9] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : feed.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {manageable && followed.size === 0
            ? "You're not following any games yet — pick some with “Following” above."
            : manageable
              ? "No recent English-language news from the games you follow."
              : emptyMessage}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((group) => (
              <GameNewsCard
                key={group.appid}
                group={group}
                onOpenItem={setSelected}
              />
            ))}
          </div>

          {groups.length > INITIAL && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-4 text-sm font-medium text-primary hover:underline"
            >
              {expanded ? "Show less" : `Show ${groups.length - INITIAL} more`}
            </button>
          )}
        </>
      )}

      <NewsArticleDialog
        item={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </Card>
  );
};
