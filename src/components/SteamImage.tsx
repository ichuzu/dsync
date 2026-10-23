import { useEffect, useState, type ReactNode } from "react";
import {
  forgetImage,
  getCachedImage,
  getImageCandidates,
  rememberImage,
  type CoverShape,
} from "@/lib/steamImage";
import { fetchSteamCover } from "@/lib/steamClient";
import { cn } from "@/lib/utils";

interface SteamImageProps {
  appid: string | number;
  /** Which art orientation to prefer. Defaults to the more-reliable landscape. */
  shape?: CoverShape;
  alt?: string;
  className?: string;
  /**
   * When the CDN candidates are exhausted, ask the server cover endpoint
   * (store appdetails) for a hashed image URL — useful for unreleased games.
   */
  storeFallback?: boolean;
  /** Rendered when every source fails. Defaults to a themed gradient panel. */
  fallback?: ReactNode;
  loading?: "lazy" | "eager";
  /** Hint for the browser's fetch queue; use "high" for above-the-fold art. */
  fetchPriority?: "high" | "low" | "auto";
}

/**
 * A resilient Steam game image. Walks the CDN art variants on error, optionally
 * falls back to the server store lookup, and finally renders a gradient panel so
 * a card is never left with a broken/empty image.
 *
 * Results are remembered per app (see `steamImage.ts`), so the candidate walk
 * happens once per session rather than on every mount — a game with no
 * `header.jpg` otherwise re-pays three 404s plus a server lookup each time it
 * scrolls back into view.
 */
export const SteamImage = ({
  appid,
  shape = "landscape",
  alt = "",
  className,
  storeFallback = true,
  fallback,
  loading = "lazy",
  fetchPriority,
}: SteamImageProps) => {
  const candidates = getImageCandidates(appid, shape);

  // idx walks the CDN list; once past it we may try the store URL (held in
  // `storeUrl`), and `broken` means we've given up entirely. A cache hit skips
  // straight to the URL that is already known to work.
  const [cached, setCached] = useState(() => getCachedImage(appid, shape));
  const [idx, setIdx] = useState(0);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [storeTried, setStoreTried] = useState(false);
  const [broken, setBroken] = useState(cached === null || candidates.length === 0);
  const [loaded, setLoaded] = useState(false);

  // Reset state when the target app changes (component is often reused in lists).
  useEffect(() => {
    const hit = getCachedImage(appid, shape);
    setCached(hit);
    setIdx(0);
    setStoreUrl(null);
    setStoreTried(false);
    setBroken(hit === null || getImageCandidates(appid, shape).length === 0);
    setLoaded(false);
  }, [appid, shape]);

  // A cached URL wins outright; otherwise walk the candidate list as before.
  const src = cached || (idx < candidates.length ? candidates[idx] : storeUrl);

  const handleError = () => {
    // A remembered URL that has since gone away: drop it and fall back to the
    // normal candidate walk rather than leaving a permanently blank slot.
    if (cached) {
      forgetImage(appid, shape);
      setCached(undefined);
      return;
    }
    if (idx < candidates.length - 1) {
      setIdx((i) => i + 1);
      return;
    }
    if (idx === candidates.length - 1 && storeFallback && !storeTried) {
      // Move past the CDN list and attempt the server store lookup once.
      setStoreTried(true);
      setIdx(candidates.length);
      fetchSteamCover(String(appid))
        .then((url) => {
          if (url) {
            setStoreUrl(url);
          } else {
            rememberImage(appid, shape, null);
            setBroken(true);
          }
        })
        .catch(() => {
          rememberImage(appid, shape, null);
          setBroken(true);
        });
      return;
    }
    rememberImage(appid, shape, null);
    setBroken(true);
  };

  if (broken || !src) {
    return fallback !== undefined ? (
      <>{fallback}</>
    ) : (
      <div className={cn("bg-gradient-card", className)} aria-hidden />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      onLoad={() => {
        rememberImage(appid, shape, src);
        setLoaded(true);
      }}
      onError={handleError}
      // Fade in rather than popping in mid-scroll. Anything already cached by
      // the browser fires onLoad synchronously, so this costs nothing there.
      className={cn(
        "transition-opacity duration-300",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
};
