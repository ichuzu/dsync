import type { NewsItem } from "@/lib/steam";

/** All recent news for a single game, collapsed into one feed entry. */
export interface GameNewsGroup {
  appid: number;
  /** Game title (taken from the newest item). */
  game: string;
  /** Newest item — drives the card's hero, headline, and time. */
  latest: NewsItem;
  /** Every item for this game, newest-first (includes `latest`). */
  items: NewsItem[];
  count: number;
}

/**
 * Collapse a flat news feed into one entry per game so a single game with
 * several updates shows as one card (with its other items tucked behind a
 * "more" affordance) instead of cluttering the feed with duplicates. Groups are
 * ordered by the recency of each game's newest item. The server already caps the
 * item count per game and filters to English announcements.
 */
export function groupNewsByGame(news: NewsItem[]): GameNewsGroup[] {
  const map = new Map<number, NewsItem[]>();
  for (const n of news) {
    const arr = map.get(n.appid) ?? [];
    arr.push(n);
    map.set(n.appid, arr);
  }
  const groups: GameNewsGroup[] = [];
  for (const [appid, items] of map) {
    items.sort((a, b) => b.date - a.date);
    groups.push({ appid, game: items[0].game, latest: items[0], items, count: items.length });
  }
  return groups.sort((a, b) => b.latest.date - a.latest.date);
}
