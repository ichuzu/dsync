import type { Game } from "@/types/game";
import type { HltbTimes } from "@/lib/hltb";

/**
 * How far through a backlog game the player is, and roughly how long is left.
 *
 * Progress comes from achievements, the one measure Steam reports exactly.
 * Time left is measured against a goal (beat the main story, or 100% it)
 * and uses the best source available:
 *
 *   1. HowLongToBeat hours the user saved for the game (CompletionTimes).
 *   2. HowLongToBeat hours looked up automatically (useHltb).
 *   3. For the 100% goal only, their own pace: hours per achievement so far
 *      × achievements left. Pace says nothing about finishing the story.
 *
 * HLTB-based figures are the target hours minus playtime so far.
 *
 * None of these is precise. The source is labelled in the UI so the user knows which
 * one they're looking at.
 */

export type TimeLeftSource = "hltb" | "pace";

/** Finish the main story, or unlock everything. */
export type BacklogGoal = "beat" | "complete";

export interface BacklogProgress {
  /** 0–100, or null when the game has no achievements to measure by. */
  percent: number | null;
  earned: number;
  total: number;
  playtimeHours: number;
  /** Hours left, or null when there's nothing to estimate from. */
  hoursLeft: number | null;
  source: TimeLeftSource | null;
  /** Every achievement unlocked. */
  done: boolean;
  /** Never launched. */
  untouched: boolean;
}

interface SavedTimes {
  main?: string;
  extras?: string;
  complete?: string;
}

/** The HowLongToBeat hours saved in the game drawer, keyed by appid. */
export const readSavedTimes = (appid: string): SavedTimes | null => {
  try {
    const raw = localStorage.getItem(`dsync.completion-times.${appid}`);
    return raw ? (JSON.parse(raw) as SavedTimes) : null;
  } catch {
    return null;
  }
};

const positive = (value?: string): number | null => {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : null;
};

export function backlogProgress(
  game: Game,
  goal: BacklogGoal = "complete",
  looked?: HltbTimes | null,
): BacklogProgress {
  const earned = game.earnedAchievements;
  const total = game.totalAchievements;
  const playtimeHours = game.playtimeHours;
  const hasAchievements = total > 0;
  const done = hasAchievements && earned >= total;

  const base = {
    percent: hasAchievements ? (earned / total) * 100 : null,
    earned,
    total,
    playtimeHours,
    done,
    untouched: playtimeHours === 0,
  };

  // Every achievement unlocked implies the story is done too.
  if (done) return { ...base, hoursLeft: 0, source: null };

  // Saved strings and looked-up numbers, as one shape; HLTB uses 0 for "no data".
  const pick = (t: { main?: number | null; extras?: number | null; complete?: number | null }) =>
    goal === "beat" ? t.main ?? t.extras ?? t.complete : t.complete ?? t.extras ?? t.main;
  const saved = readSavedTimes(game.id);
  // Per category, the user's own figure wins over the looked-up one.
  const target = pick({
    main: positive(saved?.main) ?? (looked?.main || null),
    extras: positive(saved?.extras) ?? (looked?.extras || null),
    complete: positive(saved?.complete) ?? (looked?.complete || null),
  });
  if (target != null) {
    return { ...base, hoursLeft: Math.max(0, target - playtimeHours), source: "hltb" };
  }

  if (goal === "complete" && earned > 0 && hasAchievements) {
    return { ...base, hoursLeft: (playtimeHours / earned) * (total - earned), source: "pace" };
  }

  return { ...base, hoursLeft: null, source: null };
}

/** "45m", "3h", "120h": compact enough for a row. */
export const formatHours = (hours: number): string => {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 10) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours)}h`;
};
