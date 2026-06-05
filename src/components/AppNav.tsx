import { Link, NavLink } from "react-router-dom";
import { Gamepad2, Library, Newspaper, BarChart3, type LucideIcon } from "lucide-react";
import { AuthButton } from "@/components/AuthButton";
import { cn } from "@/lib/utils";

const LINKS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/", label: "Library", icon: Library },
  { to: "/news", label: "News", icon: Newspaper },
  { to: "/stats", label: "Stats", icon: BarChart3 },
];

/** Shared sticky top navigation used across the Library, News, and Stats pages. */
export const AppNav = () => (
  <nav className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-md">
    <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
      <Link to="/" className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
          <Gamepad2 className="h-5 w-5" />
        </span>
        <span className="hidden text-lg font-bold tracking-tight text-foreground sm:inline">
          Dsync
        </span>
      </Link>

      <div className="flex items-center gap-1">
        {LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
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

      <div className="flex items-center gap-3">
        <AuthButton />
      </div>
    </div>
  </nav>
);
