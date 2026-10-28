/**
 * Written help for an achievement, pulled from the game's Steam Community
 * guides, so the player can read what to do instead of watching a video.
 *
 * The Web API (IPublishedFileService/QueryFiles) finds a game's guides but
 * only returns their summaries; the guide text lives on the public guide
 * page. Achievement guides list one entry per achievement, so the entry for
 * a given achievement is the text from its name up to the next achievement's
 * name. Server-side only: neither steamcommunity.com nor the Web API sends
 * CORS headers.
 */

const STEAM_API = "https://api.steampowered.com";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Dsync/0.1" };

export interface GuideTip {
  guideTitle: string;
  guideUrl: string;
  votesUp: number;
  /** The guide's entry for the achievement, as plain text. */
  text: string;
  /** False when the entry only restates Steam's own description. */
  adds: boolean;
}

export interface AchievementName {
  name: string;
  description: string;
}

interface GuideDoc {
  title: string;
  url: string;
  votesUp: number;
  text: string;
}

/** Case, quote style and spacing ignored: "Grind ’n’ Bear It" == "grind 'n' bear it". */
const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/''/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/** A guide page's body as plain text, one paragraph or list item per line. */
function guideText(html: string): string {
  const start = html.indexOf('class="guide subSections"');
  // The body ends where the comments (or the author block) begin.
  const ends = [html.indexOf("commentthread_area", start), html.indexOf('id="profileBlock"', start)].filter((i) => i > start);
  const end = ends.length ? Math.min(...ends) : -1;
  const body = start >= 0 ? html.slice(start, end > start ? end : undefined) : html;
  return decode(
    body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<(br|\/div|\/li|\/p|\/h\d|\/tr)\b[^>]*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function findGuides(appid: number, apiKey: string, fetchImpl: typeof fetch): Promise<GuideDoc[]> {
  const params = new URLSearchParams({
    key: apiKey,
    query_type: "0", // ranked by votes
    appid: String(appid),
    filetype: "10", // all guides
    search_text: "achievement",
    numperpage: "10",
    return_details: "true",
    return_vote_data: "true",
  });
  const res = await fetchImpl(`${STEAM_API}/IPublishedFileService/QueryFiles/v1/?${params}`);
  if (!res.ok) return [];
  const files: Array<{ publishedfileid: string; title: string; language?: number; vote_data?: { votes_up?: number } }> =
    (await res.json())?.response?.publishedfiledetails ?? [];

  // Whole-game achievement guides in English (Steam language 0; the query's
  // own language parameter doesn't filter), best rated first; a few at most.
  const picked = files
    .filter((f) => (f.language ?? 0) === 0 && /achievement|100\s?%|completion/i.test(f.title))
    .sort((a, b) => (b.vote_data?.votes_up ?? 0) - (a.vote_data?.votes_up ?? 0))
    .slice(0, 4);

  const docs = await Promise.all(
    picked.map(async (f) => {
      const url = `https://steamcommunity.com/sharedfiles/filedetails/?id=${f.publishedfileid}`;
      try {
        const page = await fetchImpl(`${url}&l=english`, { headers: UA });
        if (!page.ok) return null;
        return { title: f.title, url, votesUp: f.vote_data?.votes_up ?? 0, text: guideText(await page.text()) };
      } catch {
        return null;
      }
    }),
  );
  return docs.filter((d): d is GuideDoc => Boolean(d));
}

/** A pattern for an achievement name that tolerates quote style and spacing. */
function namePattern(name: string): RegExp {
  const body = name
    .trim()
    .split("")
    .map((ch) =>
      /['‘’`´]/.test(ch)
        ? "['‘’`´]"
        : /["“”]/.test(ch)
          ? `(?:["“”]|'')`
          : /\s/.test(ch)
            ? "\\s+"
            : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return new RegExp(body, "i");
}

/**
 * The guide's entry for `target`: the rest of the line its name is on plus
 * the following lines, up to the next line that starts with another
 * achievement's name. Tables of contents mention every name too, so of all
 * the places the name appears, the one with the longest entry wins.
 */
function entryFor(text: string, target: AchievementName, others: string[]): string | null {
  const lines = text.split("\n");
  const norm = lines.map(normalise);
  const name = normalise(target.name);
  if (name.length < 3) return null;
  const pattern = namePattern(target.name);
  const otherNames = others.map(normalise).filter((n) => n.length >= 3 && n !== name);
  const startsAnother = (line: string) => otherNames.some((n) => line.replace(/^[•\-\d.)\s]+/, "").startsWith(n));

  let best = "";
  norm.forEach((line, i) => {
    if (!line.includes(name)) return;
    const match = lines[i].match(pattern);
    const rest = match ? lines[i].slice((match.index ?? 0) + match[0].length) : "";
    const parts = [rest];
    let length = rest.length;
    for (let j = i + 1; j < lines.length && length < 1500; j++) {
      if (startsAnother(norm[j]) || norm[j].includes(name)) break;
      parts.push(lines[j]);
      length += lines[j].length;
    }
    const entry = parts.join("\n").replace(/^[\s:—–-]+/, "").trim();
    if (entry.length > best.length) best = entry;
  });
  return best.replace(/[^a-z0-9]/gi, "").length >= 12 ? best : null;
}

const restates = (entry: string, description: string) => {
  const a = normalise(entry).replace(/[^a-z0-9 ]/g, "");
  const b = normalise(description).replace(/[^a-z0-9 ]/g, "");
  return a.length <= b.length + 25 && (a.includes(b) || b.includes(a));
};

/** Guide entries for one achievement, the most helpful first (at most two). */
export async function fetchAchievementTips(
  appid: number,
  target: AchievementName,
  allNames: string[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  guides?: GuideDoc[],
): Promise<GuideTip[]> {
  const docs = guides ?? (await findGuides(appid, apiKey, fetchImpl));
  const tips: GuideTip[] = [];
  for (const doc of docs) {
    const text = entryFor(doc.text, target, allNames);
    if (!text) continue;
    tips.push({
      guideTitle: doc.title,
      guideUrl: doc.url,
      votesUp: doc.votesUp,
      text: text.length > 1200 ? `${text.slice(0, 1200).trimEnd()}…` : text,
      adds: !restates(text, target.description),
    });
  }
  return tips.sort((a, b) => Number(b.adds) - Number(a.adds) || b.votesUp - a.votesUp).slice(0, 2);
}

/** Every achievement's name and description (no key needed), for entry boundaries. */
export async function fetchAchievementNames(appid: number, fetchImpl: typeof fetch = fetch): Promise<AchievementName[]> {
  try {
    const res = await fetchImpl(`${STEAM_API}/IPlayerService/GetGameAchievements/v1/?appid=${appid}&language=english`);
    if (!res.ok) return [];
    const list: Array<{ localized_name?: string; localized_desc?: string }> = (await res.json())?.response?.achievements ?? [];
    return list.filter((a) => a.localized_name).map((a) => ({ name: a.localized_name!, description: a.localized_desc ?? "" }));
  } catch {
    return [];
  }
}

export { findGuides, normalise };
export type { GuideDoc };
