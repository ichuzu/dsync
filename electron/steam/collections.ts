import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { findSteamRoot } from "./paths";

/**
 * Reads the user's Steam library collections ("Favorites", "Backlog", …).
 *
 * The Web API has no endpoint for these. The Steam client keeps them in a
 * local cloud-storage file, one per account:
 *
 *   userdata/<accountId>/config/cloudstorage/cloud-storage-namespace-1.json
 *
 * which is a JSON array of [key, entry] pairs. Collection entries are keyed
 * "user-collections.<id>" and their `value` is itself a JSON string holding
 * the name and the app ids. Deleted collections linger with `is_deleted`.
 */

export interface SteamCollection {
  /** Steam's own id for the collection, stable across renames. */
  id: string;
  name: string;
  /** Hand-picked games. For a dynamic collection, the ones added on top of its rule. */
  appids: string[];
  /**
   * Built from a filter rather than picked by hand. Steam stores only the rule,
   * not the games it matches, so the renderer evaluates `rule` itself.
   */
  dynamic: boolean;
  rule?: DynamicRule;
  /** Games manually taken out of a dynamic collection despite matching. */
  removed: string[];
}

export interface DynamicRule {
  /** Store tag ids the collection filters on. */
  tagIds: number[];
  /** Every tag must match (Steam's default), rather than any one of them. */
  matchAll: boolean;
  /**
   * The rule also uses filters Dsync can't evaluate (play state, features,
   * search text, …), so the result may include games Steam leaves out.
   */
  partial: boolean;
}

/**
 * filterGroups is a fixed-position array; the store-tag group sits at index 4
 * in format version 2. The others (play state, genre, features, …) need data
 * only the Steam client has.
 */
const TAG_GROUP = 4;

interface RawFilterSpec {
  strSearchText?: string;
  filterGroups?: Array<{ rgOptions?: number[]; bAcceptUnion?: boolean }>;
}

function ruleFrom(spec: RawFilterSpec): DynamicRule {
  const groups = spec.filterGroups ?? [];
  const tagGroup = groups[TAG_GROUP];
  return {
    tagIds: tagGroup?.rgOptions ?? [],
    matchAll: !tagGroup?.bAcceptUnion,
    partial:
      Boolean(spec.strSearchText) ||
      groups.some((g, i) => i !== TAG_GROUP && (g.rgOptions?.length ?? 0) > 0),
  };
}

/** SteamID64 is the 32-bit account id offset by this constant. */
const STEAMID64_BASE = 76561197960265728n;

const COLLECTIONS_FILE = join("config", "cloudstorage", "cloud-storage-namespace-1.json");

const accountIdFrom = (steamId: string): string | null => {
  try {
    return String(BigInt(steamId) - STEAMID64_BASE);
  } catch {
    return null;
  }
};

/**
 * The collections file for this Steam account. Falls back to the most
 * recently written one when there's no id or the id has no folder here, which
 * covers the usual case of one person using one PC.
 */
async function findCollectionsFile(steamId?: string): Promise<string | null> {
  const root = await findSteamRoot();
  if (!root) return null;
  const userdata = join(root, "userdata");

  const accountId = steamId ? accountIdFrom(steamId) : null;
  if (accountId) {
    const own = join(userdata, accountId, COLLECTIONS_FILE);
    if (await stat(own).catch(() => null)) return own;
  }

  let entries: string[];
  try {
    entries = await readdir(userdata);
  } catch {
    return null;
  }

  let newest: { path: string; mtime: number } | null = null;
  for (const entry of entries) {
    const path = join(userdata, entry, COLLECTIONS_FILE);
    const info = await stat(path).catch(() => null);
    if (info && (!newest || info.mtimeMs > newest.mtime)) {
      newest = { path, mtime: info.mtimeMs };
    }
  }
  return newest?.path ?? null;
}

interface RawEntry {
  key?: string;
  value?: string;
  is_deleted?: boolean;
}

interface RawCollection {
  id?: string;
  name?: string;
  added?: number[];
  removed?: number[];
  filterSpec?: RawFilterSpec;
}

/** Every collection on the account, or an empty list if Steam isn't here. */
export async function readSteamCollections(steamId?: string): Promise<SteamCollection[]> {
  const file = await findCollectionsFile(steamId);
  if (!file) return [];

  let pairs: Array<[string, RawEntry]>;
  try {
    pairs = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(pairs)) return [];

  const collections: SteamCollection[] = [];
  for (const pair of pairs) {
    if (!Array.isArray(pair)) continue;
    const [key, entry] = pair;
    if (typeof key !== "string" || !key.startsWith("user-collections.")) continue;
    if (!entry || entry.is_deleted || typeof entry.value !== "string") continue;

    let raw: RawCollection;
    try {
      raw = JSON.parse(entry.value);
    } catch {
      continue;
    }
    if (!raw.name) continue;

    const removed = new Set(raw.removed ?? []);
    const appids = (raw.added ?? []).filter((id) => !removed.has(id)).map(String);

    collections.push({
      id: raw.id ?? key.slice("user-collections.".length),
      name: raw.name,
      appids,
      dynamic: Boolean(raw.filterSpec),
      rule: raw.filterSpec ? ruleFrom(raw.filterSpec) : undefined,
      removed: [...removed].map(String),
    });
  }

  return collections.sort((a, b) => a.name.localeCompare(b.name));
}
