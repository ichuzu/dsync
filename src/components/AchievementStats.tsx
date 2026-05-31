import { Card } from "@/components/ui/card";
import { Award } from "lucide-react";
import { RarityBreakdown } from "@/types/game";
import { cn } from "@/lib/utils";

interface AchievementStatsProps {
  breakdown: RarityBreakdown;
}

const TIERS: Array<{
  key: keyof RarityBreakdown;
  label: string;
  dot: string;
  text: string;
}> = [
  { key: "legendary", label: "Legendary", dot: "bg-rarity-legendary", text: "text-rarity-legendary" },
  { key: "epic", label: "Epic", dot: "bg-rarity-epic", text: "text-rarity-epic" },
  { key: "rare", label: "Rare", dot: "bg-rarity-rare", text: "text-rarity-rare" },
  { key: "uncommon", label: "Uncommon", dot: "bg-rarity-uncommon", text: "text-rarity-uncommon" },
  { key: "common", label: "Common", dot: "bg-rarity-common", text: "text-rarity-common" },
];

export const AchievementStats = ({ breakdown }: AchievementStatsProps) => {
  const total = TIERS.reduce((sum, t) => sum + breakdown[t.key], 0);

  return (
    <Card className="bg-gradient-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-lg bg-primary/15 p-2">
          <Award className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Achievements</h3>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} unlocked by rarity
          </p>
        </div>
      </div>

      {/* Distribution bar */}
      <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-muted">
        {TIERS.map((t) => {
          const pct = total === 0 ? 0 : (breakdown[t.key] / total) * 100;
          if (pct === 0) return null;
          return (
            <span
              key={t.key}
              className={cn("h-full", t.dot)}
              style={{ width: `${pct}%` }}
              title={`${breakdown[t.key]} ${t.label}`}
            />
          );
        })}
      </div>

      <ul className="space-y-2">
        {TIERS.map((t) => (
          <li key={t.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className={cn("h-2.5 w-2.5 rounded-full", t.dot)} />
              {t.label}
            </span>
            <span className={cn("font-semibold tabular-nums", t.text)}>
              {breakdown[t.key].toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
};
