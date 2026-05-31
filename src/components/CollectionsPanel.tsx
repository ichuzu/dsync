import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layers, Plus, X, Library, Folder, Check } from "lucide-react";
import { useCollections } from "@/hooks/useCollections";
import { cn } from "@/lib/utils";

interface CollectionsPanelProps {
  /** "all" means no collection filter is active. */
  selected: string;
  onSelect: (id: string) => void;
}

export const CollectionsPanel = ({ selected, onSelect }: CollectionsPanelProps) => {
  const { collections, create, remove } = useCollections();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    const made = create(name);
    if (made) onSelect(made.id);
    setName("");
    setAdding(false);
  };

  return (
    <Card className="bg-gradient-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/15 p-2">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Collections</h3>
            <p className="text-sm text-muted-foreground">
              {collections.length} {collections.length === 1 ? "collection" : "collections"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setAdding((v) => !v)}
          aria-label="New collection"
        >
          <Plus className={cn("h-4 w-4 transition-transform", adding && "rotate-45")} />
        </Button>
      </div>

      {adding && (
        <div className="mb-3 flex gap-2">
          <Input
            autoFocus
            value={name}
            placeholder="Collection name…"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            className="h-9"
          />
          <Button size="sm" onClick={submit} disabled={!name.trim()}>
            <Check className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="space-y-1">
        <CollectionRow
          active={selected === "all"}
          icon={<Library className="h-4 w-4" />}
          label="All games"
          onClick={() => onSelect("all")}
        />
        {collections.map((c) => (
          <CollectionRow
            key={c.id}
            active={selected === c.id}
            icon={<Folder className="h-4 w-4" />}
            label={c.name}
            count={c.gameIds.length}
            onClick={() => onSelect(c.id)}
            onDelete={() => {
              remove(c.id);
              if (selected === c.id) onSelect("all");
            }}
          />
        ))}
        {collections.length === 0 && !adding && (
          <p className="px-1 pt-1 text-xs text-muted-foreground">
            Create a collection to bundle games — a backlog, favorites, anything.
          </p>
        )}
      </div>
    </Card>
  );
};

const CollectionRow = ({
  active,
  icon,
  label,
  count,
  onClick,
  onDelete,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
  onDelete?: () => void;
}) => (
  <div
    className={cn(
      "group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
      active
        ? "bg-primary/15 text-primary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    )}
    onClick={onClick}
  >
    <span className={active ? "text-primary" : ""}>{icon}</span>
    <span className="flex-1 truncate">{label}</span>
    {typeof count === "number" && (
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    )}
    {onDelete && (
      <button
        type="button"
        aria-label={`Delete ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);
