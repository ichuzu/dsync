import { Launcher } from "@/types/game";

export interface LauncherMeta {
  id: Launcher;
  name: string;
  /** Single-letter mark used as a fallback when no logo file is present. */
  mark: string;
  /** Key into the logo registry (src/lib/logos.ts) — swap files there. */
  logoKey: string;
  /** Tailwind text color class bound to the launcher's brand hue. */
  textClass: string;
  /** Tailwind background tint class for badges/avatars. */
  tintClass: string;
}

export const LAUNCHERS: Record<Launcher, LauncherMeta> = {
  steam: {
    id: "steam",
    name: "Steam",
    mark: "S",
    logoKey: "steam",
    textClass: "text-launcher-steam",
    tintClass: "bg-launcher-steam/15 text-launcher-steam",
  },
};

export const LAUNCHER_LIST: LauncherMeta[] = Object.values(LAUNCHERS);
