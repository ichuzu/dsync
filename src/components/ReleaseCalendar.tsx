import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SteamImage } from "@/components/SteamImage";
import { cn } from "@/lib/utils";
import type { UpcomingGame } from "@/lib/steam";
import { openSteamStoreLink } from "@/lib/steamLinks";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const storeUrl = (appid: number) => `https://store.steampowered.com/app/${appid}`;

/** UTC YYYY-MM-DD, matching how the rest of the app keys days. */
const dayKey = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toISOString().slice(0, 10);

const todayKey = (): string => new Date().toISOString().slice(0, 10);

/** Monday-first weekday offset for the 1st of a month. */
const startOffset = (year: number, month: number): number =>
  (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** A release on the calendar: on the wishlist, or picked from what the user plays. */
export interface CalendarGame extends UpcomingGame {
  kind: "wishlist" | "foryou";
  /** For picks: the tags that earned it a place ("Souls-like", …). */
  reasons?: string[];
}

type Show = "all" | CalendarGame["kind"];

const SHOW: Array<{ key: Show; label: string; dot?: string }> = [
  { key: "all", label: "All" },
  { key: "wishlist", label: "Wishlist", dot: "bg-accent" },
  { key: "foryou", label: "For you", dot: "bg-primary" },
];

/** Chip colours per kind, used in the grid and the undated list alike. */
const CHIP: Record<CalendarGame["kind"], string> = {
  wishlist: "bg-accent/20 hover:bg-accent/40",
  foryou: "bg-primary/15 hover:bg-primary/30",
};

interface ReleaseCalendarProps {
  games: CalendarGame[];
  loading?: boolean;
  emptyMessage: string;
}

/**
 * A month-grid release calendar: wishlisted games plus upcoming games picked
 * from what the user plays, colour-coded and filterable.
 *
 * Only day-precise releases can sit in the grid; Steam's vaguer dates ("Q1
 * 2026", "Coming soon") are listed underneath rather than dropped or pinned to
 * an invented day.
 */
export const ReleaseCalendar = ({ games, loading, emptyMessage }: ReleaseCalendarProps) => {
  const [show, setShow] = useState<Show>("all");
  const visible = useMemo(
    () => (show === "all" ? games : games.filter((g) => g.kind === show)),
    [games, show],
  );

  const { dated, undated } = useMemo(() => {
    const dated: CalendarGame[] = [];
    const undated: CalendarGame[] = [];
    for (const g of visible) {
      if (g.precise && g.releaseDate) dated.push(g);
      else undated.push(g);
    }
    dated.sort((a, b) => a.releaseDate - b.releaseDate);
    return { dated, undated };
  }, [visible]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarGame[]>();
    for (const g of dated) {
      const k = dayKey(g.releaseDate);
      const list = m.get(k);
      if (list) list.push(g);
      else m.set(k, [g]);
    }
    return m;
  }, [dated]);

  // Open on the month holding the next release, so the first thing on screen
  // is the one that matters rather than an empty current month.
  const initial = useMemo(() => {
    const now = Date.now() / 1000;
    const next = dated.find((g) => g.releaseDate >= now) ?? dated[0];
    const d = next ? new Date(next.releaseDate * 1000) : new Date();
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  }, [dated]);

  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);
  const view = cursor ?? initial;

  const step = (delta: number) => {
    const d = new Date(Date.UTC(view.year, view.month + delta, 1));
    setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };

  const cells = useMemo(() => {
    const offset = startOffset(view.year, view.month);
    const total = daysInMonth(view.year, view.month);
    const out: Array<{ key: string; day: number } | null> = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let day = 1; day <= total; day++) {
      const key = `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      out.push({ key, day });
    }
    // Pad to whole weeks so the grid keeps square corners.
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  const monthReleases = useMemo(
    () =>
      dated.filter((g) => {
        const d = new Date(g.releaseDate * 1000);
        return d.getUTCFullYear() === view.year && d.getUTCMonth() === view.month;
      }),
    [dated, view],
  );

  const today = todayKey();

  return (
    <Card className="bg-gradient-card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Release calendar</h3>
        {loading && games.length > 0 && (
          <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}

        <div className="inline-flex rounded-lg border border-border p-0.5">
          {SHOW.map(({ key, label, dot }) => (
            <button
              key={key}
              type="button"
              onClick={() => setShow(key)}
              aria-pressed={show === key}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                show === key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {dot && <span className={cn("h-2 w-2 rounded-full", dot)} />}
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[9rem] text-center text-sm font-medium tabular-nums text-foreground">
            {MONTHS[view.month]} {view.year}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next month"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {cursor && (
            <button
              type="button"
              onClick={() => setCursor(null)}
              className="ml-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Next release
            </button>
          )}
        </div>
      </div>

      {loading && games.length === 0 ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : visible.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {show === "foryou"
            ? "No picks yet. They come from the games you've played the most."
            : emptyMessage}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="bg-background/60 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}
            {cells.map((cell, i) => {
              if (!cell) return <div key={`pad-${i}`} className="min-h-[4.5rem] bg-background/20" />;
              const releases = byDay.get(cell.key) ?? [];
              const isToday = cell.key === today;
              return (
                <div
                  key={cell.key}
                  className={cn(
                    "min-h-[4.5rem] bg-background/40 p-1.5 transition-colors",
                    releases.length > 0 && "bg-primary/5",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 text-[10px] tabular-nums",
                      isToday
                        ? "inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary px-1 font-semibold text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {cell.day}
                  </div>
                  <ul className="space-y-0.5">
                    {releases.slice(0, 2).map((g) => (
                      <li key={g.appid}>
                        <a
                          href={storeUrl(g.appid)}
                          onClick={event => openSteamStoreLink(event, g.appid)}
                          target="_blank"
                          rel="noreferrer"
                          title={g.reasons?.length ? `${g.name} · for you: ${g.reasons.join(", ")}` : g.name}
                          className={cn(
                            "block truncate rounded px-1 py-0.5 text-[10px] leading-tight text-foreground transition-colors",
                            CHIP[g.kind],
                          )}
                        >
                          {g.name}
                        </a>
                      </li>
                    ))}
                    {releases.length > 2 && (
                      <li className="px-1 text-[10px] text-muted-foreground">
                        +{releases.length - 2} more
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* The visible month, spelled out with art */}
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {MONTHS[view.month]} {view.year} &middot; {monthReleases.length}{" "}
              {monthReleases.length === 1 ? "release" : "releases"}
            </h4>
            {monthReleases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing dated for this month. Use the arrows to look around.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {monthReleases.map((g) => (
                  <li key={g.appid}>
                    <a
                      href={storeUrl(g.appid)}
                      onClick={event => openSteamStoreLink(event, g.appid)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                    >
                      <SteamImage
                        appid={g.appid}
                        shape="landscape"
                        alt=""
                        className="h-9 w-16 shrink-0 rounded object-cover"
                        fallback={<div className="h-9 w-16 shrink-0 rounded bg-muted" />}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{g.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {g.kind === "wishlist"
                            ? "On your wishlist"
                            : `For you${g.reasons?.length ? ` · ${g.reasons.join(", ")}` : ""}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {new Date(g.releaseDate * 1000).toLocaleDateString(undefined, {
                          timeZone: "UTC",
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {undated.length > 0 && (
            <div className="mt-5 border-t border-border/60 pt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                No exact date &middot; {undated.length}
              </h4>
              <ul className="flex flex-wrap gap-1.5">
                {undated.map((g) => (
                  <li key={g.appid}>
                    <a
                      href={storeUrl(g.appid)}
                      onClick={event => openSteamStoreLink(event, g.appid)}
                      target="_blank"
                      rel="noreferrer"
                      title={g.reasons?.length ? `${g.name} · for you: ${g.reasons.join(", ")}` : g.name}
                      className={cn(
                        "inline-flex max-w-[16rem] items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                        CHIP[g.kind],
                      )}
                    >
                      <span className="truncate text-foreground">{g.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {g.releaseString?.trim() || "TBA"}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
};
