/**
 * Minimal parser for Valve's KeyValues text format (.vdf / .acf).
 *
 * Steam stores its local library index and every app's install state in this
 * format, so reading it is how the desktop build learns what is actually on
 * disk — no API key, no public profile, no network.
 *
 * The grammar is small: quoted strings, optional nesting in braces, and
 * C-style comments. Values are always strings; callers coerce.
 *
 *   "AppState"
 *   {
 *     "appid"   "250820"
 *     "name"    "SteamVR"
 *   }
 */
export type VdfValue = string | VdfObject;
export interface VdfObject {
  [key: string]: VdfValue;
}

/** Reads one quoted string, honouring backslash escapes. */
function readQuoted(src: string, start: number): [string, number] {
  let out = "";
  let i = start + 1; // skip the opening quote
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      const next = src[i + 1];
      out += next === "n" ? "\n" : next === "t" ? "\t" : next;
      i += 2;
      continue;
    }
    if (ch === '"') return [out, i + 1];
    out += ch;
    i += 1;
  }
  return [out, i];
}

/** Skips whitespace and // comments, returning the next significant index. */
function skip(src: string, i: number): number {
  while (i < src.length) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
    } else if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i += 1;
    } else {
      return i;
    }
  }
  return i;
}

/**
 * Parses a KeyValues document into a plain object.
 *
 * Malformed input yields whatever parsed cleanly rather than throwing: these
 * files are written by Steam while it runs, so a half-flushed read is normal
 * and must not take the app down.
 */
export function parseVdf(text: string): VdfObject {
  let i = 0;

  const parseObject = (): VdfObject => {
    const obj: VdfObject = {};
    while (i < text.length) {
      i = skip(text, i);
      if (i >= text.length) break;

      if (text[i] === "}") {
        i += 1;
        return obj;
      }
      if (text[i] !== '"') {
        i += 1; // unquoted token (rare); ignore it
        continue;
      }

      const [key, afterKey] = readQuoted(text, i);
      i = skip(text, afterKey);
      if (i >= text.length) break;

      if (text[i] === "{") {
        i += 1;
        obj[key] = parseObject();
      } else if (text[i] === '"') {
        const [value, afterValue] = readQuoted(text, i);
        obj[key] = value;
        i = afterValue;
      }
    }
    return obj;
  };

  const root = parseObject();
  // Documents are wrapped in a single named root ("libraryfolders", "AppState").
  const keys = Object.keys(root);
  if (keys.length === 1 && typeof root[keys[0]] === "object") {
    return root[keys[0]] as VdfObject;
  }
  return root;
}

/** Narrowing helper: the value at `key` if it is a nested object. */
export const asObject = (v: VdfValue | undefined): VdfObject | null =>
  v && typeof v === "object" ? v : null;

/** Narrowing helper: the value at `key` if it is a scalar string. */
export const asString = (v: VdfValue | undefined): string | null =>
  typeof v === "string" ? v : null;

/** Parses a numeric field, returning 0 for anything unreadable. */
export const asNumber = (v: VdfValue | undefined): number => {
  const n = Number(asString(v));
  return Number.isFinite(n) ? n : 0;
};
