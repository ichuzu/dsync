import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Search, ExternalLink, ArrowLeft, Loader2, ImageOff, X, ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchWiki, wikiSearchUrl as sourceSearchUrl, wikiUrl as sourcePageUrl } from "@/lib/wiki";
import { readArticle } from "@/lib/wikiReader";
import { WARFRAME_WIKI, type WikiSource, type GuideGame } from "@/lib/gameGuides";
import gamePlaceholder from "@/assets/game-placeholder.jpg";

const SAVED_KEY = "dsync.wiki.warframe.saved";
function loadSaved(key: string): string[] {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(data) ? data.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  } catch { return []; }
}

function WikiImage({ source, title }: { source?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-muted/50 p-2">
    {source && !failed ? <img src={source} alt={`${title} reference`} className="h-full w-full object-contain" onError={() => setFailed(true)} /> : <div className="flex flex-col items-center gap-1 text-muted-foreground"><ImageOff size={20} /><span className="text-[10px]">No image</span></div>}
  </div>;
}

/**
 * A game's wiki inside Dsync: search, then read full articles in reader mode
 * (see wikiReader). Links between articles stay in the app; `history` backs
 * the Back button.
 */
export function GameWiki({ game = { id: "230410", title: "Warframe" }, source = WARFRAME_WIKI }: { game?: GuideGame; source?: WikiSource }) {
  const savedKey = source.id === "warframe" ? SAVED_KEY : `dsync.wiki.${source.id}.saved`;
  const wikiUrl = (title: string) => sourcePageUrl(title, source);
  const wikiSearchUrl = (term: string) => sourceSearchUrl(term, source);
  // Wikis without hand-picked starter pages open on their own main page.
  const home = source.starters.length ? null : source.mainPage ?? null;
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [history, setHistory] = useState<string[]>(() => (home ? [home] : []));
  const title = history[history.length - 1] ?? null;
  const [saved, setSaved] = useState(() => loadSaved(savedKey));
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const search = useQuery({ queryKey: ["wiki-visual-search", source.id, term], queryFn: ({ signal }) => searchWiki(term, signal, source), enabled: !title && (!!term || !home), staleTime: 300_000, retry: 1 });
  const article = useQuery({ queryKey: ["wiki-reader", source.id, title], queryFn: ({ signal }) => readArticle(title!, source as Required<Pick<WikiSource, "api" | "pageBase">>, signal), enabled: !!title, staleTime: 3_600_000, retry: 1 });
  const page = title ? article.data : undefined;
  const waitingForInput = input.trim() !== term;
  const busy = title ? article.isLoading : waitingForInput || search.isLoading;
  const error = title ? article.isError : !waitingForInput && search.isError;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTerm(input.trim());
    setHistory([]);
  }
  function openArticle(next: string) { setHistory(prev => [...prev, next]); setSaveError(""); }
  function back() { setHistory(prev => prev.slice(0, -1)); }
  function goHome() { setInput(""); setTerm(""); setHistory(home ? [home] : []); }
  /** In-article links to other articles open here instead of in a browser. */
  function onArticleClick(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest("a[data-wiki-title]");
    if (!link) return;
    event.preventDefault();
    openArticle(link.getAttribute("data-wiki-title")!);
    document.querySelector(".game-wiki")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function toggleSaved() {
    if (!title) return;
    const next = saved.includes(title) ? saved.filter(x => x !== title) : [...saved, title].slice(-100);
    setSaved(next);
    try { localStorage.setItem(savedKey, JSON.stringify(next)); setSaveError(""); }
    catch { setSaveError("Saved for this session only; local storage is unavailable."); }
  }

  return <section className="game-wiki space-y-5" aria-label={`${game.title} wiki`}>
    <header className="flex items-center gap-3">
      <img src={game.coverImage || `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/library_600x900.jpg`} alt={game.title} className="h-16 w-12 rounded object-cover" onError={event => { if (event.currentTarget.src !== gamePlaceholder) event.currentTarget.src = gamePlaceholder; }} />
      <div className="min-w-0"><h2 className="text-lg font-semibold text-foreground">{game.title}</h2><p className="mt-1 text-xs text-muted-foreground">{source.name}</p></div>
    </header>

    <form className="wiki-search flex gap-2" onSubmit={submit} role="search">
      <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input aria-label={`Search the ${game.title} wiki`} placeholder="Search items, bosses, locations or quests…" value={input} maxLength={200} onChange={e => { setInput(e.target.value); setHistory([]); }} className="pl-10 pr-10" />{input && <button type="button" aria-label="Clear wiki search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={goHome}><X size={16} /></button>}</div>
      <Button type="submit">Search</Button>
    </form>

    {saved.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-1 text-xs text-muted-foreground"><Bookmark size={13} /> Saved</span>{saved.map(name => <Button variant="outline" size="sm" key={name} onClick={() => openArticle(name)}>{name}</Button>)}</div>}

    {(busy || error) && <div aria-live="polite" aria-busy={busy}>
      {busy && <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 size={17} className="animate-spin" /> {title ? "Loading article…" : "Searching the wiki…"}</p>}
      {error && <div className="space-y-3 rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{(title ? article.error : search.error) instanceof Error ? (title ? article.error : search.error)!.message : "Couldn't reach the wiki."}</p><div className="flex gap-2"><Button variant="outline" onClick={() => title ? article.refetch() : search.refetch()}>Retry</Button>{history.length > 1 && <Button variant="ghost" onClick={back}><ArrowLeft size={14} /> Back</Button>}<Button variant="link" asChild><a href={title ? wikiUrl(title) : wikiSearchUrl(term)} target="_blank" rel="noreferrer">Open on {source.name} <ExternalLink size={13} /></a></Button></div></div>}
    </div>}

    {!title && !busy && !error && <div className="wiki-results space-y-4">
      <p className="text-xs text-muted-foreground">{term ? (search.data?.length ? `${search.data.length} results for “${term}”` : `No results for “${term}”. Try another name.`) : "Start with one of these"}</p>
      <div className="grid gap-3 md:grid-cols-2">{search.data?.map(result => <button key={result.pageid} className="wiki-result flex min-w-0 items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => openArticle(result.title)}>
        <WikiImage source={result.thumbnail?.source} title={result.title} />
        <span className="min-w-0 flex-1"><span className="block font-semibold text-foreground">{result.title}</span><span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{result.extract || "Open the article for details."}</span><span className="mt-2 flex items-center gap-1 text-xs text-primary">Read <ChevronRight size={12} /></span></span>
      </button>)}</div>
    </div>}

    {page && <article className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {history.length > 1 ? <Button variant="ghost" size="sm" onClick={back}><ArrowLeft size={14} /> Back</Button> : !home && <Button variant="ghost" size="sm" onClick={goHome}><ArrowLeft size={14} /> {term ? "Search results" : "Browse wiki"}</Button>}
        {home && title !== home && <Button variant="ghost" size="sm" onClick={goHome}><Home size={14} /> Wiki home</Button>}
        <Button className="wiki-save ml-auto" variant="outline" size="sm" aria-label={saved.includes(title!) ? "Unsave article" : "Save article"} aria-pressed={saved.includes(title!)} onClick={toggleSaved}><Bookmark size={16} fill={saved.includes(title!) ? "currentColor" : "none"} /> {saved.includes(title!) ? "Saved" : "Save"}</Button>
      </div>
      <h2 className="mb-4 text-2xl font-semibold text-foreground">{page.title}</h2>
      {saveError && <p role="status" className="mb-4 text-xs text-muted-foreground">{saveError}</p>}
      <div className="wiki-reader" onClick={onArticleClick} dangerouslySetInnerHTML={{ __html: page.html }} />
      <footer className="mt-6 space-y-2 border-t border-border pt-4"><a className="inline-flex items-center gap-2 text-sm text-primary hover:underline" href={wikiUrl(page.title)} target="_blank" rel="noreferrer">Open on {source.name} (maps and interactive tools) <ExternalLink size={13} /></a><p className="text-[11px] leading-relaxed text-muted-foreground">Text and images: {source.name} contributors. <a className="underline" href={source.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a>; image rights may differ.</p></footer>
    </article>}
    {!page && <p className="text-[11px] text-muted-foreground">Articles from <a className="text-primary hover:underline" href={source.pageBase} target="_blank" rel="noreferrer">{source.name}</a>. <a className="underline" href={source.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a>; image rights may differ.</p>}
  </section>;
}
