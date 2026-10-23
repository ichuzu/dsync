import { Link, NavLink } from "react-router-dom";
import { Library, ListTodo, Newspaper, BarChart3, BookOpen, type LucideIcon } from "lucide-react";
import { AuthButton } from "@/components/AuthButton";
import { DsyncMark } from "@/components/DsyncMark";
import { DsyncWordmark } from "@/components/DsyncWordmark";
import { ThemePicker } from "@/components/ThemePicker";
import { DesktopSettings } from "@/components/DesktopSettings";
import { cn } from "@/lib/utils";

const LINKS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/", label: "Library", icon: Library },
  { to: "/backlog", label: "Backlog", icon: ListTodo },
  { to: "/news", label: "News", icon: Newspaper },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/wiki", label: "Wiki", icon: BookOpen },
];

/** Shared sticky top navigation used across the Library, News, and Stats pages. */
export const AppNav = () => (
  <nav className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-md">
    <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:flex-nowrap sm:gap-4">
      <Link to="/" className="flex shrink-0 items-center" aria-label="Dsync home">
        {/* The wordmark carries the name itself, so no separate text label.
            It is 3.4:1, so narrow screens get the square mark instead. */}
        <DsyncMark className="h-8 w-8 sm:hidden" />
        <DsyncWordmark className="hidden h-8 sm:block" />
      </Link>

      <div className="order-3 flex w-full items-center justify-center gap-1 sm:order-none sm:w-auto">
        {LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            aria-label={label}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                isActive
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <ThemePicker />
        <DesktopSettings />
        <AuthButton />
      </div>
    </div>
  </nav>
);
