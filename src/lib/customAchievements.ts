import { useCallback, useEffect, useState } from "react";
import type { Achievement } from "@/types/game";

/**
 * The player's own achievements for non-Steam games, which Steam has no
 * achievements for: goals they add ("Land a 900"), then tick off.
 *
 * Kept per appid in localStorage, shared by the main window and the overlay
 * (same origin). Changes are announced with CHANGE_EVENT in this window and
 * arrive through the storage event in the other, so cards, the drawer and
 * the overlay stay in step. If a game ever gets real achievements (an
 * emulator or mod that records them), they can be read into this same shape.
 */

export interface CustomAchievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  /** YYYY-MM-DD, when ticked off. */
  unlockedDate?: string;
}

const key = (appid: string) => `dsync.custom-achievements.${appid}`;
export const CHANGE_EVENT = "dsync:custom-achievements";

export function readCustomAchievements(appid: string): CustomAchievement[] {
  try {
    const list = JSON.parse(localStorage.getItem(key(appid)) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(appid: string, list: CustomAchievement[]) {
  try {
    if (list.length) localStorage.setItem(key(appid), JSON.stringify(list));
    else localStorage.removeItem(key(appid));
  } catch {
    /* lasts for this session */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: appid }));
}

/** In the shape the rest of the app uses for Steam achievements. */
export function asAchievements(list: CustomAchievement[]): Achievement[] {
  return list.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    rarity: "common",
    // No global stats: the list order is the player's own order.
    globalUnlockPct: 0,
    unlocked: c.unlocked,
    unlockedDate: c.unlockedDate,
    icon: "",
  }));
}

/** Calls `fn` whenever any game's custom achievements change, in either window. */
export function onCustomAchievementsChanged(fn: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith("dsync.custom-achievements.")) fn();
  };
  window.addEventListener(CHANGE_EVENT, fn);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCustomAchievements(appid: string | null | undefined) {
  const [list, setList] = useState<CustomAchievement[]>(() => (appid ? readCustomAchievements(appid) : []));

  useEffect(() => {
    if (!appid) return setList([]);
    setList(readCustomAchievements(appid));
    return onCustomAchievementsChanged(() => setList(readCustomAchievements(appid)));
  }, [appid]);

  const save = useCallback((next: CustomAchievement[]) => appid && write(appid, next), [appid]);

  const add = useCallback(
    (name: string, description = "") => {
      if (!appid || !name.trim()) return;
      const id = `c_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
      save([...readCustomAchievements(appid), { id, name: name.trim(), description: description.trim(), unlocked: false }]);
    },
    [appid, save],
  );

  const toggle = useCallback(
    (id: string) => {
      if (!appid) return;
      save(
        readCustomAchievements(appid).map((c) =>
          c.id !== id
            ? c
            : c.unlocked
              ? { ...c, unlocked: false, unlockedDate: undefined }
              : { ...c, unlocked: true, unlockedDate: new Date().toISOString().slice(0, 10) },
        ),
      );
    },
    [appid, save],
  );

  const remove = useCallback(
    (id: string) => appid && save(readCustomAchievements(appid).filter((c) => c.id !== id)),
    [appid, save],
  );

  return { list, add, toggle, remove };
}
