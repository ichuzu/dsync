import { useCallback, useEffect, useState } from "react";
import { Settings, Check, Loader2, ExternalLink, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { getDesktop, isDesktop } from "@/lib/desktop";
import { useSteam } from "@/hooks/useSteam";
import { toast } from "@/hooks/use-toast";
import type { DesktopSettings as DesktopSettingsType, OverlayCorner, RedactedSettings } from "../../electron/ipc";
import { OVERLAY_HOTKEY_LABEL } from "@/pages/Overlay";
import { cn } from "@/lib/utils";

/**
 * Desktop-only preferences.
 *
 * The Steam Web API key lives here rather than in a .env file because a
 * packaged app has no .env to edit: the main process keeps it in its settings
 * file and never sends it back, so this dialog can only ever tell you *whether*
 * one is set, not what it is.
 */
export const DesktopSettings = () => {
  const steam = useSteam();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<RedactedSettings | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const bridge = getDesktop();
    if (!bridge) return;
    setSettings(await bridge.getSettings());
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!isDesktop()) return null;

  const patch = async (change: Parameters<NonNullable<ReturnType<typeof getDesktop>>["setSettings"]>[0]) => {
    const bridge = getDesktop();
    if (!bridge) return;
    setSettings(await bridge.setSettings(change));
  };

  const saveKey = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await patch({ steamApiKey: trimmed });
      setKey("");
      toast({
        title: "Steam API key saved",
        description: "Reloading your library…",
      });
      // The key is read per-request in the main process, so a refresh is all
      // that's needed — no restart.
      steam.refresh();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const hasKey = settings?.hasSteamApiKey ?? false;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            These apply to the desktop app on this machine.
          </DialogDescription>
        </DialogHeader>

        {/* Steam API key */}
        <div className="space-y-2">
          <Label htmlFor="steam-key" className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5" />
            Steam Web API key
            {hasKey && (
              <span className="ml-auto flex items-center gap-1 text-xs font-normal text-success">
                <Check className="h-3.5 w-3.5" /> configured
              </span>
            )}
          </Label>

          <div className="flex gap-2">
            <Input
              id="steam-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={hasKey ? "•••••••• (replace)" : "Paste your key"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveKey();
              }}
            />
            <Button onClick={() => void saveKey()} disabled={!key.trim() || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Needed to read your profile, library and achievements. It is stored on
            this machine and never sent to the page.{" "}
            <a
              href="https://steamcommunity.com/dev/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Get a key <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>

        <Separator />

        <OverlaySettings settings={settings} patch={patch} />

        <Separator />

        <div className="space-y-4">
          <Toggle
            id="launch-on-login"
            label="Start with Windows"
            hint="Launch Dsync to the tray when you sign in."
            checked={settings?.launchOnLogin ?? false}
            onChange={(v) => void patch({ launchOnLogin: v })}
          />
          <Toggle
            id="minimise-to-tray"
            label="Close to tray"
            hint="Closing the window keeps Dsync running in the background."
            checked={settings?.minimiseToTray ?? true}
            onChange={(v) => void patch({ minimiseToTray: v })}
          />
          <Toggle
            id="notifications"
            label="Notifications"
            hint="Tell me when a download finishes or a game starts."
            checked={settings?.notifications ?? true}
            onChange={(v) => void patch({ notifications: v })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

const CORNERS: Array<{ value: OverlayCorner; label: string }> = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

/**
 * The in-game overlay is configured here, once, so the overlay itself can
 * stay free of buttons. Moving it to a custom spot, notes and pins happen in
 * the overlay's edit mode (OVERLAY_HOTKEY_LABEL).
 */
const OverlaySettings = ({
  settings,
  patch,
}: {
  settings: RedactedSettings | null;
  patch: (change: Partial<DesktopSettingsType>) => Promise<void>;
}) => {
  const [opacity, setOpacity] = useState(settings?.overlayOpacity ?? 0.88);
  useEffect(() => setOpacity(settings?.overlayOpacity ?? 0.88), [settings?.overlayOpacity]);
  const corner = settings?.overlayCorner ?? "top-left";
  const enabled = settings?.achievementOverlay ?? true;

  return (
    <div className="space-y-3">
      <Toggle
        id="achievement-overlay"
        label="In-game overlay"
        hint={`While a game runs, show the next achievement, your pins and notes on top of it. Press ${OVERLAY_HOTKEY_LABEL} in game to move it, pin achievements or write notes.`}
        checked={enabled}
        onChange={(v) => void patch({ achievementOverlay: v })}
      />
      <div className={cn("space-y-3 pl-1", !enabled && "pointer-events-none opacity-50")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs text-muted-foreground">Position</span>
          {CORNERS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => void patch({ overlayCorner: c.value })}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-colors",
                corner === c.value
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
          {corner === "custom" && (
            <span className="rounded-md border border-primary/60 bg-primary/15 px-2 py-1 text-xs text-primary">
              Custom
            </span>
          )}
        </div>
        <label className="flex items-center gap-2">
          <span className="w-16 text-xs text-muted-foreground">Opacity</span>
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.02}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
            onPointerUp={() => void patch({ overlayOpacity: opacity })}
            onKeyUp={() => void patch({ overlayOpacity: opacity })}
            className="flex-1 accent-[hsl(var(--primary))]"
            aria-label="Overlay opacity"
          />
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{Math.round(opacity * 100)}%</span>
        </label>
      </div>
    </div>
  );
};

const Toggle = ({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div className="space-y-0.5">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
  </div>
);
