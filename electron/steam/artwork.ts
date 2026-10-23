import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Artwork for non-Steam games, saved where Steam looks for custom art:
 *
 *   userdata/<account>/config/grid/<appid>p.png      cover (600×900)
 *   userdata/<account>/config/grid/<appid>.png       wide capsule (header)
 *   userdata/<account>/config/grid/<appid>_hero.png  library hero
 *   userdata/<account>/config/grid/<appid>_logo.png  logo over the hero
 *
 * Sources, in order:
 *   1. the Steam store, when the game also exists there (an Epic or GOG copy
 *      of a Steam game): official art, no key needed;
 *   2. SteamGridDB, the community artwork site, when the user has added its
 *      free API key: covers almost everything, mods included.
 *
 * Steam picks the files up on its next start.
 */

export type ArtKind = "cover" | "header" | "hero" | "logo";
export type ArtworkSet = Partial<Record<ArtKind, string>> & { source: "Steam store" | "SteamGridDB" };

const FILE_SUFFIX: Record<ArtKind, string> = { cover: "p", header: "", hero: "_hero", logo: "_logo" };
const CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps";
const SGDB = "https://www.steamgriddb.com/api/v2";

/** "ReSkateLauncher.exe" -> "ReSkate"; shortcut names are often an exe name. */
export function cleanName(name: string): string {
  return name
    .replace(/.exe$/i, "")
    .replace(/[s_-]*(launcher|launch|x64|win64|shipping)$/i, "")
    .replace(/_+/g, " ")
    .trim();
}

const simplify = (s: string) => s.toLowerCase().replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, "");

async function exists(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { method: "HEAD" })).ok;
  } catch {
    return false;
  }
}

/** Official art if a Steam store game has (practically) the same name. */
async function fromSteamStore(name: string): Promise<ArtworkSet | null> {
  try {
    const res = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&cc=US&l=english`);
    const items: Array<{ id: number; name: string }> = (await res.json())?.items ?? [];
    const match = items.find((i) => simplify(i.name) === simplify(name));
    if (!match) return null;
    const base = `${CDN}/${match.id}`;
    const cover = (await exists(`${base}/library_600x900_2x.jpg`)) ? `${base}/library_600x900_2x.jpg` : `${base}/library_600x900.jpg`;
    const set: ArtworkSet = { source: "Steam store", header: `${base}/header.jpg` };
    if (await exists(cover)) set.cover = cover;
    if (await exists(`${base}/library_hero.jpg`)) set.hero = `${base}/library_hero.jpg`;
    if (await exists(`${base}/logo.png`)) set.logo = `${base}/logo.png`;
    return set;
  } catch {
    return null;
  }
}

async function fromSteamGridDb(name: string, key: string): Promise<ArtworkSet | null> {
  const get = async (path: string) => {
    const res = await fetch(`${SGDB}${path}`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401 || res.status === 403) throw new Error("SteamGridDB rejected the API key.");
    return res.ok ? (await res.json())?.data : null;
  };
  const results: Array<{ id: number; name: string }> = (await get(`/search/autocomplete/${encodeURIComponent(name)}`)) ?? [];
  const game = results.find((r) => simplify(r.name) === simplify(name)) ?? results[0];
  if (!game) return null;
  const first = async (path: string): Promise<string | undefined> => (await get(path))?.[0]?.url;
  const mimes = "mimes=image/png,image/jpeg";
  const [cover, header, hero, logo] = await Promise.all([
    first(`/grids/game/${game.id}?dimensions=600x900&${mimes}`),
    first(`/grids/game/${game.id}?dimensions=920x430,460x215&${mimes}`),
    first(`/heroes/game/${game.id}?${mimes}`),
    first(`/logos/game/${game.id}?mimes=image/png`),
  ]);
  if (!cover && !header && !hero && !logo) return null;
  return { source: "SteamGridDB", cover, header, hero, logo };
}

export async function findArtwork(name: string, gridDbKey?: string): Promise<ArtworkSet | null> {
  const query = cleanName(name) || name;
  return (await fromSteamStore(query)) ?? (gridDbKey ? await fromSteamGridDb(query, gridDbKey) : null);
}

/** Which art kinds a grid folder already has for this appid. */
export async function existingArt(gridDir: string, appid: string): Promise<Set<ArtKind>> {
  const files = await readdir(gridDir).catch(() => [] as string[]);
  const have = new Set<ArtKind>();
  for (const kind of Object.keys(FILE_SUFFIX) as ArtKind[]) {
    const stem = `${appid}${FILE_SUFFIX[kind]}`;
    if (files.some((f) => f.toLowerCase().startsWith(`${stem}.`) && /\.(png|jpe?g|webp)$/i.test(f))) have.add(kind);
  }
  return have;
}

/**
 * Downloads and saves a set into the grid folder. Kinds already present are
 * left alone unless `overwrite`. Returns the kinds written.
 */
export async function saveArtwork(gridDir: string, appid: string, set: ArtworkSet, overwrite: boolean): Promise<ArtKind[]> {
  await mkdir(gridDir, { recursive: true });
  const have = await existingArt(gridDir, appid);
  const files = await readdir(gridDir).catch(() => [] as string[]);
  const written: ArtKind[] = [];
  for (const kind of Object.keys(FILE_SUFFIX) as ArtKind[]) {
    const url = set[kind];
    if (!url || (have.has(kind) && !overwrite)) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "";
      const ext = type.includes("png") ? ".png" : type.includes("jpeg") || type.includes("jpg") ? ".jpg" : null;
      if (!ext) continue;
      const stem = `${appid}${FILE_SUFFIX[kind]}`;
      // Replace, not add: Steam would pick one of two at random.
      for (const old of files.filter((f) => f.toLowerCase().startsWith(`${stem}.`))) await unlink(join(gridDir, old)).catch(() => {});
      await writeFile(join(gridDir, stem + ext), Buffer.from(await res.arrayBuffer()));
      written.push(kind);
    } catch {
      /* one failed download doesn't stop the rest */
    }
  }
  return written;
}
