import type { ThemeConfig } from "./tokens";

/** Palettes are shown under these headings, in this order. */
export const PALETTE_GROUPS = ["Signature", "Neon"] as const;
export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

/** A named starting point for the theme knobs. Shape (angles) is the user's own and survives palette changes. */
export interface Palette extends Omit<ThemeConfig, "presetId" | "mode" | "angle" | "secondaryHue" | "secondarySat"> {
  id: string;
  name: string;
  /** One line shown under the palette name in the picker. */
  blurb: string;
  group: PaletteGroup;
}

/**
 * `dsync` is the shipped look (see the `:root` block in src/index.css) — the
 * rest sweep the wheel so there is a distinct option for most tastes without
 * offering a wall of near-identical blues.
 *
 * The Neon group is a fully saturated set taken from a reference palette
 * (#ff0c46, #ff4b00, #b2ff00, #00fdb6, #e70fff). Each one pairs its colour
 * with another from the same set as the accent, sits on a near-neutral
 * near-black, and takes a tighter radius to suit the harder look.
 */
export const PALETTES: Palette[] = [
  {
    id: "dsync",
    name: "Dsync",
    blurb: "Cold cyan against a warm ember",
    group: "Signature",
    primaryHue: 190,
    primarySat: 92,
    accentHue: 20,
    accentSat: 92,
    neutralHue: 224,
    neutralSat: 20,
    radius: 0.75,
  },
  {
    id: "nebula",
    name: "Nebula",
    blurb: "Violet primary, magenta highlights",
    group: "Signature",
    primaryHue: 265,
    primarySat: 85,
    accentHue: 320,
    accentSat: 85,
    neutralHue: 260,
    neutralSat: 22,
    radius: 0.75,
  },
  {
    id: "emerald",
    name: "Emerald",
    blurb: "Deep green with a lime edge",
    group: "Signature",
    primaryHue: 158,
    primarySat: 76,
    accentHue: 88,
    accentSat: 72,
    neutralHue: 180,
    neutralSat: 14,
    radius: 0.75,
  },
  {
    id: "ember",
    name: "Ember",
    blurb: "Amber and rose over warm charcoal",
    group: "Signature",
    primaryHue: 32,
    primarySat: 94,
    accentHue: 350,
    accentSat: 82,
    neutralHue: 24,
    neutralSat: 14,
    radius: 0.75,
  },
  {
    id: "abyss",
    name: "Abyss",
    blurb: "Classic blue, cool and quiet",
    group: "Signature",
    primaryHue: 218,
    primarySat: 90,
    accentHue: 190,
    accentSat: 80,
    neutralHue: 220,
    neutralSat: 18,
    radius: 0.5,
  },
  {
    id: "rose",
    name: "Rose",
    blurb: "Pink primary with a violet counterweight",
    group: "Signature",
    primaryHue: 338,
    primarySat: 84,
    accentHue: 275,
    accentSat: 78,
    neutralHue: 320,
    neutralSat: 12,
    radius: 1,
  },
  {
    id: "toxic",
    name: "Toxic",
    blurb: "High-voltage lime on near-black",
    group: "Signature",
    primaryHue: 84,
    primarySat: 88,
    accentHue: 160,
    accentSat: 82,
    neutralHue: 120,
    neutralSat: 8,
    radius: 0.375,
  },
  {
    id: "mono",
    name: "Mono",
    blurb: "No colour at all, just contrast",
    group: "Signature",
    primaryHue: 220,
    primarySat: 6,
    accentHue: 220,
    accentSat: 6,
    neutralHue: 220,
    neutralSat: 6,
    radius: 0.25,
  },

  {
    id: "neon-punch",
    name: "Punch",
    blurb: "#ff0c46 hot pink against acid lime",
    group: "Neon",
    primaryHue: 346,
    primarySat: 100,
    accentHue: 78,
    accentSat: 100,
    neutralHue: 340,
    neutralSat: 8,
    radius: 0.25,
  },
  {
    id: "neon-sear",
    name: "Sear",
    blurb: "#ff4b00 blaze orange cooled by mint",
    group: "Neon",
    primaryHue: 18,
    primarySat: 100,
    accentHue: 163,
    accentSat: 100,
    neutralHue: 20,
    neutralSat: 8,
    radius: 0.25,
  },
  {
    id: "neon-volt",
    name: "Volt",
    blurb: "#b2ff00 acid lime with a magenta jolt",
    group: "Neon",
    primaryHue: 78,
    primarySat: 100,
    accentHue: 294,
    accentSat: 100,
    neutralHue: 80,
    neutralSat: 8,
    radius: 0.25,
  },
  {
    id: "neon-mint",
    name: "Mint",
    blurb: "#00fdb6 spring green over blaze orange",
    group: "Neon",
    primaryHue: 163,
    primarySat: 100,
    accentHue: 18,
    accentSat: 100,
    neutralHue: 165,
    neutralSat: 8,
    radius: 0.25,
  },
  {
    id: "neon-vice",
    name: "Vice",
    blurb: "#e70fff electric magenta and lime",
    group: "Neon",
    primaryHue: 294,
    primarySat: 100,
    accentHue: 78,
    accentSat: 100,
    neutralHue: 285,
    neutralSat: 8,
    radius: 0.25,
  },
];

export const DEFAULT_PALETTE = PALETTES[0];

export const DEFAULT_THEME: ThemeConfig = {
  presetId: DEFAULT_PALETTE.id,
  mode: "dark",
  primaryHue: DEFAULT_PALETTE.primaryHue,
  primarySat: DEFAULT_PALETTE.primarySat,
  accentHue: DEFAULT_PALETTE.accentHue,
  accentSat: DEFAULT_PALETTE.accentSat,
  neutralHue: DEFAULT_PALETTE.neutralHue,
  neutralSat: DEFAULT_PALETTE.neutralSat,
  radius: DEFAULT_PALETTE.radius,
  angle: 0,
};

/** Apply a palette's colours while keeping the user's current light/dark choice. */
export const applyPalette = (config: ThemeConfig, palette: Palette): ThemeConfig => ({
  ...config,
  presetId: palette.id,
  primaryHue: palette.primaryHue,
  primarySat: palette.primarySat,
  accentHue: palette.accentHue,
  accentSat: palette.accentSat,
  neutralHue: palette.neutralHue,
  neutralSat: palette.neutralSat,
  radius: palette.radius,
  // A preset's secondary follows its primary.
  secondaryHue: undefined,
  secondarySat: undefined,
});

/** True when the config's colours still match the preset it claims to be from. */
export const matchesPalette = (config: ThemeConfig, palette: Palette) =>
  config.secondaryHue === undefined &&
  config.primaryHue === palette.primaryHue &&
  config.primarySat === palette.primarySat &&
  config.accentHue === palette.accentHue &&
  config.accentSat === palette.accentSat &&
  config.neutralHue === palette.neutralHue &&
  config.neutralSat === palette.neutralSat &&
  config.radius === palette.radius;
