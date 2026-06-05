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
