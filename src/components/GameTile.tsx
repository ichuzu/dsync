import { useState, type ReactNode } from "react";

const CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps";

/**
 * Steam art lives at several predictable paths and not every app has all of
 * them (e.g. some newly-announced titles lack header.jpg). Try them in order
 * before giving up to a themed gradient.
 */
const imageCandidates = (appid: number) => [
  `${CDN}/${appid}/header.jpg`,
  `${CDN}/${appid}/capsule_616x353.jpg`,
  `${CDN}/${appid}/library_600x900.jpg`,
];

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
  const [idx, setIdx] = useState(0);
  const candidates = imageCandidates(appid);
  const broken = idx >= candidates.length;

  const inner = (
    <>
      {broken ? (
        <div className="absolute inset-0 bg-gradient-card" />
      ) : (
        <img
          src={candidates[idx]}
          alt=""
          loading="lazy"
          onError={() => setIdx((i) => i + 1)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}
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
