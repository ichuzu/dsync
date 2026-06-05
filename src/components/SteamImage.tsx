import { useEffect, useState, type ReactNode } from "react";
import { getImageCandidates, type CoverShape } from "@/lib/steamImage";
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
}

/**
 * A resilient Steam game image. Walks the CDN art variants on error, optionally
 * falls back to the server store lookup, and finally renders a gradient panel so
 * a card is never left with a broken/empty image.
 */
export const SteamImage = ({
  appid,
  shape = "landscape",
  alt = "",
  className,
  storeFallback = true,
  fallback,
  loading = "lazy",
}: SteamImageProps) => {
  const candidates = getImageCandidates(appid, shape);
  // idx walks the CDN list; once past it we may try the store URL (held in
  // `storeUrl`), and `broken` means we've given up entirely.
  const [idx, setIdx] = useState(0);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [storeTried, setStoreTried] = useState(false);
  const [broken, setBroken] = useState(candidates.length === 0);

  // Reset state when the target app changes (component is often reused in lists).
  useEffect(() => {
    setIdx(0);
    setStoreUrl(null);
    setStoreTried(false);
    setBroken(getImageCandidates(appid, shape).length === 0);
  }, [appid, shape]);

  const src = idx < candidates.length ? candidates[idx] : storeUrl;

  const handleError = () => {
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
          if (url) setStoreUrl(url);
          else setBroken(true);
        })
        .catch(() => setBroken(true));
      return;
    }
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
      onError={handleError}
      className={className}
    />
  );
};
