import { AppNav } from "@/components/AppNav";
import { GameWiki } from "@/components/GameWiki";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSteam } from "@/hooks/useSteam";
import { useDesktop } from "@/hooks/useDesktop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompletionTimes } from "@/components/CompletionTimes";
import { WikiGamePicker } from "@/components/WikiGamePicker";
import { BookOpen, Radio, ExternalLink, Gamepad2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { GUIDE_GAMES, sourceFor, pcWikiUrl, type GuideGame } from "@/lib/gameGuides";
import { useWikiSource } from "@/hooks/useWikiSource";
import { Loader2 } from "lucide-react";

function savedChoice(): GuideGame | null {
  try { const saved = JSON.parse(localStorage.getItem("dsync.wiki.selected-game") ?? "null"); return typeof saved?.id === "string" && typeof saved?.title === "string" ? saved : null; } catch { return null; }
}

/** Paste a wiki address to read it in Dsync; it must be a MediaWiki (Fandom, wiki.gg, …). */
function ChooseWikiForm({ onChoose, compact = false }: { onChoose: (url: string) => Promise<string | null>; compact?: boolean }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return <form className="space-y-2" onSubmit={async event => { event.preventDefault(); setBusy(true); setNotice(""); const error = await onChoose(draft.trim()); setBusy(false); setNotice(error ?? ""); if (!error) setDraft(""); }}>
    <div className="flex flex-wrap gap-2"><Input className="min-w-0 flex-1" aria-label="Wiki address" placeholder={compact ? "Wiki address" : "https://yourgame.fandom.com"} value={draft} onChange={event => setDraft(event.target.value)} /><Button type="submit" variant="outline" size={compact ? "sm" : "default"} disabled={busy || !draft.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use this wiki"}</Button></div>
    {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </form>;
}

function NoWiki({ game, onChoose }: { game: GuideGame; onChoose: (url: string) => Promise<string | null> }) {
  return <section className="space-y-4 rounded-xl border border-border bg-card p-5"><h1 className="text-xl font-semibold">{game.title} wiki</h1><p className="text-sm text-muted-foreground">Dsync couldn't find a wiki for this game. If it has one on Fandom, wiki.gg or another MediaWiki site, paste its address to read it here.</p><ChooseWikiForm onChoose={onChoose} /><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><a href={`https://duckduckgo.com/?q=${encodeURIComponent(`${game.title} wiki`)}`} target="_blank" rel="noreferrer">Search the web for a wiki</a></Button><Button asChild variant="outline" size="sm"><a href={pcWikiUrl(game.title)} target="_blank" rel="noreferrer">PC fixes & compatibility</a></Button></div></section>;
}

export default function Wiki() {
  const steam = useSteam();
  const desktop = useDesktop();
  const [params, setParams] = useSearchParams();
  const [manual, setManual] = useState<GuideGame | null>(() => params.get("game") ? { id: params.get("game")!, title: params.get("title") || GUIDE_GAMES.find(game => game.id === params.get("game"))?.title || "Selected game" } : savedChoice());
  const [follow, setFollow] = useState(!params.has("game"));
  const runningId = desktop.desktop ? desktop.runningAppId : steam.presence?.inGame ? steam.presence.gameId : null;
  const games = useMemo(() => {
    const entries = new Map<string, GuideGame>(GUIDE_GAMES.map(game => [game.id, game]));
    desktop.installed.forEach(game => entries.set(game.appid, { id: game.appid, title: game.name }));
    steam.library.forEach(game => entries.set(game.id, game));
    if (manual && !entries.has(manual.id)) entries.set(manual.id, manual);
    if (runningId && !entries.has(runningId)) entries.set(runningId, { id: runningId, title: steam.presence?.gameName || `Steam game ${runningId}` });
    return [...entries.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [desktop.installed, steam.library, steam.presence?.gameName, manual, runningId]);
  const running = games.find(game => game.id === runningId);
  const active = follow && running ? running : manual ? games.find(game => game.id === manual.id) ?? manual : null;
  const wiki = useWikiSource(active);
  const source = wiki.source;
  useEffect(() => { if (manual) { try { localStorage.setItem("dsync.wiki.selected-game", JSON.stringify(manual)); } catch { /* Session selection remains usable. */ } } }, [manual]);
  const choose = (id: string) => { setManual(games.find(game => game.id === id) ?? null); setFollow(false); setParams({}, { replace: true }); };
  return <div className="min-h-screen"><AppNav /><main className="container mx-auto space-y-6 px-4 py-6">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
      <div><h1 className="flex items-center gap-2 text-xl font-semibold"><BookOpen className="h-5 w-5 text-primary" /> Game wiki</h1><p className="mt-1 text-xs text-muted-foreground">Items, locations and guides for your next session.</p></div>
      <div className="flex w-full flex-wrap items-center gap-4 sm:w-auto"><label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={follow} onCheckedChange={setFollow} aria-label="Follow current game" />Follow current game</label><WikiGamePicker games={games} active={active} onSelect={choose} /></div>
    </header>
    {active ? <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_272px]">
      <div className="min-w-0">{source ? <GameWiki key={`${active.id}:${source.id}`} game={active} source={source} /> : wiki.searching ? <p className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Looking for the {active.title} wiki…</p> : <NoWiki key={active.id} game={active} onChoose={wiki.choose} />}</div>
      <aside className="space-y-4 lg:sticky lg:top-24" aria-label="Game information">
        <div className="space-y-3 rounded-xl border border-border bg-card p-4"><p className="flex items-center gap-2 text-xs font-medium"><Radio size={14} className={running ? "text-success" : "text-muted-foreground"} />{follow && running ? "Following your game" : "Your selection"}</p><p className="truncate text-sm font-semibold">{active.title}</p><p className="text-xs leading-relaxed text-muted-foreground">{follow && running ? "The wiki switches when you change games." : running ? `Playing ${running.title}. Auto-follow is off.` : follow ? "Auto-follow is ready when you launch a game." : "Choose another game above, or turn on auto-follow."}</p>{source && <a href={source.pageBase} target="_blank" rel="noreferrer" className="flex items-center justify-between border-t border-border pt-3 text-xs text-primary">{source.name}<ExternalLink size={12} /></a>}{source && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer hover:text-foreground">Use a different wiki</summary><div className="mt-2 space-y-2"><ChooseWikiForm compact onChoose={wiki.choose} />{wiki.isChosen && <button type="button" className="text-primary hover:underline" onClick={wiki.reset}>Go back to the automatic choice</button>}</div></details>}</div>
        <CompletionTimes key={`times-${active.id}`} game={active} />
      </aside>
    </div> : <section className="rounded-xl border border-border bg-card p-5 sm:p-8"><div className="mb-6"><h2 className="text-lg font-semibold">Choose your game</h2><p className="mt-1 text-sm text-muted-foreground">Search your library above, or start with a connected wiki.</p></div><div className="grid gap-3 sm:grid-cols-3">{GUIDE_GAMES.filter(game => sourceFor(game)).map(game => <button key={game.id} onClick={() => choose(game.id)} className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Gamepad2 className="h-5 w-5 shrink-0 text-primary" /><span><span className="block text-sm font-semibold">{game.title}</span><span className="mt-1 block text-xs text-muted-foreground">Browse wiki →</span></span></button>)}</div></section>}
  </main></div>;
}
