import { Fragment, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type Block = { type: "text"; value: string } | { type: "img"; src: string };

/**
 * Parse Steam news content (a mix of BBCode and HTML) into safe blocks: plain
 * text (React escapes it) and validated image URLs. We deliberately never
 * inject raw HTML, so untrusted feed markup can't run scripts.
 */
const parseArticle = (raw: string): Block[] => {
  const SENT = "";
  let s = raw.replace(/\{STEAM_CLAN_IMAGE\}/g, STEAM_CLAN_IMAGE);

  // Pull images (BBCode + HTML) out as sentinel-wrapped markers.
  s = s.replace(/\[img\]\s*([^[\]]+?)\s*\[\/img\]/gi, (_m, u) => `${SENT}IMG:${u}${SENT}`);
  s = s.replace(/<img[^>]*?src=["']([^"']+)["'][^>]*>/gi, (_m, u) => `${SENT}IMG:${u}${SENT}`);

  // Normalize line/paragraph breaks.
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(?:p|div|h[1-6]|li|ul|ol)>/gi, "\n\n");
  s = s.replace(/\[\/?(?:p|h\d|list|olist|quote)\]/gi, "\n\n");
  s = s.replace(/\[\*\]/gi, "\n• ");

  // Strip any remaining BBCode / HTML tags, then decode entities.
  s = s.replace(/\[[^\]]*\]/g, "");
  s = s.replace(/<[^>]*>/g, "");
  s = decodeEntities(s);

  const blocks: Block[] = [];
  for (const chunk of s.split(SENT)) {
    if (chunk.startsWith("IMG:")) {
      const src = chunk.slice(4).trim();
      if (/^https?:\/\//i.test(src)) blocks.push({ type: "img", src });
    } else {
      const text = chunk.replace(/\n{3,}/g, "\n\n").trim();
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

  const blocks = item ? parseArticle(content) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {item && (
          <>
            <DialogHeader className="border-b border-border px-6 py-4 text-left">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate font-medium text-primary">{item.game}</span>
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
              <DialogTitle className="pr-6 text-lg leading-snug">{item.title}</DialogTitle>
            </DialogHeader>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto px-6 py-4">
              {blocks.map((b, i) =>
                b.type === "img" ? (
                  <img
                    key={i}
                    src={b.src}
                    alt=""
                    loading="lazy"
                    className="mx-auto rounded-lg"
                  />
                ) : (
                  <p key={i} className="text-sm leading-relaxed text-foreground/90">
                    {b.value.split("\n").map((line, j, arr) => (
                      <Fragment key={j}>
                        {line}
                        {j < arr.length - 1 && <br />}
                      </Fragment>
                    ))}
                  </p>
                ),
              )}
              {loading && (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading full article…
                </div>
              )}
              {!loading && blocks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No preview available — open the original to read it.
                </p>
              )}
            </div>

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
