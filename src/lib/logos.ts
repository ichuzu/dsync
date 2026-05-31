/**
 * Filename-keyed logo registry.
 *
 * Every logo lives as a file in `public/logos/`. To swap a logo, drop a new
 * file in that folder and point its key here — no component code changes.
 * Keys are arbitrary (launchers, frameworks, brands, …); resolve them with
 * `resolveLogo()` or render them with the <Logo /> component.
 */
export const LOGO_DIR = "/logos";

export const LOGOS: Record<string, string> = {
  steam: "steam.svg",
};

/** Returns the public URL for a logo key, or null if it isn't configured. */
export const resolveLogo = (key: string): string | null =>
  LOGOS[key] ? `${LOGO_DIR}/${LOGOS[key]}` : null;
