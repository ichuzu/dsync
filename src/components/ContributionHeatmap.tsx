import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface ContributionHeatmapProps {
  /** date (YYYY-MM-DD) → unlock count */
  activityByDay: Record<string, number>;
  year: number;
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LEVELS = ["bg-muted", "bg-primary/25", "bg-primary/50", "bg-primary/75", "bg-primary"];

const level = (n: number): number =>
  n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4;

interface Cell {
  date: string;
  count: number;
  inYear: boolean;
}

export const ContributionHeatmap = ({
  activityByDay,
  year,
  selectedDay,
  onSelectDay,
}: ContributionHeatmapProps) => {
  const { weeks, monthLabels } = useMemo(() => {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));
    const cursor = new Date(start);
    cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay()); // back to Sunday

    const weeks: Cell[][] = [];
    while (cursor <= end) {
      const week: Cell[] = [];
      for (let d = 0; d < 7; d++) {
        const iso = cursor.toISOString().slice(0, 10);
        week.push({
          date: iso,
          count: activityByDay[iso] ?? 0,
          inYear: cursor.getUTCFullYear() === year,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      weeks.push(week);
    }

    // Month label above the first week that starts a new month.
    let lastMonth = -1;
    const monthLabels = weeks.map((week) => {
      const first = week.find((c) => c.inYear);
      if (!first) return "";
      const m = new Date(first.date + "T00:00:00Z").getUTCMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        return MONTHS[m];
      }
      return "";
    });

    return { weeks, monthLabels };
  }, [activityByDay, year]);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex flex-col gap-1">
        {/* Month labels */}
        <div className="flex gap-[3px] pl-0 text-[10px] text-muted-foreground">
          {monthLabels.map((label, i) => (
            <div key={i} className="w-[13px] shrink-0 whitespace-nowrap">
              {label}
            </div>
          ))}
        </div>

        {/* Week columns */}
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell, di) =>
                cell.inYear ? (
                  <button
                    key={di}
                    type="button"
                    onClick={() => onSelectDay(selectedDay === cell.date ? null : cell.date)}
                    title={`${cell.date}: ${cell.count} ${cell.count === 1 ? "unlock" : "unlocks"}`}
                    className={cn(
                      "h-[13px] w-[13px] rounded-[3px] transition-transform hover:scale-110",
                      LEVELS[level(cell.count)],
                      selectedDay === cell.date && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                    )}
                  />
                ) : (
                  <div key={di} className="h-[13px] w-[13px]" />
                ),
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          <span>Less</span>
          {LEVELS.map((c, i) => (
            <span key={i} className={cn("h-[11px] w-[11px] rounded-[2px]", c)} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
};
