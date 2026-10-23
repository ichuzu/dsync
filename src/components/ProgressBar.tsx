import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** Completion, 0–100. Values outside the range are clamped. */
  value: number;
  /** Classes for the track — override `h-*` to change the bar's thickness. */
  className?: string;
  /** Classes for the filled portion, e.g. `bg-rarity-legendary` for a 100%. */
  barClassName?: string;
  /** Describes what is progressing, for screen readers. */
  label?: string;
}

/**
 * A plain two-div progress bar.
 *
 * Deliberately not the Radix-backed <Progress /> primitive: the bar appears
 * once per game in a list that can run to thousands of rows, and it needs a
 * per-instance fill color (gold on a perfect game), which Progress hard-codes
 * to `bg-primary`.
 */
export const ProgressBar = ({ value, className, barClassName, label }: ProgressBarProps) => {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-[width] duration-500", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};
