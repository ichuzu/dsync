import { useCallback, useEffect, useState } from "react";

/**
 * Achievements the player pinned for a game: shown in the in-game overlay
 * next to the "up next" pick. Stored per appid in localStorage, which the
 * main window and the overlay window share, so pinning in either shows up in
 * the other (via the storage event).
 */

const key = (appid: string) => `dsync.overlay.pins.${appid}`;

export function readPins(appid: string | null | undefined): string[] {
  if (!appid) return [];
  try {
    const pins = JSON.parse(localStorage.getItem(key(appid)) ?? "[]");
    return Array.isArray(pins) ? pins.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function writePins(appid: string, pins: string[]) {
  try {
    if (pins.length) localStorage.setItem(key(appid), JSON.stringify(pins));
    else localStorage.removeItem(key(appid));
  } catch {
    /* pins last for this session */
  }
}

export function usePins(appid: string | null | undefined) {
  const [pins, setPins] = useState<string[]>(() => readPins(appid));

  useEffect(() => {
    setPins(readPins(appid));
    if (!appid) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === key(appid)) setPins(readPins(appid));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [appid]);

  const save = useCallback(
    (next: string[]) => {
      setPins(next);
      if (appid) writePins(appid, next);
    },
    [appid],
  );

  const toggle = useCallback(
    (id: string) => save(pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id]),
    [pins, save],
  );

  return { pins, toggle, save };
}
