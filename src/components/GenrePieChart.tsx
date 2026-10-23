import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/theme/ThemeProvider";
import { categoricalPalette } from "@/theme/tokens";

export interface GenreSlice {
  name: string;
  /** Hours played across all games in this genre. */
  hours: number;
}

/**
 * Slice colours come from the active theme (see categoricalPalette), so the
 * chart follows whichever palette the user picked while still alternating
 * cold and warm hues for separation. "Other" is always muted grey.
 */
const OTHER_COLOR = "hsl(var(--muted-foreground))";

const formatHours = (h: number) =>
  h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString();

export const GenrePieChart = ({
  data,
  total,
  loading = false,
  emptyMessage,
}: {
  data: GenreSlice[];
  total: number;
  loading?: boolean;
  emptyMessage: string;
}) => {
  const { config, resolvedMode } = useTheme();
  const palette = useMemo(
    () => categoricalPalette(config, resolvedMode),
    [config, resolvedMode],
  );

  const slices = useMemo(
    () =>
      data.map((d, i) => ({
        ...d,
        pct: total > 0 ? (d.hours / total) * 100 : 0,
        color: d.name === "Other" ? OTHER_COLOR : palette[i % palette.length],
      })),
    [data, total, palette],
  );

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Identifying genres…
      </div>
    );
  }

  if (data.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-6 md:flex-row md:items-center">
      <div className="h-56 w-56 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="hours"
              nameKey="name"
              innerRadius="58%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof slices)[number];
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-card">
                    <div className="font-medium text-foreground">{p.name}</div>
                    <div className="text-muted-foreground">
                      {formatHours(p.hours)}h · {p.pct.toFixed(1)}%
                    </div>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="grid w-full grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 md:flex-1">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{s.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {s.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
