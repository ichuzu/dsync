import { useCallback, useEffect, useState } from "react";
import { sourceFor, type GuideGame, type WikiSource } from "@/lib/gameGuides";
import type { FoundWiki } from "@/lib/wikiFinder";
import { fetchFindWiki, fetchProbeWiki } from "@/lib/steamClient";

/**
 * Which wiki to show for a game, in order of preference:
 *   1. one the user picked ("Use a different wiki"),
 *   2. a hand-configured source (gameGuides),
 *   3. one found automatically (wikiFinder), remembered per game: a hit
 *      for 30 days, a miss for 7 so a new wiki is noticed eventually.
 */

const DAY = 24 * 60 * 60 * 1000;
const chosenKey = (appid: string) => `dsync.wiki.chosen.${appid}`;
const foundKey = (appid: string) => `dsync.wiki.found.${appid}`;

const toSource = (wiki: FoundWiki): WikiSource => ({
  id: wiki.id,
  name: wiki.name,
  api: wiki.api,
  pageBase: wiki.pageBase,
  mainPage: wiki.mainPage,
  starters: [],
  license: wiki.license,
  licenseUrl: wiki.licenseUrl,
});

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const write = (key: string, value: unknown) => {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* fine for this session */
  }
};

export function useWikiSource(game: GuideGame | null) {
  const [found, setFound] = useState<FoundWiki | null>(null);
  const [chosen, setChosen] = useState<FoundWiki | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setFound(null);
    setChosen(game ? read<FoundWiki>(chosenKey(game.id)) : null);
    if (!game || sourceFor(game)) return;

    const cached = read<{ ts: number; wiki: FoundWiki | null }>(foundKey(game.id));
    if (cached && Date.now() - cached.ts < (cached.wiki ? 30 : 7) * DAY) {
      setFound(cached.wiki);
      return;
    }

    let cancelled = false;
    setSearching(true);
    fetchFindWiki(game.id, game.title)
      .then((wiki) => {
        write(foundKey(game.id), { ts: Date.now(), wiki });
        if (!cancelled) setFound(wiki);
      })
      .catch(() => {
        /* not cached, so the next visit retries */
      })
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [game?.id, game?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Points this game at a wiki address the user typed. Resolves an error message, or null on success. */
  const choose = useCallback(
    async (url: string): Promise<string | null> => {
      if (!game) return "Choose a game first.";
      let wiki: FoundWiki | null;
      try {
        wiki = await fetchProbeWiki(url);
      } catch (err) {
        return err instanceof Error ? err.message : "Couldn't reach that address.";
      }
      if (!wiki) return "That doesn't look like a MediaWiki wiki (Fandom, wiki.gg and most game wikis are).";
      write(chosenKey(game.id), wiki);
      setChosen(wiki);
      return null;
    },
    [game],
  );

  /** Back to the automatic choice. */
  const reset = useCallback(() => {
    if (!game) return;
    write(chosenKey(game.id), undefined);
    setChosen(null);
  }, [game]);

  const curated = game ? sourceFor(game) : undefined;
  const source = chosen ? toSource(chosen) : curated ?? (found ? toSource(found) : undefined);
  return { source, searching, choose, reset, isChosen: Boolean(chosen) };
}
