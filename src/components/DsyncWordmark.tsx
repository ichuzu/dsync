import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface DsyncWordmarkProps {
  className?: string;
  /** Ink for the light strokes. Any CSS colour. Defaults to `currentColor`. */
  base?: string;
  /** Ink for the accent strokes. Any CSS colour. Defaults to the theme primary. */
  accent?: string;
}

/**
 * Generated from public/logos/DSYNC_ACTUAL_Clean.svg: Inkscape metadata stripped and the two
 * brand inks swapped for CSS custom properties, so the wordmark follows the
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
export const DsyncWordmark = ({ className, base, accent }: DsyncWordmarkProps) => (
  <svg
    width="508.00001"
    height="138.90707"
    viewBox="0 0 508.00001 138.90707"
    role="img"
    aria-label="Dsync"
    className={cn("block h-8 w-auto max-w-full text-foreground", className)}
    style={{ "--mark-base": base, "--mark-accent": accent } as CSSProperties}
    xmlns="http://www.w3.org/2000/svg"
  >
    <g>
      <g transform="matrix(0.49248028,0,0,0.49248038,-3719.4386,68.721684)">
        <path fill="var(--mark-accent, hsl(var(--primary)))" d="m -2124.583,3317.9782 -176.4625,231.6973 h 59.8881 l 118.9685,-156.8067 v -71.748 z" transform="matrix(0.4621326,0,0,0.28746634,8746.6816,-961.46432)" />
        <path fill="var(--mark-accent, hsl(var(--primary)))" d="m -2296.6311,3006.6188 172.0481,226.7656 2.3941,-3.1562 v -71.125 l -116.1338,-152.4844 z" transform="matrix(0.4621326,0,0,0.28746634,8746.6816,-961.46432)" />
        <path fill="var(--mark-base, currentColor)" d="m -2353.4991,3006.6188 v 78.9278 l 101.4134,133.1578 v 114.3379 l -101.4123,133.6664 v 82.9668 h 27.3149 l 166.4481,-219.3862 v -108.8425 l -163.6142,-214.828 z" transform="matrix(0.4621326,0,0,0.28746634,8746.6816,-961.46432)" />
        <path fill="var(--mark-base, currentColor)" d="m -2508.0165,3006.6188 v 543.0567 h -21.0573 v -543.0567 z" transform="matrix(0.4621326,0,0,0.28746634,8746.6816,-961.46432)" />
        <path fill="var(--mark-base, currentColor)" d="m -2491.9046,3006.9997 v 542.2949 h 126.025 v -78.6016 h -68.4382 v -385.1503 h 68.4382 v -78.543 z" transform="matrix(0.4621326,0,0,0.28746634,8746.6816,-961.46432)" />
        <path fill="var(--mark-accent, hsl(var(--primary)))" d="m 8063.5625,80.884766 -38.7207,27.886714 -7.332,13.00977 11.4453,20.20703 z" transform="translate(5.4775728e-5)" />
        <path fill="var(--mark-accent, hsl(var(--primary)))" d="M 8198.4062,-16.232422 8177.373,-1.0839844 V 61.482422 h 21.3653 z" transform="translate(5.4775728e-5)" />
        <path fill="var(--mark-accent, hsl(var(--primary)))" d="M 8391.5955,-97.098462 V 61.481616 h 103.8184 V 48.917163 h -71.0957 V -81.862134 h 71.0957 v -15.236328 z m 111.0684,0 v 15.236328 h 20.75 v -15.236328 z m 28,0 v 15.236328 h 16.7949 v -15.236328 z m 26.2949,0 v 15.236328 h 4.25 v -15.236328 z m 12.75,0 v 15.236328 h 2.2051 v -15.236328 z m -67.0449,146.015625 v 12.564453 h 20.75 V 48.917163 Z m 28,0 v 12.564453 h 16.7949 V 48.917163 Z m 26.2949,0 v 12.564453 h 4.25 V 48.917163 Z m 12.75,0 v 12.564453 h 2.2051 V 48.917163 Z" transform="translate(5.4775728e-5)" />
        <path fill="var(--mark-accent, hsl(var(--primary)))" d="m 8257.5767,-58.850416 -31.291,22.53711 105.1191,97.794922 h 26.2871 V -97.014181 h -19.0058 l 0.1464,113.757515 z" transform="translate(5.4775728e-5)" />
        <path fill="var(--mark-accent, hsl(var(--primary)))" d="m 8310.7928,-97.080884 -8.2715,5.953125 h 22.5078 v 74.841797 l -54.1387,-52.082032 -5.5234,3.97461 65.9375,62.5664059 V -97.080884 Z" transform="translate(5.4775728e-5)" />
        <path fill="var(--mark-base, currentColor)" d="m 8230.9197,-97.080884 27.6348,26.222656 5.5762,-4.013672 -16.8985,-16.255859 h 39.4825 l 8.2714,-5.953125 z" transform="translate(5.4775728e-5)" />
        <path fill="var(--mark-accent, hsl(var(--primary)))" d="m 8232.6898,-7.6470116 71.8013,69.0736556 7.3255,-5.271306 -87.4496,-82.978571 z" transform="translate(5.4775728e-5)" />
        <g transform="matrix(11.246521,0,0,-8.3235353,6146.9587,1566.7788)" fill="var(--mark-base, currentColor)">
          <g fill="var(--mark-base, currentColor)">
            <path fill="var(--mark-base, currentColor)" d="m 75.220794,345.09855 h 1.685798 l 3.426869,14.9603 h -1.676587 z" transform="scale(2.0071597,0.49821645)" />
            <path fill="var(--mark-base, currentColor)" d="m 144.45345,171.93377 h 3.38366 l 6.87827,7.45347 h -3.36517 z" />
            <path fill="var(--mark-base, currentColor)" d="m 137.99074,171.93377 h 3.38366 l 6.87827,7.45347 h -3.36517 z" />
          </g>
        </g>
        <g transform="matrix(11.246521,0,0,-8.3235353,6000.9224,1566.7788)" fill="var(--mark-base, currentColor)">
          <g fill="var(--mark-base, currentColor)">
            <path fill="var(--mark-base, currentColor)" d="m 75.220794,345.09855 h 1.685798 l 3.426869,14.9603 h -1.676587 z" transform="scale(2.0071597,0.49821645)" />
            <path fill="var(--mark-base, currentColor)" d="m 144.45345,171.93377 h 3.38366 l 6.87827,7.45347 h -3.36517 z" />
            <path fill="var(--mark-base, currentColor)" d="m 137.99074,171.93377 h 3.38366 l 6.87827,7.45347 h -3.36517 z" />
          </g>
        </g>
        <g fill="var(--mark-accent, hsl(var(--primary)))" transform="matrix(1.0978548,0,0,1.0978547,11234.573,1083.6869)">
          <g transform="matrix(1.1129124,0,0,1,152.17407,-590.98941)">
            <rect fill="var(--mark-base, currentColor)" width="162.34273" height="30.757523" x="-2644.4707" y="-690.01257" transform="matrix(1,0,0.65685029,0.75402102,0,0)" />
            <rect fill="var(--mark-base, currentColor)" width="162.34273" height="30.757523" x="-2445.021" y="-690.01257" transform="matrix(1,0,0.65685029,0.75402102,0,0)" />
            <rect fill="var(--mark-base, currentColor)" width="162.34273" height="30.757523" x="-2242.5735" y="-690.01257" transform="matrix(1,0,0.65685029,0.75402102,0,0)" />
            <rect fill="var(--mark-accent, hsl(var(--primary)))" width="162.34273" height="30.757523" x="-2043.1239" y="-690.01257" transform="matrix(1,0,0.65685029,0.75402102,0,0)" />
          </g>
        </g>
        <path fill="var(--mark-accent, hsl(var(--primary)))" d="m 68.935014,360.05862 -3.436075,-14.96026 h 1.685808 l 3.426903,14.96026 z m 3.219855,0 -3.436075,-14.96026 h 1.685808 0.03046 l 3.426903,14.96026 h -0.03054 z m 3.249532,0 -3.436075,-14.96026 h 1.685808 7.78e-4 0.0014 l 3.426816,14.96026 h -0.0014 -7.79e-4 z m 3.219854,0 -3.436161,-14.96026 h 0.03054 0.0022 1.683645 0.0022 l 3.426817,14.96026 h -0.0022 -1.674387 -0.0022 z m 3.250224,0 -3.436075,-14.96026 h 0.0015 1.684337 0.0014 l 3.426903,14.96026 h -0.0014 -1.675166 z m 3.251782,0 -3.436075,-14.96026 h 1.685721 l 3.426903,14.96026 z" transform="matrix(22.573564,0,0,-4.1469223,6624.1506,1566.7788)" />
        <g>
          <path fill="var(--mark-base, currentColor)" d="m 8177.373,-97.003906 v 84.58789 l 20.9942,-15.121093 -0.1582,-37.144532 22.5742,21 31.291,-22.537109 -33.0918,-30.785156 z" />
          <g>
            <path fill="var(--mark-base, currentColor)" d="m 7985.2869,-94.817212 7.2227,12.753906 55.459,97.917969 14.6543,25.875 -29.168,51.755859 38.793,-27.939453 90.8222,-160.363281 h -23.498 l -15.5352,27.564453 -50.209,83.728515 -66.7421,-111.292968 z" />
            <path fill="var(--mark-accent, hsl(var(--primary)))" d="m 7925.8572,33.049975 v 16.029297 h -149.8906 v 9.875 h 183.1211 v -0.0059 z" />
            <path fill="var(--mark-base, currentColor)" d="m 7863.2811,-29.522291 22.7148,17.703125 h 39.8613 v 31.066407 l 33.2305,25.898437 v -74.667969 z" />
            <path fill="var(--mark-base, currentColor)" d="m 7775.9666,-83.772291 v 71.953125 h 92.3203 l -22.7148,-17.703125 h -36.375 V -57.8719 Z" />
            <path fill="var(--mark-base, currentColor)" d="m 7776.6912,-97.008619 32.5059,25.333985 v -8.066407 h 149.8906 v -17.267578 z" />
            <path fill="var(--mark-base, currentColor)" d="m 8022.6778,-97.09065 51.1169,88.5390625 51.1169,-88.5390625 h -10.7188 l -40.3981,69.972633 -40.398,-69.972633 z" />
            <path fill="var(--mark-accent, hsl(var(--primary)))" d="m 8007.0806,124.20098 43.4837,-75.694869 -9.8766,2.64641 -36.4171,62.561159 z" />
            <path fill="var(--mark-accent, hsl(var(--primary)))" d="m 7989.0091,-76.206089 54.245,100.806377 -9.8087,-2.628215 -47.227,-87.762969 z" />
          </g>
        </g>
      </g>
    </g>
  </svg>
);
