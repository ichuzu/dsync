const CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps";

export type CoverShape = "landscape" | "portrait";

/**
 * Ordered list of Steam CDN art URLs to try for an app. Not every game has every
 * variant — `header.jpg` is by far the most widely available, while the portrait
 * `library_600x900.jpg` is frequently missing for newer titles. Callers walk the
 * list on <img> error and fall back to a placeholder when it's exhausted.
 */
export function getImageCandidates(
  appid: string | number,
  shape: CoverShape = "landscape",
): string[] {
  const id = String(appid);
  // Non-numeric ids aren't Steam apps (e.g. demo data) — no CDN art to try.
  if (!/^\d+$/.test(id)) return [];
  const landscape = [
    `${CDN}/${id}/header.jpg`,
    `${CDN}/${id}/capsule_616x353.jpg`,
    `${CDN}/${id}/library_600x900.jpg`,
  ];
  const portrait = [
    `${CDN}/${id}/library_600x900.jpg`,
    `${CDN}/${id}/header.jpg`,
    `${CDN}/${id}/capsule_616x353.jpg`,
  ];
  return shape === "portrait" ? portrait : landscape;
}

/* ------------------------------------------------------------------------ */
/* Resolved-art cache                                                        */
/*                                                                           */
/* Without this every <SteamImage> mount re-walks the candidate list from     */
/* scratch, so a game whose header.jpg is missing costs three 404s plus a     */
/* server lookup — every time it scrolls back into view or the page remounts. */
/* Remembering the URL that actually worked (and the apps with no art at all) */
/* makes the second and later renders a single request, or none.              */
/* ------------------------------------------------------------------------ */

const STORE_KEY = "dsync.steam.art";

/** `${appid}:${shape}` -> working URL, or null when every candidate failed. */
const resolved = new Map<string, string | null>();

const cacheKey = (appid: string | number, shape: CoverShape) => `${appid}:${shape}`;

let hydrated = false;
const hydrate = () => {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string | null>)) {
      resolved.set(k, v);
    }
  } catch {
    /* private mode / corrupt entry — the in-memory cache still works */
  }
};

// Coalesce writes: resolving a grid of 30 covers should touch storage once.
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(resolved)));
    } catch {
      /* quota or private mode — cache stays in memory only */
    }
  }, 500);
};

/**
 * A previously resolved URL, `null` if the app is known to have no art, or
 * `undefined` if we have never looked it up.
 */
export function getCachedImage(
  appid: string | number,
  shape: CoverShape,
): string | null | undefined {
  hydrate();
  return resolved.get(cacheKey(appid, shape));
}

/** Record the URL that loaded (or `null` once every candidate has failed). */
export function rememberImage(
  appid: string | number,
  shape: CoverShape,
  url: string | null,
): void {
  hydrate();
  const key = cacheKey(appid, shape);
  if (resolved.get(key) === url) return;
  resolved.set(key, url);
  scheduleFlush();
}

/** Drop a remembered URL that has since stopped loading, so the walk restarts. */
export function forgetImage(appid: string | number, shape: CoverShape): void {
  hydrate();
  if (resolved.delete(cacheKey(appid, shape))) scheduleFlush();
}
