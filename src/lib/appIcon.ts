/**
 * The app icon: the D mark on a rounded tile of the theme's primary colour,
 * inked white on a dark taskbar and black on a light one. The same artwork is
 * baked into build/icon.ico (brand orange, white D) for the exe and installer; at runtime the renderer repaints it whenever the
 * theme changes and hands it to the window, taskbar, tray and favicon.
 */

/** The D from DsyncMark, all five strokes. */
const D_PATHS = [
  "m -1780.2305,3317.9782 -293.25,231.6973 h 99.5235 l 197.705,-156.8067 v -71.748 z",
  "m -2066.1445,3006.6188 285.914,226.7656 3.9785,-3.1562 v -71.125 l -192.9941,-152.4844 z",
  "m -2224.4102,3006.6188 v 78.9278 l 240.7481,190.2168 -240.7481,190.9453 v 82.9668 h 45.3926 l 345.3555,-273.9121 -340.6445,-269.1446 z",
  "m -2481.1913,3006.6188 v 543.0567 h -67.3574 v -543.0567 z",
  "m -2454.416,3006.9997 v 542.2949 h 209.4316 v -78.6016 h -113.7324 v -385.1503 h 113.7324 v -78.543 z",
];

/** SVG source for the icon: `ink` on a tile of `background` (any CSS colours). */
export function appIconSvg(background: string, ink = "#ffffff"): string {
  const paths = D_PATHS.map((d) => `<path fill="${ink}" d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` +
    `<rect width="64" height="64" rx="14" fill="${background}"/>` +
    `<g transform="translate(9.92 9.92) scale(0.92)"><g transform="matrix(0.05948444,0,0,0.05948444,152.62917,-170.99875)">${paths}</g></g>` +
    `</svg>`;
}

/** The icon rasterised to a PNG data URL, `size` pixels square. */
export async function renderAppIcon(background: string, ink = "#ffffff", size = 256): Promise<string> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(appIconSvg(background, ink))}`;
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
