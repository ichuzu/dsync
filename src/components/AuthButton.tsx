import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useSteam } from "@/hooks/useSteam";
import { LogIn, LogOut, User, Loader2 } from "lucide-react";

export const AuthButton = () => {
  const { user, loading, signInDemo, signOut: signOutDemo } = useAuth();
  const steam = useSteam();

  const busy = steam.status === "verifying";

  // Signed in with Steam — show the real Steam identity.
  if (steam.connected) {
    const name = steam.profile?.name ?? "Steam user";
    return (
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 sm:flex">
          <Avatar className="h-7 w-7">
            <AvatarImage src={steam.profile?.avatar} alt={name} />
            <AvatarFallback className="bg-primary/15 text-primary">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[10rem] truncate text-sm text-foreground">{name}</span>
        </div>
        <Button variant="outline" size="sm" onClick={steam.signOut}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    );
  }

  // Demo (Supabase) session.
  if (user) {
    const meta = user.user_metadata || {};
    const name = meta.name || user.email?.split("@")[0] || "Player";
    return (
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 sm:flex">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/15 text-primary">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[10rem] truncate text-sm text-foreground">{name}</span>
        </div>
        <Button variant="outline" size="sm" onClick={signOutDemo}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled>
        Loading…
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="steam" size="sm" onClick={steam.signIn} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        <span className="hidden sm:inline">Sign in with Steam</span>
        <span className="sm:hidden">Steam</span>
      </Button>
      <Button variant="outline" size="sm" onClick={signInDemo}>
        Demo
      </Button>
    </div>
  );
};
