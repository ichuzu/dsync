/**
 * Runtime theme tokens.
 *
 * The whole design system in src/index.css is driven by a handful of HSL CSS
 * variables, so a theme is really just a few knobs: two brand hues, how tinted
 * and how dark the neutral surfaces are, and the corner radius. Everything else
 * (cards, borders, gradients, glows, contrast text) is derived from those here
 * so a user-picked palette stays internally consistent instead of needing a
 * hand-authored stylesheet per option.
 */

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedMode = "dark" | "light";

export interface ThemeConfig {
  /** Which preset the knobs came from, or "custom" once the user edits them. */
  presetId: string;
  mode: ThemeMode;
  /** Brand hue used for primary actions, focus rings and glows. 0-360 */
  primaryHue: number;
  primarySat: number;
  /** Counterweight hue used for the accent / secondary highlights. 0-360 */
  accentHue: number;
  accentSat: number;
  /** Hue and saturation of the neutral surfaces — how "tinted" the greys are. */
  neutralHue: number;
  neutralSat: number;
  /**
   * Secondary surfaces (secondary buttons, chips). Unset, they are a muted
   * shade of the primary; set, they use their own hue and intensity.
   */
  secondaryHue?: number;
  secondarySat?: number;
  /** Corner radius in rem. */
  radius: number;
  /**
   * Angled corners: how far (px) the top-left and bottom-right corners are
   * cut on a diagonal, replacing the rounding. 0 turns it off.
   */
  angle: number;
}

/* ------------------------------------------------------------------ */
/* Colour maths                                                        */
/* ------------------------------------------------------------------ */

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

