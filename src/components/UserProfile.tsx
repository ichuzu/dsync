import { type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSteam } from "@/hooks/useSteam";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Gamepad2, Sparkles } from "lucide-react";

interface UserProfileProps {
  gameCount: number;
  achievementCount: number;
  perfectGames: number;
}

export const UserProfile = ({
  gameCount,
  achievementCount,
  perfectGames,
}: UserProfileProps) => {
  const steam = useSteam();
  const { user } = useAuth();

  if (!steam.connected && !user) return null;

  const isSteam = steam.connected;
  const name = isSteam
    ? steam.profile?.name ?? "Steam user"
    : user?.user_metadata?.name || user?.email?.split("@")[0] || "Player";
  const avatar = isSteam ? steam.profile?.avatar : undefined;

  return (
    <Card className="bg-gradient-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <Avatar className="h-12 w-12 ring-2 ring-primary/30">
          <AvatarImage src={avatar} alt={name} />
          <AvatarFallback className="bg-primary/15 text-primary">
            <User className="h-6 w-6" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-foreground">{name}</h3>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Gamepad2 className="h-3.5 w-3.5" />
            <span className="truncate">
              {isSteam ? "Signed in with Steam" : "Demo account"}
            </span>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-xs">
          Online
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-4 text-center">
        <Stat value={gameCount} label="Games" />
        <Stat value={achievementCount.toLocaleString()} label="Unlocked" />
        <Stat
          value={perfectGames}
          label="Perfect"
          icon={<Sparkles className="h-3 w-3 text-rarity-legendary" />}
        />
      </div>
    </Card>
  );
};

const Stat = ({
  value,
  label,
  icon,
}: {
  value: number | string;
  label: string;
  icon?: ReactNode;
}) => (
  <div>
    <div className="flex items-center justify-center gap-1 text-lg font-bold text-foreground">
      {icon}
      {value}
    </div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);
