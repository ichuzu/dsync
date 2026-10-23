/**
 * Finds a game's community wiki, for the in-app wiki reader.
 *
 * Candidates come from two places:
 *   - Wikidata: the game's item (matched by Steam app id, P1733) often names
 *     its official Fandom wiki (P4073).
 *   - Address guesses on wiki.gg and Fandom from the title: "eldenring",
 *     "clair-obscur", and the series stem ("darksouls" for Dark Souls III).
 *
 * Each candidate is checked against the MediaWiki API; the biggest real wiki
 * wins, with wiki.gg favoured on near-ties (no ads, and many communities
 * moved there from Fandom). Server-side only: probing hosts that don't exist
 * from the renderer would spray CORS errors.
 */

export interface FoundWiki {
  id: string;
  name: string;
  /** api.php endpoint. */
  api: string;
  /** Article URL prefix, e.g. "https://eldenring.wiki.gg/wiki/". */
  pageBase: string;
  /** Title of the wiki's main page, used as the reader's home. */
  mainPage: string;
  articles: number;
  license: string;
  licenseUrl: string;
}

const UA = { "User-Agent": "Dsync/0.1 (desktop game library; wiki reader)" };
/** Below this a "wiki" is usually an abandoned stub. */
const MIN_ARTICLES = 100;

const slug = (s: string, sep: string) =>
  s
    .toLowerCase()
    .replace(/[™®©']/g, "")
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`^\\${sep}|\\${sep}$`, "g"), "");

/**
 * "DARK SOULS™ III: The Fire Fades" -> darksoulsiii, darksouls, dark-souls-iii, …
 * Titles of three or more words also try their initials ("Grand Theft Auto V"
 * -> "gta"), which is how several big series name their wikis.
 */
export function guessSlugs(title: string): string[] {
  const clean = title.replace(/[™®©]/g, "");
  const beforeColon = clean.split(/[:\-–]/)[0];
  // Drop a trailing sequel marker: numbers and roman numerals.
  const series = beforeColon.replace(/\s+(\d+|[ivx]+)\s*$/i, "");
  const out = new Set<string>();
  for (const base of [clean, beforeColon, series]) {
    out.add(slug(base, ""));
    out.add(slug(base, "-"));
  }
  const words = series.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (words.length >= 3) out.add(words.map((w) => w[0]).join(""));
  return [...out].filter((s) => s.length >= 3);
}

async function wikidataFandomIds(appid: string, fetchImpl: typeof fetch): Promise<string[]> {
  if (!/^\d+$/.test(appid)) return [];
  const query = `SELECT ?fandom WHERE { ?item wdt:P1733 "${appid}". ?item wdt:P4073 ?fandom. }`;
  try {
    const res = await fetchImpl(
      `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
      { headers: UA, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    // Language editions look like "de.eldenring"; the reader wants English.
    return (data?.results?.bindings ?? [])
      .map((b: { fandom?: { value?: string } }) => b.fandom?.value ?? "")
      .filter((id: string) => id && !id.includes("."));
  } catch {
    return [];
  }
}

/** Checks one api.php; null if it isn't a reachable MediaWiki. */
export async function probeWiki(api: string, fetchImpl: typeof fetch = fetch): Promise<FoundWiki | null> {
  try {
    const res = await fetchImpl(
      `${api}?action=query&meta=siteinfo&siprop=general|statistics|rightsinfo&format=json`,
      { headers: UA, redirect: "manual", signal: AbortSignal.timeout(6000) },
    );
    if (res.status !== 200) return null;
    const data = await res.json();
    const general = data?.query?.general;
    if (!general?.server || !general?.articlepath) return null;
    const server = String(general.server).replace(/^\/\//, "https://");
    const host = new URL(server).hostname;
    return {
      id: host,
      name: general.sitename ?? host,
      api,
      pageBase: server + String(general.articlepath).replace("$1", ""),
      mainPage: general.mainpage ?? "Main Page",
      articles: data?.query?.statistics?.articles ?? 0,
      license: data?.query?.rightsinfo?.text || "See the wiki's licence",
      licenseUrl: data?.query?.rightsinfo?.url || `${server}/`,
    };
  } catch {
    return null;
  }
}

export async function findWiki(
  appid: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FoundWiki | null> {
  const fandomIds = await wikidataFandomIds(appid, fetchImpl);
  const apis = new Set<string>();
  for (const id of fandomIds) apis.add(`https://${id}.fandom.com/api.php`);
  for (const s of guessSlugs(title)) {
    apis.add(`https://${s}.wiki.gg/api.php`);
    apis.add(`https://${s}.fandom.com/api.php`);
  }

  // wiki.gg rate-limits bursts, so probe a few at a time.
  const queue = [...apis];
  const found: FoundWiki[] = [];
  await Promise.all(
    [0, 1, 2].map(async () => {
      while (queue.length) {
        const wiki = await probeWiki(queue.shift()!, fetchImpl);
        if (wiki && wiki.articles >= MIN_ARTICLES && !found.some((w) => w.id === wiki.id)) found.push(wiki);
      }
    }),
  );

  const score = (w: FoundWiki) => w.articles * (w.id.endsWith(".wiki.gg") ? 1.5 : 1);
  return found.sort((a, b) => score(b) - score(a))[0] ?? null;
}
