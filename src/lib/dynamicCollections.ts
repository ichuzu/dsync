import type { LibraryTags } from "@/lib/steam";
import type { SteamCollection } from "@/lib/desktop";

/**
 * Works out which games a Steam dynamic collection holds, the way the Steam
 * client does: owned games whose store tags match the rule, plus any added
 * by hand, minus any removed by hand, never including hidden games.
 *
 * Store tags drift as players vote, and Dsync only sees each game's top 20,
 * so this can be a game or two off from what the Steam client shows.
 */
export function resolveDynamicCollection(
  collection: SteamCollection,
  ownedIds: string[],
  libraryTags: LibraryTags,
  hiddenIds: ReadonlySet<string>,
): string[] {
  const rule = collection.rule;
  const removed = new Set(collection.removed);
  const result = new Set<string>();

  if (rule && rule.tagIds.length > 0) {
    for (const id of ownedIds) {
      const tags = libraryTags.tags[id];
      if (!tags) continue;
      const matches = rule.matchAll
        ? rule.tagIds.every((t) => tags.includes(t))
        : rule.tagIds.some((t) => tags.includes(t));
      if (matches) result.add(id);
    }
  }
  for (const id of collection.appids) result.add(id);

  return [...result].filter((id) => !removed.has(id) && !hiddenIds.has(id));
}

/** "Roguelite + Roguelike", or "Horror or Psychological Horror". */
export function describeRule(collection: SteamCollection, libraryTags: LibraryTags | null): string {
  const rule = collection.rule;
  if (!rule || rule.tagIds.length === 0) return "No tag filter, only games added by hand";
  const names = rule.tagIds.map((t) => libraryTags?.names[String(t)] ?? `tag ${t}`);
  return `Tagged ${names.join(rule.matchAll ? " + " : " or ")}${rule.partial ? " (plus other filters)" : ""}`;
}
