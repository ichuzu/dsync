import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { CheckSquare, Heading, List, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small line-based notes editor with slash commands, for game notes.
 *
 * Each line is plain text or a block: a to-do (checkbox), heading, bullet or
 * divider. Typing "/" at the start of a line opens a command menu; the usual
 * Markdown prefixes ("[] ", "# ", "- ", "---") convert a line too. Enter on
 * a to-do or bullet continues the list, and on an empty one ends it;
 * Backspace at the start of a block turns it back into text.
 *
 * The value is plain Markdown ("- [ ] task", "- [x] done", "# Heading",
 * "- bullet", "---"), so notes written before this existed still read fine.
 */

type Kind = "text" | "todo" | "heading" | "bullet" | "divider";

interface Line {
  id: number;
  kind: Kind;
  text: string;
  done?: boolean;
}

const COMMANDS: Array<{ kind: Exclude<Kind, "text">; name: string; label: string; icon: typeof CheckSquare }> = [
  { kind: "todo", name: "todo", label: "To-do", icon: CheckSquare },
  { kind: "heading", name: "heading", label: "Heading", icon: Heading },
  { kind: "bullet", name: "bullet", label: "Bullet", icon: List },
  { kind: "divider", name: "divider", label: "Divider", icon: Minus },
];

let nextId = 1;
const line = (kind: Kind = "text", text = "", done = false): Line => ({ id: nextId++, kind, text, done });

export function parseNotes(value: string): Line[] {
  if (!value.trim()) return [line()];
  return value.split("\n").map((raw) => {
    let m: RegExpMatchArray | null;
    if ((m = raw.match(/^\s*[-*] \[( |x|X)\] ?(.*)$/))) return line("todo", m[2], m[1].toLowerCase() === "x");
    if ((m = raw.match(/^#{1,3} (.*)$/))) return line("heading", m[1]);
    if (/^\s*-{3,}\s*$/.test(raw)) return line("divider");
    if ((m = raw.match(/^\s*[-*•] (.*)$/))) return line("bullet", m[1]);
    return line("text", raw);
  });
}

export function serializeNotes(lines: Line[]): string {
  const out = lines.map((l) =>
    l.kind === "todo"
      ? `- [${l.done ? "x" : " "}] ${l.text}`
      : l.kind === "heading"
        ? `# ${l.text}`
        : l.kind === "bullet"
          ? `- ${l.text}`
          : l.kind === "divider"
            ? "---"
            : l.text,
  );
  // Trailing empty text lines carry nothing.
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** Markdown-style prefixes that convert a line as they are typed. */
const SHORTCUTS: Array<[RegExp, Kind]> = [
  [/^\[ ?\] /, "todo"],
  [/^# /, "heading"],
  [/^[-*] /, "bullet"],
];

export function NotesEditor({
  value,
  onChange,
  placeholder = "Type / for commands",
  compact = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
  className?: string;
}) {
  const [lines, setLines] = useState<Line[]>(() => parseNotes(value));
  const lastEmitted = useRef(value);
  const refs = useRef(new Map<number, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: number; caret: number | "end" } | null>(null);
  const [menu, setMenu] = useState<{ id: number; index: number } | null>(null);
  const [focused, setFocused] = useState(false);

  // Adopt outside changes (the other window, another game) when not typing here.
  useEffect(() => {
    if (value !== lastEmitted.current && !focused) {
      lastEmitted.current = value;
      setLines(parseNotes(value));
    }
  }, [value, focused]);

  const commit = (next: Line[]) => {
    setLines(next);
    const text = serializeNotes(next);
    lastEmitted.current = text;
    onChange(text);
  };

  useLayoutEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    const el = refs.current.get(want.id);
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
    const at = want.caret === "end" ? el.value.length : want.caret;
    el.setSelectionRange(at, at);
  });

  // Grow each line to fit its text.
  useLayoutEffect(() => {
    refs.current.forEach((el) => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [lines]);

  const menuQuery = (l: Line) => (/^\/\w*$/.test(l.text) ? l.text.slice(1).toLowerCase() : null);
  const matches = (q: string) => COMMANDS.filter((c) => c.name.startsWith(q) || c.label.toLowerCase().startsWith(q));

  const update = (id: number, patch: Partial<Line>) => commit(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const applyCommand = (id: number, kind: Exclude<Kind, "text">) => {
    setMenu(null);
    const at = lines.findIndex((l) => l.id === id);
    if (kind === "divider") {
      // A divider is its own row; keep typing on a fresh line below it.
      const after = line();
      const next = [...lines];
      next.splice(at, 1, { ...lines[at], kind: "divider", text: "" }, after);
      pendingFocus.current = { id: after.id, caret: 0 };
      commit(next);
      return;
    }
    pendingFocus.current = { id, caret: 0 };
    update(id, { kind, text: "", done: false });
  };

  const onText = (l: Line, text: string) => {
    // Markdown prefixes only convert plain lines ("- " inside a to-do is text).
    if (l.kind === "text") {
      for (const [pattern, kind] of SHORTCUTS) {
        if (pattern.test(text)) {
          pendingFocus.current = { id: l.id, caret: 0 };
          update(l.id, { kind, text: text.replace(pattern, "") });
          return;
        }
      }
      if (/^-{3}$/.test(text)) return applyCommand(l.id, "divider");
    }
    // Slash commands work at the start of any line.
    const command = text.match(/^\/(\w+) $/);
    const exact = command && COMMANDS.find((c) => c.name === command[1].toLowerCase());
    if (exact) return applyCommand(l.id, exact.kind);
    setMenu(/^\/\w*$/.test(text) ? { id: l.id, index: 0 } : null);
    update(l.id, { text });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, l: Line, index: number) => {
    const el = event.currentTarget;
    const caret = el.selectionStart;
    const atStart = caret === 0 && el.selectionEnd === 0;

    const query = menu?.id === l.id ? menuQuery(l) : null;
    const options = query !== null ? matches(query) : [];
    if (query !== null && options.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setMenu({ id: l.id, index: (menu!.index + step + options.length) % options.length });
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        applyCommand(l.id, options[Math.min(menu!.index, options.length - 1)].kind);
        return;
      }
      if (event.key === "Escape") {
        setMenu(null);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // Enter on an empty list item ends the list.
      if ((l.kind === "todo" || l.kind === "bullet") && !l.text) {
        update(l.id, { kind: "text" });
        return;
      }
      const keepKind: Kind = l.kind === "todo" || l.kind === "bullet" ? l.kind : "text";
      const after = line(keepKind, l.text.slice(caret));
      const next = [...lines];
      next.splice(index, 1, { ...l, text: l.text.slice(0, caret) }, after);
      pendingFocus.current = { id: after.id, caret: 0 };
      commit(next);
      return;
    }

    if (event.key === "Backspace" && atStart) {
      if (l.kind !== "text") {
        event.preventDefault();
        pendingFocus.current = { id: l.id, caret: 0 };
        update(l.id, { kind: "text", done: false });
        return;
      }
      if (index > 0) {
        event.preventDefault();
        const prev = lines[index - 1];
        const next = [...lines];
        if (prev.kind === "divider") {
          next.splice(index - 1, 1);
          pendingFocus.current = { id: l.id, caret: 0 };
        } else {
          next.splice(index - 1, 2, { ...prev, text: prev.text + l.text });
          pendingFocus.current = { id: prev.id, caret: prev.text.length };
        }
        commit(next);
      }
      return;
    }

    if (event.key === "ArrowUp" && atStart) {
      const prev = [...lines.slice(0, index)].reverse().find((x) => x.kind !== "divider");
      if (prev) {
        event.preventDefault();
        pendingFocus.current = { id: prev.id, caret: "end" };
        setLines([...lines]);
      }
    }
    if (event.key === "ArrowDown" && caret === el.value.length) {
      const nextLine = lines.slice(index + 1).find((x) => x.kind !== "divider");
      if (nextLine) {
        event.preventDefault();
        pendingFocus.current = { id: nextLine.id, caret: 0 };
        setLines([...lines]);
      }
    }
  };

  const isEmpty = lines.length === 1 && lines[0].kind === "text" && !lines[0].text;
  const textSize = compact ? "text-[11.5px] leading-snug" : "text-[13px] leading-relaxed";

  return (
    <div
      className={cn("relative", className)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setFocused(false);
          setMenu(null);
        }
      }}
    >
      {lines.map((l, index) => {
        if (l.kind === "divider") {
          return <hr key={l.id} className="my-1.5 border-border" />;
        }
        const query = menu?.id === l.id ? menuQuery(l) : null;
        const options = query !== null ? matches(query) : [];
        return (
          <div key={l.id}>
          <div className="flex items-start gap-1.5">
            {l.kind === "todo" && (
              <input
                type="checkbox"
                checked={Boolean(l.done)}
                onChange={() => update(l.id, { done: !l.done })}
                aria-label={l.done ? "Mark not done" : "Mark done"}
                className={cn("shrink-0 cursor-pointer accent-[hsl(var(--primary))]", compact ? "mt-[3px] h-3 w-3" : "mt-[5px] h-3.5 w-3.5")}
              />
            )}
            {l.kind === "bullet" && <span className={cn("shrink-0 select-none text-muted-foreground", compact ? "pl-0.5" : "pl-1")}>•</span>}
            <textarea
              ref={(el) => {
                if (el) refs.current.set(l.id, el);
                else refs.current.delete(l.id);
              }}
              rows={1}
              value={l.text}
              onChange={(event) => onText(l, event.target.value.replace(/\n/g, " "))}
              onKeyDown={(event) => onKeyDown(event, l, index)}
              placeholder={isEmpty ? placeholder : l.kind === "heading" ? "Heading" : l.kind === "todo" ? "To-do" : ""}
              spellCheck
              className={cn(
                "w-full resize-none overflow-hidden bg-transparent py-0.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none",
                textSize,
                l.kind === "heading" && (compact ? "text-[12.5px] font-semibold" : "text-[14px] font-semibold"),
                l.kind === "todo" && l.done && "text-muted-foreground line-through",
              )}
            />
          </div>
            {/* In the flow rather than floating, so the overlay window grows to
                show it instead of clipping it. */}
            {options.length > 0 && (
              <ul
                role="listbox"
                className="mb-1 mt-0.5 w-44 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
              >
                {options.map((c, i) => (
                  <li key={c.kind}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === menu!.index}
                      // mousedown, so the textarea keeps focus until the pick lands
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applyCommand(l.id, c.kind);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-2 py-1 text-left text-xs",
                        i === menu!.index ? "bg-primary/15 text-primary" : "text-foreground hover:bg-muted",
                      )}
                    >
                      <c.icon className="h-3.5 w-3.5" />
                      {c.label}
                      <span className="ml-auto text-[10px] text-muted-foreground">/{c.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Done/total for the to-dos in some notes, or null if there are none. */
export function todoProgress(value: string): { done: number; total: number } | null {
  const todos = parseNotes(value).filter((l) => l.kind === "todo");
  return todos.length ? { done: todos.filter((t) => t.done).length, total: todos.length } : null;
}

