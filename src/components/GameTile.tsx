import { type ReactNode } from "react";
import { SteamImage } from "@/components/SteamImage";

interface GameTileProps {
  appid: number;
  /** Small label above the title (e.g. the game name for a news item). */
  eyebrow?: string;
  title: string;
  /** Corner chip (e.g. time-ago or a release countdown). */
  badge?: ReactNode;
  onClick?: () => void;
  href?: string;
}

/** A compact, Reddit-style square tile: game art + a headline overlay. */
export const GameTile = ({ appid, eyebrow, title, badge, onClick, href }: GameTileProps) => {
  const inner = (
    <>
      <SteamImage
        appid={appid}
        shape="landscape"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        fallback={<div className="absolute inset-0 bg-gradient-card" />}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      {badge && (
        <span className="absolute right-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white/90">
          {badge}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        {eyebrow && (
          <div className="mb-0.5 truncate text-[11px] font-medium text-primary-glow">{eyebrow}</div>
        )}
        <div className="line-clamp-2 text-xs font-semibold leading-snug text-white">{title}</div>
      </div>
    </>
  );

  const className =
    "group relative block aspect-square overflow-hidden rounded-lg border border-border bg-muted text-left";

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} title={title}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} title={title}>
      {inner}
    </button>
  );
};
