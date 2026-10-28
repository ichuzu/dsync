export type Launcher = "steam";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface Game {
  id: string;
  title: string;
  genre: string;
  /** Which store/launcher the copy was synced from. */
  launcher: Launcher;
  coverImage: string;
  earnedAchievements: number;
  totalAchievements: number;
  /** Total hours played, as reported by the launcher. */
  playtimeHours: number;
  /** Hours played in the last 2 weeks (>0 ⇒ currently playing). */
  recentPlaytimeHours?: number;
  /** Breakdown of unlocked achievements by global rarity. */
  rarityBreakdown: RarityBreakdown;
  lastPlayed?: string;
  /** Whether this game's achievements are fully synced from the launcher. */
  synced: boolean;
  /**
   * Added to Steam as a non-Steam game ("Add a Non-Steam Game"): no
   * achievements, store page or Web API data, but it can be launched
   * through Steam with `launchId`.
   */
  nonSteam?: boolean;
  /** steam://rungameid/ id for non-Steam games. */
  launchId?: string;
}

export interface RarityBreakdown {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  legendary: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  /** Global unlock percentage across all players (lower = rarer). */
  globalUnlockPct: number;
  unlocked: boolean;
  unlockedDate?: string;
  icon: string;
  /** Steam "hidden" achievements reveal their description only once unlocked. */
  hidden?: boolean;
}

/** A game counts as "perfect" once every achievement is unlocked. */
export const isPerfectGame = (game: Game): boolean =>
  game.totalAchievements > 0 && game.earnedAchievements === game.totalAchievements;

/** Whether the game has been played in the last two weeks. */
export const isCurrentlyPlaying = (game: Game): boolean =>
  (game.recentPlaytimeHours ?? 0) > 0;

/** Completion as a 0–100 percentage. */
export const completionPercentage = (game: Game): number =>
  game.totalAchievements === 0
    ? 0
    : (game.earnedAchievements / game.totalAchievements) * 100;
