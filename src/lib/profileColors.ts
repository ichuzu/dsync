import type { ThemeConfig } from "@/theme/tokens";

/**
 * Derives theme colours from the player's Steam avatar and profile
 * background ("Match my Steam profile" in the theme picker).
 *
 * Each image is shrunk to a few thousand pixels. Near-black, near-white and
 * grey pixels are skipped; the rest vote for their hue, weighted by how
 * vivid they are. The strongest hue becomes the primary colour; the
 * strongest one clearly different from it (at least MIN_SEPARATION degrees
 * away, even if faint) becomes the accent, else a neighbouring hue. The neutral surfaces take a light tint of the
 * primary so the whole app reads as one palette. A mostly grey picture
 * yields a muted, mono-style theme rather than invented colour.
 */

export type ProfileColors = Pick<
  ThemeConfig,
  "primaryHue" | "primarySat" | "accentHue" | "accentSat" | "neutralHue" | "neutralSat"
>;

const SIZE = 64;
const BINS = 36; // 10° each
const MIN_SEPARATION = 50;

async function loadPixels(url: string): Promise<Uint8ClampedArray | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    // Keep the aspect ratio so a wide background isn't squashed.
    const scale = Math.min(1, SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

interface Bin {
  weight: number;
  /** Weighted sums for a circular mean of hue (x, y) and saturation. */
  x: number;
  y: number;
  sat: number;
}

/**
 * Colours from the given images (avatar first). `weights` lets the avatar
 * count for more than a busy background.
 */
export async function colorsFromImages(urls: string[], weights: number[] = []): Promise<ProfileColors | null> {
  const bins: Bin[] = Array.from({ length: BINS }, () => ({ weight: 0, x: 0, y: 0, sat: 0 }));
  let total = 0;
  let any = false;

  for (const [index, url] of urls.entries()) {
    const data = await loadPixels(url);
    if (!data) continue;
    any = true;
    const pixels = data.length / 4;
    const imageWeight = (weights[index] ?? 1) / pixels;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      total += imageWeight;
      if (l < 0.12 || l > 0.92 || s < 0.18) continue;
      // Vivid, mid-lightness pixels say the most about a picture's colour.
      const vividness = s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.6);
      const w = vividness * imageWeight;
      const bin = bins[Math.floor(h / (360 / BINS)) % BINS];
      bin.weight += w;
      bin.x += Math.cos((h * Math.PI) / 180) * w;
      bin.y += Math.sin((h * Math.PI) / 180) * w;
      bin.sat += s * w;
    }
  }
  if (!any) return null;

  // Each bin with its neighbours, so a hue straddling two bins isn't split.
  const smoothed = bins.map((_, i) => {
    const group = [bins[(i + BINS - 1) % BINS], bins[i], bins[(i + 1) % BINS]];
    const weight = group.reduce((sum, b) => sum + b.weight, 0);
    const x = group.reduce((sum, b) => sum + b.x, 0);
    const y = group.reduce((sum, b) => sum + b.y, 0);
    const sat = group.reduce((sum, b) => sum + b.sat, 0);
    return {
      weight,
      hue: (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360,
      sat: weight ? sat / weight : 0,
    };
  });

  const ranked = [...smoothed].sort((a, b) => b.weight - a.weight);
  const primary = ranked[0];
  const colourful = total > 0 ? primary.weight / total : 0;

  // Barely any colour: a quiet theme in whatever tint there is.
  if (!primary.weight || colourful < 0.02) {
    const hue = primary.weight ? Math.round(primary.hue) : 220;
    return { primaryHue: hue, primarySat: 8, accentHue: hue, accentSat: 8, neutralHue: hue, neutralSat: 6 };
  }

  const accent = ranked.find((b) => b.weight >= primary.weight * 0.06 && hueDistance(b.hue, primary.hue) >= MIN_SEPARATION);
  const primaryHue = Math.round(primary.hue);
  const primarySat = Math.round(Math.min(95, Math.max(40, primary.sat * 110)));
  return {
    primaryHue,
    primarySat,
    // No second colour in the pictures: a neighbouring hue, which sits with
    // the primary more naturally than its opposite would.
    accentHue: Math.round(accent ? accent.hue : (primary.hue + 30) % 360),
    accentSat: accent ? Math.round(Math.min(95, Math.max(40, accent.sat * 110))) : Math.round(primarySat * 0.85),
    neutralHue: primaryHue,
    neutralSat: Math.round(Math.min(22, 8 + colourful * 40)),
  };
}
