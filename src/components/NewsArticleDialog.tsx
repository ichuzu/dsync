import { Fragment, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SteamImage } from "@/components/SteamImage";
import { fetchSteamNewsItem } from "@/lib/steamClient";
import type { NewsItem } from "@/lib/steam";

const STEAM_CLAN_IMAGE = "https://clan.cloudflare.steamstatic.com/images/";

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

type Block =
  | { type: "text"; value: string }
  | { type: "heading"; value: string }
  | { type: "list"; items: string[] }
  | { type: "img"; src: string };

// A control char that never appears in article text; used to slice content
// into blocks without colliding with real words or whitespace.
const SENT = "\u0000";

/**
 * Parse Steam news content (a mix of BBCode and HTML) into safe, structured
 * blocks: headings, paragraphs, bullet lists, and validated image URLs. We never
 * inject raw HTML, so untrusted feed markup can't run scripts. Headings/lists are
 * preserved (rather than flattened to text) so the article reads cleanly.
 */
const parseArticle = (raw: string): Block[] => {
  let s = raw.replace(/\{STEAM_CLAN_IMAGE\}/g, STEAM_CLAN_IMAGE);

  // Pull images (BBCode + HTML) out as sentinel-wrapped markers.
  s = s.replace(/\[img\]\s*([^[\]]+?)\s*\[\/img\]/gi, (_m, u) => `${SENT}IMG:${u}${SENT}`);
  s = s.replace(/<img[^>]*?src=["']([^"']+)["'][^>]*>/gi, (_m, u) => `${SENT}IMG:${u}${SENT}`);

  // Mark headings as their own sentinel blocks.
  s = s.replace(/\[h[1-3]\]\s*([\s\S]*?)\s*\[\/h[1-3]\]/gi, (_m, t) => `${SENT}H:${t}${SENT}`);
  s = s.replace(/<h[1-3][^>]*>\s*([\s\S]*?)\s*<\/h[1-3]>/gi, (_m, t) => `${SENT}H:${t}${SENT}`);

  // Mark list items so we can regroup runs of them into a single list block.
  s = s.replace(/\[\*\]\s*([^[]*)/gi, (_m, t) => `${SENT}LI:${t.trim()}${SENT}`);
  s = s.replace(/<li[^>]*>\s*([\s\S]*?)\s*<\/li>/gi, (_m, t) => `${SENT}LI:${t}${SENT}`);

  // Normalize remaining line/paragraph breaks.
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(?:p|div|h[1-6]|ul|ol)>/gi, "\n\n");
  s = s.replace(/\[\/?(?:p|list|olist|quote)\]/gi, "\n\n");

  // Strip any remaining BBCode / HTML tags, then decode entities.
  s = s.replace(/\[[^\]]*\]/g, "");
  s = s.replace(/<[^>]*>/g, "");

  const blocks: Block[] = [];
  for (const chunk of s.split(SENT)) {
    if (chunk.startsWith("IMG:")) {
      const src = chunk.slice(4).trim();
      if (/^https?:\/\//i.test(src)) blocks.push({ type: "img", src });
    } else if (chunk.startsWith("H:")) {
      const value = decodeEntities(chunk.slice(2)).replace(/\s+/g, " ").trim();
      if (value) blocks.push({ type: "heading", value });
    } else if (chunk.startsWith("LI:")) {
      const value = decodeEntities(chunk.slice(3)).replace(/\s+/g, " ").trim();
      if (!value) continue;
      // Merge consecutive list items into one list block.
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === "list") prev.items.push(value);
      else blocks.push({ type: "list", items: [value] });
    } else {
      const text = decodeEntities(chunk).replace(/\n{3,}/g, "\n\n").trim();
      if (text) blocks.push({ type: "text", value: text });
    }
  }
  return blocks;
};

const formatDate = (unixSeconds: number): string =>
  unixSeconds
    ? new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

export const NewsArticleDialog = ({
  item,
  open,
  onClose,
}: {
  item: NewsItem | null;
  open: boolean;
  onClose: () => void;
}) => {
  // Full content, lazily fetched; falls back to the truncated feed content.
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    let active = true;
    setContent(item.contents);
    setLoading(true);
    fetchSteamNewsItem(item.appid, item.gid)
      .then((full) => {
        if (active && full?.contents) setContent(full.contents);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, item]);

  const blocks = useMemo(() => (item ? parseArticle(content) : []), [item, content]);

  // Use the first parsed image as the hero, then drop it from the body so it
  // isn't shown twice. Fall back to the game's Steam art when there's none.
  const heroIdx = blocks.findIndex((b) => b.type === "img");
  const heroSrc = heroIdx >= 0 ? (blocks[heroIdx] as { src: string }).src : null;
  const bodyBlocks = heroIdx >= 0 ? blocks.filter((_, i) => i !== heroIdx) : blocks;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {item && (
          <>
            {/* Hero */}
            <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-muted">
              {heroSrc ? (
                <img src={heroSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <SteamImage
                  appid={item.appid}
                  shape="landscape"
                  alt=""
                  className="h-full w-full object-cover"
                  fallback={<div className="h-full w-full bg-gradient-card" />}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            </div>

            <DialogHeader className="border-b border-border px-6 py-4 text-left">
              <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate font-semibold uppercase tracking-wide text-primary">
                  {item.game}
                </span>
                {item.date > 0 && (
                  <>
                    <span>·</span>
                    <span>{formatDate(item.date)}</span>
                  </>
                )}
                {item.feedlabel && (
                  <>
                    <span>·</span>
                    <span className="truncate">{item.feedlabel}</span>
                  </>
                )}
              </div>
              <DialogTitle className="pr-6 text-xl leading-snug">{item.title}</DialogTitle>
            </DialogHeader>

            <ScrollArea className="max-h-[48vh]">
              <div className="space-y-4 px-6 py-5">
                {bodyBlocks.map((b, i) => {
                  if (b.type === "img") {
                    return (
                      <img
                        key={i}
                        src={b.src}
                        alt=""
                        loading="lazy"
                        className="my-2 w-full rounded-lg"
                      />
                    );
                  }
                  if (b.type === "heading") {
                    return (
                      <h3 key={i} className="mt-2 text-base font-semibold text-foreground">
                        {b.value}
                      </h3>
                    );
                  }
                  if (b.type === "list") {
                    return (
                      <ul key={i} className="list-disc space-y-1 pl-5 text-[15px] leading-7 text-foreground/90">
                        {b.items.map((li, j) => (
                          <li key={j}>{li}</li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <p key={i} className="text-[15px] leading-7 text-foreground/90">
                      {b.value.split("\n").map((line, j, arr) => (
                        <Fragment key={j}>
                          {line}
                          {j < arr.length - 1 && <br />}
                        </Fragment>
                      ))}
                    </p>
                  );
                })}
                {loading && (
                  <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading full article…
                  </div>
                )}
                {!loading && bodyBlocks.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No preview available — open the original to read it.
                  </p>
                )}
              </div>
            </ScrollArea>

            <div className="border-t border-border px-6 py-3">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Open original <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
