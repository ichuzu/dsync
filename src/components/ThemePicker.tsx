import { useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Check, Loader2, Monitor, Moon, Palette, RotateCcw, Sun, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PALETTES,
  PALETTE_GROUPS,
  applyPalette,
  matchesPalette,
  type Palette as PaletteDef,
} from "@/theme/palettes";
import { useTheme } from "@/theme/ThemeProvider";
import { resolvedSecondary } from "@/theme/tokens";
import type { ThemeMode } from "@/theme/tokens";
import { cn } from "@/lib/utils";
import { useSteam } from "@/hooks/useSteam";
import { fetchSteamProfileBackground } from "@/lib/steamClient";
import { colorsFromImages } from "@/lib/profileColors";

const MODES: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * A slider whose track shows the range it controls, so the user can aim at a
 * colour instead of hunting for a number.
 */
type ColourRole = "primary" | "secondary" | "accent";

const COLOUR_ROLES: Array<{ role: ColourRole; label: string; className: string }> = [
  { role: "primary", label: "Primary", className: "bg-primary text-primary-foreground" },
  { role: "secondary", label: "Secondary", className: "bg-secondary text-secondary-foreground" },
  { role: "accent", label: "Accent", className: "bg-accent text-accent-foreground" },
];

/** A colour chip: drag it onto another, or click two in turn, to swap them. */
const SwapChip = ({
  role,
  label,
  className,
  picked,
  onPick,
  onDropFrom,
}: {
  role: ColourRole;
  label: string;
  className: string;
  picked: boolean;
  onPick: () => void;
  onDropFrom: (from: ColourRole) => void;
}) => {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      draggable
      onClick={onPick}
      aria-pressed={picked}
      aria-label={`${label} colour: drag or click to swap`}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/x-dsync-colour", role);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("text/x-dsync-colour")) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const from = event.dataTransfer.getData("text/x-dsync-colour") as ColourRole;
        if (from && from !== role) onDropFrom(from);
      }}
      className={cn(
        "flex h-7 flex-1 cursor-grab items-center justify-center rounded-md text-[11px] font-medium active:cursor-grabbing",
        (over || picked) && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
        className,
      )}
    >
      {label}
    </button>
  );
};

const TrackSlider = ({
  label,
  value,
  min,
  max,
  step = 1,
  trackImage,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  trackImage: string;
  suffix?: string;
  onChange: (value: number) => void;
}) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {value}
        {suffix}
      </span>
    </div>
    <SliderPrimitive.Root
      className="relative flex h-5 w-full touch-none select-none items-center"
      value={[value]}
      min={min}
      max={max}
      step={step}
      aria-label={label}
      onValueChange={([next]) => onChange(next)}
    >
      <SliderPrimitive.Track
        className="relative h-2.5 w-full grow overflow-hidden rounded-full border border-border/60"
        style={{ backgroundImage: trackImage }}
      >
        <SliderPrimitive.Range className="absolute h-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-foreground bg-background shadow-sm ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
    </SliderPrimitive.Root>
  </div>
);

/** A full 0-360 rainbow, used as the backdrop for the hue sliders. */
const HUE_TRACK = `linear-gradient(to right, ${Array.from(
  { length: 13 },
  (_, i) => `hsl(${i * 30} 85% 55%)`,
).join(", ")})`;

const PaletteSwatch = ({
  palette,
  active,
  onSelect,
}: {
  palette: PaletteDef;
  active: boolean;
  onSelect: () => void;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "group flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors",
          active
            ? "border-primary/70 bg-primary/10"
            : "border-transparent hover:border-border hover:bg-muted/60",
        )}
      >
        <span
          className="relative flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-inset ring-black/20"
          style={{
            backgroundImage: `linear-gradient(135deg, hsl(${palette.primaryHue} ${palette.primarySat}% 52%) 0%, hsl(${palette.primaryHue} ${palette.primarySat}% 52%) 48%, hsl(${palette.accentHue} ${palette.accentSat}% 56%) 52%, hsl(${palette.accentHue} ${palette.accentSat}% 56%) 100%)`,
          }}
        >
          {active && <Check className="h-4 w-4 text-white drop-shadow" />}
        </span>
        <span className="text-[11px] leading-none text-muted-foreground group-hover:text-foreground">
          {palette.name}
        </span>
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom">{palette.blurb}</TooltipContent>
  </Tooltip>
);

