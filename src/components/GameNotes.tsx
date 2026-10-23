import { useEffect, useRef, useState } from "react";
import { NotesEditor } from "@/components/NotesEditor";
import { cn } from "@/lib/utils";

/**
 * Free-form notes for a game ("did the first part of the 3-key puzzle"),
 * saved as you type. Kept in localStorage per appid, which the main window
 * and the in-game overlay share (same origin), so a note written over the
 * game shows up in the game's details panel too and vice versa. Editing is
 * NotesEditor: to-dos, headings, bullets and dividers via "/" commands.
 */

const key = (appid: string) => `dsync.notes.${appid}`;

export const readNotes = (appid: string): string => {
  try {
    return localStorage.getItem(key(appid)) ?? "";
  } catch {
    return "";
  }
};

export function GameNotes({
  appid,
  className,
  placeholder = "Progress, routes, codes… type / for commands",
  compact = false,
}: {
  appid: string;
  className?: string;
  placeholder?: string;
  /** One line when empty, growing with the text (the in-game overlay). */
  compact?: boolean;
}) {
  const [text, setText] = useState(() => readNotes(appid));
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setText(readNotes(appid));
    setStatus("");
  }, [appid]);

  // Pick up edits made in the other window.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key(appid)) setText(event.newValue ?? "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [appid]);

  const change = (value: string) => {
    setText(value);
    setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (value.trim()) localStorage.setItem(key(appid), value);
        else localStorage.removeItem(key(appid));
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, 400);
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className={cn(
          "rounded-md border bg-background/60 focus-within:ring-1 focus-within:ring-primary",
          compact
            ? "border-transparent px-1.5 py-0.5 hover:border-border focus-within:border-border"
            : "min-h-[6rem] border-border px-2.5 py-1.5",
        )}
      >
        <NotesEditor value={text} onChange={change} placeholder={placeholder} compact={compact} />
      </div>
      <p className={cn("text-right text-[10px] text-muted-foreground", compact ? "h-2.5 leading-none" : "h-3")} role="status">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save on this device" : ""}
      </p>
    </div>
  );
}
