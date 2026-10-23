import { useEffect, useState } from "react";
import { BookOpenText, ExternalLink, Loader2 } from "lucide-react";
import type { GuideTip } from "@/lib/achievementGuides";
import { fetchSteamAchievementTips } from "@/lib/steamClient";
import { cn } from "@/lib/utils";

/**
 * "How to get it": the entry for one achievement from the game's Steam
 * Community achievement guides (see achievementGuides.ts), to read instead
 * of watching a video. Results are kept a week per achievement; guides
 * rarely change and each lookup reads a few guide pages.
 */

const WEEK = 7 * 24 * 60 * 60 * 1000;
const cacheKey = (appid: string, name: string) => `dsync.tips.${appid}.${name.toLowerCase()}`;

function readCache(appid: string, name: string): GuideTip[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(appid, name));
    if (!raw) return null;
    const { ts, tips } = JSON.parse(raw) as { ts: number; tips: GuideTip[] };
    return Date.now() - ts < WEEK ? tips : null;
  } catch {
    return null;
  }
}

export function useAchievementTips(appid: string | null | undefined, name: string | null | undefined, enabled = true) {
  const [tips, setTips] = useState<GuideTip[] | null>(() => (appid && name ? readCache(appid, name) : null));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!appid || !name) return setTips(null);
    const cached = readCache(appid, name);
    setTips(cached);
    if (cached || !enabled) return;
    let cancelled = false;
    setLoading(true);
    fetchSteamAchievementTips(appid, name)
      .then((fresh) => {
        try {
          localStorage.setItem(cacheKey(appid, name), JSON.stringify({ ts: Date.now(), tips: fresh }));
        } catch {
          /* ignore quota errors */
        }
        if (!cancelled) setTips(fresh);
      })
      .catch(() => !cancelled && setTips([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [appid, name, enabled]);

  return { tips, loading };
}

/** The guide text for one achievement, with where it came from. */
export function AchievementTips({
  appid,
  name,
  compact = false,
  className,
}: {
  appid: string;
  name: string;
  /** Overlay: just the most useful entry, clamped, with no "nothing found" text. */
  compact?: boolean;
  className?: string;
}) {
  const { tips, loading } = useAchievementTips(appid, name);
  const useful = tips?.filter((t) => t.adds) ?? [];
  const shown = compact ? useful.slice(0, 1) : useful;

  if (loading && !tips) {
    return compact ? null : (
      <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3 w-3 animate-spin" /> Reading Steam guides…
      </p>
    );
  }
  if (!shown.length) {
    if (compact || !tips) return null;
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        {tips.length
          ? "The game's guides only repeat Steam's description for this one."
          : "No written guide covers this achievement yet."}
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {shown.map((tip) => (
        <div key={tip.guideUrl} className={cn(!compact && "rounded-md border border-border bg-muted/30 p-2.5")}>
          <p
            className={cn(
              "whitespace-pre-line text-foreground/90",
              compact ? "line-clamp-4 text-[11px] leading-snug" : "text-xs leading-relaxed",
            )}
          >
            {compact && <BookOpenText className="mr-1 inline h-3 w-3 align-[-2px] text-primary" />}
            {tip.text}
          </p>
          {!compact && (
            <a
              href={tip.guideUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              From “{tip.guideTitle}” <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
