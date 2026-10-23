import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface DsyncMarkProps {
  className?: string;
  /** Ink for the light strokes. Any CSS colour. Defaults to `currentColor`. */
  base?: string;
  /** Ink for the accent strokes. Any CSS colour. Defaults to the theme primary. */
  accent?: string;
}

/**
 * Generated from public/logos/launcher_multi.svg: Inkscape metadata stripped and the two
 * brand inks swapped for CSS custom properties, so the mark follows the
 * active palette instead of baking in #E6E6E6 / #FF5500. It is inlined rather
 * than loaded as a file because CSS cannot reach inside an external <img> to
 * recolour it.
 *
 * Leave the props unset to track the theme; pass either one to pin an ink.
 *
 * `width`/`height` are kept so the element has an intrinsic ratio: a
 * viewBox-only <svg> sizes to the CSS default (300px), not to its ratio, which
 * makes `w-auto` blow up.
 */
export const DsyncMark = ({ className, base, accent }: DsyncMarkProps) => (
  <svg
    width="48"
    height="48"
    viewBox="0 0 48 48"
    role="img"
    aria-label="Dsync"
    className={cn("block h-8 w-8 shrink-0 text-foreground", className)}
    style={{ "--mark-base": base, "--mark-accent": accent } as CSSProperties}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs />
    <g>
      <g transform="matrix(0.05948444,0,0,0.05948444,152.62917,-170.99875)">
        <path fill="var(--mark-accent, hsl(var(--primary)))" d="m -1780.2305,3317.9782 -293.25,231.6973 h 99.5235 l 197.705,-156.8067 v -71.748 z" />
        <path fill="var(--mark-accent, hsl(var(--primary)))" d="m -2066.1445,3006.6188 285.914,226.7656 3.9785,-3.1562 v -71.125 l -192.9941,-152.4844 z" />
        <path fill="var(--mark-base, currentColor)" d="m -2224.4102,3006.6188 v 78.9278 l 240.7481,190.2168 -240.7481,190.9453 v 82.9668 h 45.3926 l 345.3555,-273.9121 -340.6445,-269.1446 z" />
        <path fill="var(--mark-base, currentColor)" d="m -2481.1913,3006.6188 v 543.0567 h -67.3574 v -543.0567 z" />
        <path fill="var(--mark-base, currentColor)" d="m -2454.416,3006.9997 v 542.2949 h 209.4316 v -78.6016 h -113.7324 v -385.1503 h 113.7324 v -78.543 z" />
      </g>
    </g>
  </svg>
);
