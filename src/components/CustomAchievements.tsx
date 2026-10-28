import { useState, type FormEvent } from "react";
import { CheckCircle2, Circle, Plus, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ProgressBar";
import { useCustomAchievements } from "@/lib/customAchievements";
import { cn } from "@/lib/utils";

/**
 * The player's own achievements for a non-Steam game: add goals, tick them
 * off, remove them. The first unticked one shows in the in-game overlay as
 * "up next", like a Steam achievement would.
 */
export function CustomAchievements({ appid }: { appid: string }) {
  const { list, add, toggle, remove } = useCustomAchievements(appid);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const earned = list.filter((a) => a.unlocked).length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    add(name, description);
    setName("");
    setDescription("");
  };

  return (
    <section className="space-y-3" aria-label="Your achievements">
      <div className="flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Trophy size={15} className="text-primary" /> Your achievements
        </h3>
        {list.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {earned}/{list.length}
          </span>
        )}
      </div>
      {list.length > 0 && <ProgressBar value={(earned / list.length) * 100} className="h-1.5" />}

      <p className="text-xs text-muted-foreground">
        Steam has no achievements for non-Steam games, so set your own goals. The next one shows in the
        in-game overlay.
      </p>

      {list.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {list.map((a) => (
            <li key={a.id} className="group flex items-start gap-2.5 px-2.5 py-2">
              <button
                type="button"
                onClick={() => toggle(a.id)}
                aria-label={a.unlocked ? `Mark ${a.name} as not done` : `Mark ${a.name} as done`}
                className={cn("mt-0.5 shrink-0", a.unlocked ? "text-success" : "text-muted-foreground hover:text-foreground")}
              >
                {a.unlocked ? <CheckCircle2 size={17} /> : <Circle size={17} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-semibold", a.unlocked && "text-muted-foreground")}>{a.name}</p>
                {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                {a.unlocked && a.unlockedDate && (
                  <p className="text-[11px] text-muted-foreground">Done {a.unlockedDate}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(a.id)}
                aria-label={`Remove ${a.name}`}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New achievement, e.g. Land a 900" aria-label="Achievement name" />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="How to get it (optional)"
          aria-label="Achievement description"
        />
        <Button type="submit" size="sm" disabled={!name.trim()} className="w-full">
          <Plus size={15} className="mr-1.5" /> Add achievement
        </Button>
      </form>
    </section>
  );
}
