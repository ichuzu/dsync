export interface GuideGame { id: string; title: string; coverImage?: string }
export interface WikiSource {
  id: string;
  name: string;
  api?: string;
  pageBase: string;
  /** The wiki's main page, used as the reader's home when there are no starters. */
  mainPage?: string;
  starters: string[];
  license: string;
  licenseUrl: string;
}
export const GUIDE_GAMES: GuideGame[] = [
  { id: "230410", title: "Warframe" },
  { id: "1086940", title: "Baldur's Gate 3" },
  { id: "105600", title: "Terraria" },
  { id: "413150", title: "Stardew Valley" },
  { id: "1245620", title: "Elden Ring" },
  { id: "292030", title: "The Witcher 3: Wild Hunt" },
  { id: "1145360", title: "Hades" },
  { id: "990080", title: "Hogwarts Legacy" },
];
export const WARFRAME_WIKI: WikiSource = {
  id: "warframe", name: "Warframe Wiki", api: "https://wiki.warframe.com/api.php", pageBase: "https://wiki.warframe.com/w/", starters: ["Iradite", "Grokdrul", "The Archwing", "Spy"], license: "CC BY-NC-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/3.0/",
};
const SOURCES: Record<string, WikiSource> = {
  "230410": WARFRAME_WIKI,
  "1086940": { id: "bg3", name: "Baldur's Gate 3 Wiki", api: "https://bg3.wiki/w/api.php", pageBase: "https://bg3.wiki/wiki/", starters: ["Weapons", "Quests", "Classes", "Spells"], license: "See BG3 Wiki content licences", licenseUrl: "https://bg3.wiki/wiki/bg3wiki:Copyrights" },
  "105600": { id: "terraria", name: "Terraria Wiki", api: "https://terraria.wiki.gg/api.php", pageBase: "https://terraria.wiki.gg/wiki/", starters: ["Guide", "Crafting", "Bosses", "Armor"], license: "See source terms", licenseUrl: "https://terraria.wiki.gg/wiki/Terraria_Wiki:Copyrights" },
};
export function sourceFor(game: GuideGame): WikiSource | undefined {
  return SOURCES[game.id] ?? SOURCES[GUIDE_GAMES.find(item => normalize(item.title) === normalize(game.title))?.id ?? ""];
}
const normalize = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "");
export const pcWikiUrl = (title: string) => `https://www.pcgamingwiki.com/wiki/Special:Search?search=${encodeURIComponent(title)}`;
export function safeWikiLink(value: string): string | null {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
