import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SteamImage } from "@/components/SteamImage";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { NewsItem } from "@/lib/steam";
import type { GameNewsGroup } from "@/lib/news";

const relativeTime = (unixSeconds: number): string => {
  if (!unixSeconds) return "";
  const mins = Math.round((Date.now() - unixSeconds * 1000) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
};

interface GameNewsCardProps {
  group: GameNewsGroup;
  onOpenItem: (item: NewsItem) => void;
}

/**
 * A single game's news, collapsed into one wide hero card: the latest headline
 * up top, with any older updates tucked behind an expandable "+N more" list so
 * the feed stays scannable.
 */
export const GameNewsCard = ({ group, onOpenItem }: GameNewsCardProps) => {
  const [open, setOpen] = useState(false);
  const { latest, items, count, appid, game } = group;
  const extra = items.slice(1);

  return (
    <div className="group/card overflow-hidden rounded-xl border border-border bg-gradient-card transition-all duration-300 hover:border-primary/50 hover:shadow-[0_0_28px_hsl(24_95%_53%/0.28)]">
      {/* Hero + latest headline */}
      <button
        type="button"
        onClick={() => onOpenItem(latest)}
        className="block w-full text-left"
        title={latest.title}
      >
        <div className="relative aspect-[16/9] overflow-hidden">
          <SteamImage
            appid={appid}
            shape="landscape"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover/card:scale-105"
            fallback={<div className="absolute inset-0 bg-gradient-card" />}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          {latest.date > 0 && (
            <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white/90">
              {relativeTime(latest.date)}
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="mb-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-primary-glow">
              {game}
            </div>
            <div className="line-clamp-2 text-sm font-semibold leading-snug text-white">
              {latest.title}
            </div>
          </div>
        </div>
      </button>

      {/* Older updates for the same game */}
      {count > 1 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            <span>
              {open ? "Hide updates" : `+${extra.length} more update${extra.length > 1 ? "s" : ""}`}
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="border-t border-border/60">
              {extra.map((item) => (
                <li key={item.gid}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(item)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">
                      {item.title}
                    </span>
                    {item.date > 0 && (
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {relativeTime(item.date)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
