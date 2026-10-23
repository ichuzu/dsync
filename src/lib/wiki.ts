import { WARFRAME_WIKI, type WikiSource } from "./gameGuides";
export const wikiUrl = (title: string, source = WARFRAME_WIKI) => `${source.pageBase}${encodeURIComponent(title.replace(/ /g, "_"))}`;
export const wikiSearchUrl = (query: string, source = WARFRAME_WIKI) => `${source.pageBase}Special:Search?search=${encodeURIComponent(query)}`;

async function request(params: Record<string, string>, signal?: AbortSignal, source: WikiSource = WARFRAME_WIKI) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${source.api}?${new URLSearchParams({ action: "query", format: "json", origin: "*", ...params })}`, { signal: controller.signal });
    if (!response.ok) throw new Error("The wiki is unavailable right now.");
    const data = await response.json();
    if (data.error) throw new Error("The wiki couldn't complete this request.");
    return data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export interface WikiResult { title: string; pageid: number; extract?: string; thumbnail?: { source: string } }
export interface WikiArticle { title: string; extract: string; thumbnail?: { source: string }; touched?: string; missing?: string }

export async function searchWiki(term: string, signal?: AbortSignal, source = WARFRAME_WIKI): Promise<WikiResult[]> {
  const results: WikiResult[] = term
    ? (await request({ list: "search", srsearch: term.slice(0, 200), srnamespace: "0", srlimit: "12", srprop: "" }, signal, source)).query?.search ?? []
    : [];
  if (term && !results.length) return [];
  const data = await request({
    ...(term ? { pageids: results.map(result => result.pageid).join("|") } : { titles: source.starters.join("|") }),
    prop: "pageimages|extracts", piprop: "thumbnail", pithumbsize: "160", explaintext: "1", exintro: "1", exchars: "220", exlimit: "20",
  }, signal, source);
  const pages = Object.values(data.query?.pages ?? {}) as WikiResult[];
  if (!term) return pages.filter(page => page.pageid > 0);
  const byId = new Map(pages.map(page => [page.pageid, page]));
  return results.map(result => ({ ...result, ...byId.get(result.pageid) }));
}

export async function readWiki(title: string, signal?: AbortSignal, source = WARFRAME_WIKI): Promise<WikiArticle> {
  const data = await request({ titles: title, redirects: "1", prop: "extracts|pageimages|info", explaintext: "1", piprop: "thumbnail", pithumbsize: "500" }, signal, source);
  const page = Object.values(data.query?.pages ?? {})[0] as WikiArticle | undefined;
  if (!page || page.missing !== undefined) throw new Error("This article couldn't be found.");
  return page;
}

export function articleSections(extract: string) {
  const sections: { title: string; text: string }[] = [];
  let current = { title: "Overview", text: "" };
  for (const line of extract.split("\n")) {
    const heading = line.match(/^={2,}\s*(.*?)\s*={2,}$/);
    if (heading) {
      if (current.text.trim()) sections.push({ ...current, text: current.text.trim() });
      current = { title: heading[1], text: "" };
    } else current.text += `${line}\n`;
  }
  if (current.text.trim()) sections.push({ ...current, text: current.text.trim() });
  return sections;
}