/** WCAG relative luminance, used to decide whether text on a swatch is dark or light. */
const luminance = (h: number, s: number, l: number) => {
  const [r, g, b] = hslToRgb(h, s, l);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Pick readable text for a coloured surface: a very dark tint of the same hue,
 * or near-white — whichever wins on contrast. Keeps yellow buttons legible
 * without forcing every other hue to dark text.
 */
const contrastText = (h: number, s: number, l: number) => {
  const bg = luminance(h, s, l);
  const darkSat = Math.min(s, 70);
  const dark = luminance(h, darkSat, 7);
  const light = luminance(h, 20, 98);
  return contrast(bg, dark) >= contrast(bg, light)
    ? `${h} ${darkSat}% 7%`
    : `${h} 20% 98%`;
};

const clampHue = (h: number) => ((h % 360) + 360) % 360;
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const round = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ */
/* Token generation                                                    */
/* ------------------------------------------------------------------ */

/** The CSS custom properties, without the leading `--`, mapped to their values. */
export type TokenMap = Record<string, string>;

/** The secondary colour actually in use: its own if set, else derived from the primary. */
export const resolvedSecondary = (c: ThemeConfig, mode: ResolvedMode): { hue: number; sat: number } => {
  const ns = mode === "light" ? Math.min(c.neutralSat, 30) : c.neutralSat;
  const derived = mode === "light" ? clamp(round(ns * 1.1), 10, 24) : clamp(round(ns * 0.6), 8, 18);
  return { hue: c.secondaryHue ?? c.primaryHue, sat: c.secondarySat ?? derived };
};

const darkTokens = (c: ThemeConfig): TokenMap => {
  const nh = c.neutralHue;
  const ns = c.neutralSat;
  const ph = c.primaryHue;
  const ps = c.primarySat;
  const ah = c.accentHue;
  const as = c.accentSat;

  return {
    background: `${nh} ${ns}% 7%`,
    foreground: `${nh} ${Math.min(ns, 20)}% 96%`,

    card: `${nh} ${round(ns * 0.9)}% 11%`,
    "card-foreground": `${nh} ${Math.min(ns, 20)}% 96%`,
    popover: `${nh} ${round(ns * 0.95)}% 10%`,
    "popover-foreground": `${nh} ${Math.min(ns, 20)}% 96%`,

    primary: `${ph} ${ps}% 50%`,
    "primary-foreground": contrastText(ph, ps, 50),
    "primary-glow": `${clampHue(ph - 4)} ${Math.min(ps + 4, 100)}% 60%`,

    // Secondary is a raised surface, so it takes a hint of the primary hue and
    // a floor on saturation — a purely neutral derivation goes invisible against
    // the card on the barely-tinted palettes.
    secondary: `${resolvedSecondary(c, "dark").hue} ${resolvedSecondary(c, "dark").sat}% 22%`,
    "secondary-foreground": `${nh} ${Math.min(ns, 20)}% 96%`,

    muted: `${nh} ${round(ns * 0.7)}% 15%`,
    "muted-foreground": `${nh} ${round(ns * 0.6)}% 66%`,

    accent: `${ah} ${as}% 58%`,
    "accent-foreground": contrastText(ah, as, 58),

    destructive: "356 74% 54%",
    "destructive-foreground": "210 20% 98%",
    success: "158 64% 45%",
    "success-foreground": "160 70% 7%",
    perfect: "142 71% 55%",
    warning: "38 94% 56%",
    "warning-foreground": "38 92% 8%",

    // Scrim laid over cover art, so it stays dark in both modes but picks up
    // the surface tint. Used with an alpha in `hsl(var(--scrim) / 0.6)`.
    scrim: `${nh} ${Math.min(ns + 12, 40)}% 4%`,

    border: `${nh} ${round(ns * 0.7)}% 20%`,
    input: `${nh} ${round(ns * 0.7)}% 17%`,
    ring: `${ph} ${ps}% 50%`,

    "rarity-common": `${nh} 10% 62%`,
    "rarity-uncommon": "158 58% 48%",
    "rarity-rare": "205 85% 58%",
    "rarity-epic": "270 70% 66%",
    "rarity-legendary": "40 94% 58%",

    "launcher-steam": "203 80% 55%",
    "launcher-epic": "0 0% 90%",
    "launcher-gog": "280 70% 62%",
  };
};

const lightTokens = (c: ThemeConfig): TokenMap => {
  const nh = c.neutralHue;
  const ns = Math.min(c.neutralSat, 30);
  const ph = c.primaryHue;
  const ps = c.primarySat;
  const ah = c.accentHue;
  const as = c.accentSat;

  // Brand colours darken in light mode so they still hold contrast on white.
  const pl = 42;
  const al = 46;

  return {
    background: `${nh} ${round(ns * 1.2)}% 97%`,
    foreground: `${nh} ${Math.min(ns + 10, 40)}% 12%`,

    card: `${nh} ${round(ns * 0.8)}% 100%`,
    "card-foreground": `${nh} ${Math.min(ns + 10, 40)}% 12%`,
    popover: `${nh} ${round(ns * 0.8)}% 100%`,
    "popover-foreground": `${nh} ${Math.min(ns + 10, 40)}% 12%`,

    primary: `${ph} ${ps}% ${pl}%`,
    "primary-foreground": contrastText(ph, ps, pl),
    "primary-glow": `${clampHue(ph - 4)} ${Math.min(ps + 4, 100)}% 52%`,

    // See the dark note: tinted toward the primary so it reads as a surface.
    secondary: `${resolvedSecondary(c, "light").hue} ${resolvedSecondary(c, "light").sat}% 90%`,
    "secondary-foreground": `${nh} ${Math.min(ns + 10, 40)}% 14%`,

    muted: `${nh} ${round(ns * 1.1)}% 94%`,
    "muted-foreground": `${nh} ${round(ns * 0.8)}% 40%`,

    accent: `${ah} ${as}% ${al}%`,
    "accent-foreground": contrastText(ah, as, al),

    destructive: "356 70% 45%",
    "destructive-foreground": "0 0% 100%",
    success: "158 64% 32%",
    "success-foreground": "0 0% 100%",
    perfect: "142 68% 32%",
    warning: "34 90% 38%",
    "warning-foreground": "0 0% 100%",

    // Cover-art scrim stays dark even in light mode — it sits over photography.
    scrim: `${nh} ${Math.min(ns + 12, 40)}% 8%`,

    border: `${nh} ${round(ns * 0.9)}% 86%`,
    input: `${nh} ${round(ns * 0.9)}% 90%`,
    ring: `${ph} ${ps}% ${pl}%`,

    "rarity-common": `${nh} 8% 45%`,
    "rarity-uncommon": "158 58% 32%",
    "rarity-rare": "205 75% 42%",
    "rarity-epic": "270 60% 50%",
    "rarity-legendary": "38 85% 38%",

    "launcher-steam": "203 70% 38%",
    "launcher-epic": "0 0% 25%",
    "launcher-gog": "280 60% 45%",
  };
};

/** Gradients and shadows are full CSS values rather than bare HSL triples. */
const compositeTokens = (c: ThemeConfig, mode: ResolvedMode): TokenMap => {
  const { primaryHue: ph, primarySat: ps, accentHue: ah } = c;
  const nh = c.neutralHue;
  const ns = c.neutralSat;
  // The second brand-gradient stop sits a fixed sweep around the wheel from the
  // primary so it reads as a shift rather than a clash.
  const brandTo = clampHue(ph + 70);

  if (mode === "light") {
    const lns = Math.min(ns, 30);
    return {
      "gradient-brand": `linear-gradient(135deg, hsl(${ph} ${ps}% 46%), hsl(${brandTo} ${Math.min(ps, 78)}% 54%))`,
      "gradient-hero": [
        `radial-gradient(110% 90% at 12% 0%, hsl(${ph} 60% 93%) 0%, transparent 62%)`,
        `radial-gradient(90% 80% at 100% 8%, hsl(${ah} 65% 94%) 0%, transparent 58%)`,
        `radial-gradient(140% 120% at 50% 0%, hsl(${nh} ${round(lns * 1.2)}% 99%) 0%, hsl(${nh} ${round(lns * 1.2)}% 96%) 60%)`,
      ].join(", "),
      "gradient-card": `linear-gradient(160deg, hsl(${nh} ${round(lns * 0.8)}% 100%), hsl(${nh} ${lns}% 97%))`,
      "shadow-card": `0 8px 24px hsl(${nh} 30% 40% / 0.14)`,
      "shadow-glow": `0 0 32px hsl(${ph} ${ps}% 46% / 0.25)`,
      "shadow-glow-strong": `0 0 48px hsl(${ph} ${ps}% 46% / 0.4)`,
    };
  }

  return {
    "gradient-brand": `linear-gradient(135deg, hsl(${ph} ${ps}% 50%), hsl(${brandTo} ${Math.min(ps, 78)}% 62%))`,
    "gradient-hero": [
      `radial-gradient(110% 90% at 12% 0%, hsl(${ph} 40% 13%) 0%, transparent 62%)`,
      `radial-gradient(90% 80% at 100% 8%, hsl(${ah} 45% 12%) 0%, transparent 58%)`,
      `radial-gradient(140% 120% at 50% 0%, hsl(${nh} ${round(ns * 1.2)}% 10%) 0%, hsl(${nh} ${ns}% 7%) 60%)`,
    ].join(", "),
    "gradient-card": `linear-gradient(160deg, hsl(${nh} ${round(ns * 0.9)}% 13%), hsl(${nh} ${ns}% 9%))`,
    "shadow-card": `0 8px 24px hsl(${nh} 40% 2% / 0.65)`,
    "shadow-glow": `0 0 32px hsl(${ph} ${ps}% 50% / 0.32)`,
    "shadow-glow-strong": `0 0 48px hsl(${ph} ${ps}% 50% / 0.5)`,
  };
};

/** Build the complete variable set for a config at a resolved light/dark mode. */
export const buildTokens = (config: ThemeConfig, mode: ResolvedMode): TokenMap => ({
  ...(mode === "light" ? lightTokens(config) : darkTokens(config)),
  ...compositeTokens(config, mode),
  radius: `${config.radius}rem`,
  chamfer: `${config.angle ?? 0}px`,
});

/** Write the tokens onto an element (normally `document.documentElement`). */
export const applyTokens = (el: HTMLElement, tokens: TokenMap) => {
  for (const [name, value] of Object.entries(tokens)) {
    el.style.setProperty(`--${name}`, value);
  }
};

/**
 * A categorical series palette derived from the theme, for charts.
 *
 * Slices alternate between the primary and accent families, each pair stepping
 * further around the wheel, so neighbouring categories stay distinguishable
 * while the chart still reads as part of the chosen palette.
 */
export const categoricalPalette = (
  config: ThemeConfig,
  mode: ResolvedMode,
  count = 8,
): string[] => {
  const step = 38;
  const light = mode === "light" ? 44 : 55;
  return Array.from({ length: count }, (_, i) => {
    const pair = Math.floor(i / 2);
    const fromPrimary = i % 2 === 0;
    const hue = fromPrimary
      ? clampHue(config.primaryHue + pair * step)
      : clampHue(config.accentHue - pair * step);
    const sat = Math.max(fromPrimary ? config.primarySat : config.accentSat, 45) - pair * 3;
    // Nudge alternate slices lighter so same-hue neighbours still separate.
    return `hsl(${hue} ${round(sat)}% ${light + (i % 2 ? 5 : 0)}%)`;
  });
};
