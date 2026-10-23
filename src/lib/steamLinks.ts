import type { MouseEvent } from "react";
import { isDesktop, openInSteam } from "./desktop";
import { toast } from "sonner";

/** Keep website links usable in browsers, but hand desktop clicks to Steam. */
export function openSteamStoreLink(event: MouseEvent<HTMLAnchorElement>, appid: string | number) {
  if (!isDesktop()) return;
  event.preventDefault();
  void openInSteam(String(appid)).catch(() => toast.error("Couldn't open Steam. Check that Steam is installed and try again."));
}
