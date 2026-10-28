/**
 * The app icon: the D mark on its own, no tile, coloured like the in-app
 * logo. Its main strokes take `ink` (white on a dark taskbar, black on a
 * light one) and its two accent strokes take the theme's primary colour. The
 * same artwork is baked into build/icon.ico (white and brand orange, with a
 * thin dark outline so it shows on light Explorer backgrounds too) for the
 * exe and installer; at runtime the renderer repaints it whenever the theme
 * or taskbar changes and hands it to the window, taskbar, tray and favicon.
 */

/** The D from DsyncMark: two accent strokes, then three base strokes. */
const ACCENT_PATHS = [
  "m -1780.2305,3317.9782 -293.25,231.6973 h 99.5235 l 197.705,-156.8067 v -71.748 z",
  "m -2066.1445,3006.6188 285.914,226.7656 3.9785,-3.1562 v -71.125 l -192.9941,-152.4844 z",
];
const BASE_PATHS = [
  "m -2224.4102,3006.6188 v 78.9278 l 240.7481,190.2168 -240.7481,190.9453 v 82.9668 h 45.3926 l 345.3555,-273.9121 -340.6445,-269.1446 z",
  "m -2481.1913,3006.6188 v 543.0567 h -67.3574 v -543.0567 z",
  "m -2454.416,3006.9997 v 542.2949 h 209.4316 v -78.6016 h -113.7324 v -385.1503 h 113.7324 v -78.543 z",
];

export interface AppIconColors {
  /** Main strokes. */
  ink: string;
  /** The two accent strokes. */
  accent: string;
  /** Optional outline around every stroke, for light backgrounds. */
  outline?: string;
}

/** SVG source for the icon (any CSS colours), on a transparent background. */
export function appIconSvg({ ink, accent, outline }: AppIconColors): string {
  // The mark is in a 48-unit box; scale it to nearly fill the 64 canvas.
  const stroke = outline ? ` stroke="${outline}" stroke-width="40" stroke-linejoin="round" paint-order="stroke"` : "";
  const path = (d: string, fill: string) => `<path fill="${fill}"${stroke} d="${d}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` +
    `<g transform="translate(2 2) scale(1.25)"><g transform="matrix(0.05948444,0,0,0.05948444,152.62917,-170.99875)">` +
    ACCENT_PATHS.map((d) => path(d, accent)).join("") +
    BASE_PATHS.map((d) => path(d, ink)).join("") +
    `</g></g></svg>`
  );
}

/** The icon rasterised to a PNG data URL, `size` pixels square. */
export async function renderAppIcon(colors: AppIconColors, size = 256): Promise<string> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(appIconSvg(colors))}`;
  const img = new Image(size, size);
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}

/** The theme's primary colour as a usable CSS colour, from the live tokens. */
export function themePrimary(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return raw ? `hsl(${raw})` : "#ff5500";
}