/**
 * Popover for choosing how the app looks: light/dark, a preset palette, and
 * per-hue fine tuning. Every change is live and persists to localStorage.
 */
export const ThemePicker = () => {
  const { config, setConfig, reset, resolvedMode } = useTheme();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const steam = useSteam();
  const [matching, setMatching] = useState(false);
  const [matchNotice, setMatchNotice] = useState("");

  /** Theme colours from the Steam avatar (weighted double) and profile background. */
  const matchProfile = async () => {
    const steamId = steam.profile?.steamId;
    if (!steamId || !steam.profile?.avatar) return;
    setMatching(true);
    setMatchNotice("");
    const background = await fetchSteamProfileBackground(steamId);
    const colors = await colorsFromImages(
      [steam.profile.avatar, background].filter((u): u is string => Boolean(u)),
      [2, 1],
    );
    setMatching(false);
    if (!colors) {
      setMatchNotice("Couldn't read your profile pictures. Try again in a moment.");
      return;
    }
    setConfig({ presetId: "steam-profile", ...colors });
    setMatchNotice(background ? "Matched your avatar and profile background." : "Matched your avatar.");
  };

  const activePalette = PALETTES.find((p) => matchesPalette(config, p));

  /** The hue and intensity a role currently shows (secondary may be derived). */
  const colourOf = (role: ColourRole) =>
    role === "primary"
      ? { hue: config.primaryHue, sat: config.primarySat }
      : role === "accent"
        ? { hue: config.accentHue, sat: config.accentSat }
        : resolvedSecondary(config, resolvedMode);
  const patchFor = (role: ColourRole, raw: { hue: number; sat: number }) => {
    const c = { hue: Math.round(raw.hue), sat: Math.round(raw.sat) };
    return role === "primary"
      ? { primaryHue: c.hue, primarySat: c.sat }
      : role === "accent"
        ? { accentHue: c.hue, accentSat: c.sat }
        : { secondaryHue: c.hue, secondarySat: c.sat };
  };

  /** Two roles trade hue and intensity; the palette becomes "custom". */
  const swapColors = (a: ColourRole, b: ColourRole) => {
    if (a === b) return;
    setConfig({ presetId: "custom", ...patchFor(a, colourOf(b)), ...patchFor(b, colourOf(a)) });
  };
  // Click one chip, then another, to swap them (the keyboard-friendly way).
  const [picked, setPicked] = useState<ColourRole | null>(null);
  const pick = (role: ColourRole) => {
    if (!picked) return setPicked(role);
    if (picked !== role) swapColors(picked, role);
    setPicked(null);
  };
  const secondary = resolvedSecondary(config, resolvedMode);
  const secondaryOwn = config.secondaryHue !== undefined;

  const satTrack = (hue: number) =>
    `linear-gradient(to right, hsl(${hue} 0% 55%), hsl(${hue} 100% 55%))`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="Change colour theme"
        >
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      {/* Capped to the space on screen and scrollable, so "Fine tune" never runs off the bottom. */}
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="max-h-[var(--radix-popover-content-available-height)] w-[320px] overflow-y-auto overscroll-contain p-0"
      >
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
            <p className="text-xs text-muted-foreground">
              {activePalette ? activePalette.name : config.presetId === "steam-profile" ? "Your Steam profile" : "Custom"} &middot; {resolvedMode}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={reset}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>

        <Separator />

        {/* Light / dark / system */}
        <div className="px-4 py-3">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {MODES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setConfig({ mode: value })}
                aria-pressed={config.mode === value}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  config.mode === value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Colours taken from the player's own Steam profile */}
        {steam.connected && steam.profile?.avatar && (
          <>
            <div className="px-3 py-3">
              <button
                type="button"
                onClick={() => void matchProfile()}
                disabled={matching}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  config.presetId === "steam-profile"
                    ? "border-primary/70 bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/60",
                )}
              >
                <img src={steam.profile.avatar} alt="" className="h-9 w-9 shrink-0 rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-foreground">Match my Steam profile</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    Colours from your avatar and profile background
                  </span>
                </span>
                {matching ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <Wand2 className="h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
              {matchNotice && (
                <p className="px-1 pt-1.5 text-[11px] text-muted-foreground" role="status">
                  {matchNotice}
                </p>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* Preset palettes */}
        <div className="space-y-3 px-3 py-3">
          {PALETTE_GROUPS.map((group) => (
            <div key={group}>
              <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">{group}</p>
              <div className="grid grid-cols-4 gap-1">
                {PALETTES.filter((p) => p.group === group).map((palette) => (
                  <PaletteSwatch
                    key={palette.id}
                    palette={palette}
                    active={activePalette?.id === palette.id}
                    onSelect={() => setConfig(applyPalette(config, palette))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* Fine tuning */}
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showAdvanced}
          >
            Fine tune
            <span className="text-[11px]">{showAdvanced ? "Hide" : "Show"}</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3">
              <TrackSlider
                label="Primary hue"
                value={config.primaryHue}
                min={0}
                max={360}
                trackImage={HUE_TRACK}
                onChange={(primaryHue) => setConfig({ presetId: "custom", primaryHue })}
              />
              <TrackSlider
                label="Primary intensity"
                value={config.primarySat}
                min={0}
                max={100}
                suffix="%"
                trackImage={satTrack(config.primaryHue)}
                onChange={(primarySat) => setConfig({ presetId: "custom", primarySat })}
              />
              <TrackSlider
                label="Accent hue"
                value={config.accentHue}
                min={0}
                max={360}
                trackImage={HUE_TRACK}
                onChange={(accentHue) => setConfig({ presetId: "custom", accentHue })}
              />
              <TrackSlider
                label="Secondary hue"
                value={secondary.hue}
                min={0}
                max={360}
                suffix="°"
                trackImage={HUE_TRACK}
                onChange={(hue) => setConfig({ presetId: "custom", secondaryHue: hue, secondarySat: secondary.sat })}
              />
              <TrackSlider
                label="Secondary intensity"
                value={secondary.sat}
                min={0}
                max={100}
                suffix="%"
                trackImage={satTrack(secondary.hue)}
                onChange={(sat) => setConfig({ presetId: "custom", secondaryHue: secondary.hue, secondarySat: sat })}
              />
              {secondaryOwn && (
                <button
                  type="button"
                  onClick={() => setConfig({ secondaryHue: undefined, secondarySat: undefined })}
                  className="-mt-1 text-[11px] text-primary hover:underline"
                >
                  Secondary: follow primary again
                </button>
              )}
              <TrackSlider
                label="Surface tint"
                value={config.neutralHue}
                min={0}
                max={360}
                trackImage={HUE_TRACK}
                onChange={(neutralHue) => setConfig({ presetId: "custom", neutralHue })}
              />
              <TrackSlider
                label="Tint strength"
                value={config.neutralSat}
                min={0}
                max={40}
                suffix="%"
                trackImage={satTrack(config.neutralHue)}
                onChange={(neutralSat) => setConfig({ presetId: "custom", neutralSat })}
              />
              <TrackSlider
                label="Roundness"
                value={config.radius}
                min={0}
                max={1.5}
                step={0.125}
                suffix="rem"
                trackImage="linear-gradient(to right, hsl(var(--muted)), hsl(var(--secondary)))"
                onChange={(radius) => setConfig({ presetId: "custom", radius })}
              />
              <TrackSlider
                label="Angles"
                value={config.angle ?? 0}
                min={0}
                max={20}
                step={1}
                suffix="px"
                trackImage="linear-gradient(to right, hsl(var(--muted)), hsl(var(--secondary)))"
                onChange={(angle) => setConfig({ angle })}
              />
            </div>
          )}
        </div>

        <Separator />

        {/*
          Sample of the surfaces the choice drives. Any two of Primary,
          Secondary and Accent can be swapped: drag one onto another, or click
          one and then the other.
        */}
        <div className="space-y-2 rounded-b-md bg-gradient-card px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 shrink-0 rounded-lg bg-gradient-brand shadow-glow" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">Preview</p>
              <p className="truncate text-[11px] text-muted-foreground">
                How cards and surfaces will look
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {COLOUR_ROLES.map(({ role, label, className }) => (
              <SwapChip
                key={role}
                role={role}
                label={label}
                className={className}
                picked={picked === role}
                onPick={() => pick(role)}
                onDropFrom={(from) => swapColors(from, role)}
              />
            ))}
          </div>
          <p className="text-[10.5px] text-muted-foreground">
            {picked ? "Now click the colour to swap it with." : "Drag a colour onto another, or click two, to swap them."}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};
