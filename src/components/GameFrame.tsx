import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const ART = "/borders";

/**
 * The frame art is a flat #E6E6E6 silhouette on transparency, so every piece is
 * used as an alpha mask and tinted with `background-color` rather than shipped
 * in one colour per state.
 *
 * The tint comes from the `--frame-tint` custom property rather than a literal,
 * so a parent (the card) can recolour the whole bracket on hover with a single
 * class instead of re-rendering with a different prop.
 */
const piece = (file: string): CSSProperties => ({
  flexShrink: 0,
  backgroundColor: "var(--frame-tint)",
  maskImage: `url(${ART}/${file})`,
  WebkitMaskImage: `url(${ART}/${file})`,
  maskSize: "100% 100%",
  WebkitMaskSize: "100% 100%",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
});

/**
 * Where the orange fill sits inside Border_BLeft_DownloadProgressMT.png
 * (447×55), measured off the artist's filled reference (ProgressBar100.png):
 * the bar occupies x 112–350, y 36–49.
 */
const TRACK = {
  left: (112 / 447) * 100,
  width: (239 / 447) * 100,
  top: (36 / 55) * 100,
  height: (14 / 55) * 100,
};

export type FrameState = "idle" | "play" | "download";

interface GameFrameProps {
  /** Bottom-left corner glyph. Ignored while a download is in flight. */
  state?: FrameState;
  /**
   * Live download percentage (0–100). The orange progress bar renders only
   * while this is a number, and scales to it — pass `undefined`/`null` when
   * nothing is downloading and the whole bar auto-hides.
   */
  downloadProgress?: number | null;
  /** Tint for the frame line art. Any CSS colour. */
  color?: string;
  /** Tint for the download fill. */
  accent?: string;
  /** Breathing room, in px, between the pieces of each bracket. */
  gap?: number;
  className?: string;
}

const PIECE_CLASS = "frame-piece transition-colors duration-300";

/** The artist's download glyph and bar, also used by the game-detail controls. */
export const DownloadGlyph = () => (
  <span aria-hidden style={{ ...piece("Border_BLeft_Download.png"), backgroundColor: "currentColor", width: 64, aspectRatio: "546 / 169" }} />
);

export const DownloadProgressArt = ({ value, label = "Download progress" }: { value: number; label?: string }) => {
  const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return <div className="relative w-full shrink-0" style={{ aspectRatio: "447 / 55" }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
    <div className={cn(PIECE_CLASS, "absolute inset-0")} style={{ ...piece("Border_BLeft_DownloadProgressMT.png"), backgroundColor: "var(--frame-tint, currentColor)" }} />
    <div className="absolute transition-[width] duration-300" style={{ backgroundColor: "var(--frame-accent, #FF5500)", left: `${TRACK.left}%`, top: `${TRACK.top}%`, height: `${TRACK.height}%`, width: `${(TRACK.width * pct) / 100}%` }} />
  </div>;
};

/**
 * Angular HUD bracket that wraps a game's cover: a top-right edge pair, a left
 * edge strip, and a bottom-left corner that switches between a play glyph, a
 * download glyph, and a live download bar.
 */
export const GameFrame = ({
  state = "idle",
  downloadProgress,
  color = "rgba(255,255,255,0.5)",
  accent = "#FF5500",
  gap = 10,
  className,
}: GameFrameProps) => {
  const downloading = typeof downloadProgress === "number" && Number.isFinite(downloadProgress);
  const pct = downloading ? Math.min(100, Math.max(0, downloadProgress)) : 0;

  return (
    <div
      className={cn("pointer-events-none absolute z-[2]", className)}
      aria-hidden
      style={
        {
          inset: 0,
          "--frame-tint": color,
          "--frame-accent": accent,
        } as CSSProperties
      }
    >
      {/* Top-right bracket. Each bracket is a flex column so the pieces space
          themselves off whichever corner art is showing, instead of needing an
          offset per state. */}
      <div
        className="absolute right-0 top-0 flex h-full w-[64%] flex-col items-end"
        style={{ gap: `${gap}px` }}
      >
        <div
          className={PIECE_CLASS}
          style={{ ...piece("Border_TopR.png"), width: "100%", aspectRatio: "765 / 61" }}
        />
        <div
          className={PIECE_CLASS}
          style={{ ...piece("Border_TRight.png"), height: "48%", aspectRatio: "69 / 1015" }}
        />
      </div>

      {/* Bottom-left bracket */}
      <div
        className="absolute bottom-0 left-0 flex h-full w-[70%] flex-col items-start justify-end"
        style={{ gap: `${gap}px` }}
      >
        <div
          className={PIECE_CLASS}
          style={{ ...piece("Border_BLeft.png"), height: "48%", aspectRatio: "50 / 770" }}
        />

        {downloading ? (
          <DownloadProgressArt value={pct} />
        ) : state === "play" ? (
          <div
            className={PIECE_CLASS}
            style={{ ...piece("Border_BLeft_Play.png"), width: "100%", aspectRatio: "546 / 169" }}
          />
        ) : state === "download" ? (
          <div
            className={PIECE_CLASS}
            style={{ ...piece("Border_BLeft_Download.png"), width: "100%", aspectRatio: "546 / 169" }}
          />
        ) : null}
      </div>
    </div>
  );
};
