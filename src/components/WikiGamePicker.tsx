import { useState } from "react";
import { Check, ChevronsUpDown, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { GuideGame } from "@/lib/gameGuides";

export function WikiGamePicker({ games, active, onSelect }: { games: GuideGame[]; active: GuideGame | null; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="outline" role="combobox" aria-label="Wiki game" aria-expanded={open} className="w-full justify-between sm:w-72"><Gamepad2 className="shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-left">{active?.title ?? "Choose a game"}</span><ChevronsUpDown className="shrink-0 text-muted-foreground" /></Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(360px,calc(100vw-32px))] p-0"><Command><CommandInput placeholder="Search your games…" aria-label="Filter wiki games" /><CommandList><CommandEmpty>No games found.</CommandEmpty><CommandGroup heading="Games">{games.map(game => <CommandItem key={game.id} data-game-id={game.id} value={`${game.title} ${game.id}`} onSelect={() => { onSelect(game.id); setOpen(false); }} className="gap-3 py-3"><Gamepad2 className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{game.title}</span>{game.id === active?.id && <Check className="h-4 w-4 text-primary" />}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
  </Popover>;
}
