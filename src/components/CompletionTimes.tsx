import { useState } from "react";
import { Clock, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHltb } from "@/hooks/useHltb";
import type { GuideGame } from "@/lib/gameGuides";

interface Times { main: string; extras: string; complete: string; url: string }
const EMPTY: Times = { main: "", extras: "", complete: "", url: "" };
const fields = [{ key: "main", label: "Main story" }, { key: "extras", label: "Main + extras" }, { key: "complete", label: "Completionist" }] as const;

/**
 * HowLongToBeat times for a game: looked up automatically (useHltb, refreshed
 * daily), with any hours the user typed in overriding that category.
 */
export function CompletionTimes({ game }: { game: GuideGame }) {
  const key = `dsync.completion-times.${game.id}`;
  const [times, setTimes] = useState<Times>(() => {
    try { const data = JSON.parse(localStorage.getItem(key) ?? "null"); return Object.fromEntries(Object.keys(EMPTY).map(field => [field, typeof data?.[field] === "string" ? data[field] : ""])) as unknown as Times; } catch { return EMPTY; }
  });
  const hltb = useHltb([{ id: game.id, title: game.title }]);
  const looked = hltb.times[game.id];
  const looking = hltb.pending > 0 && looked === undefined;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(times);
  const [notice, setNotice] = useState("");
  const hasOverrides = fields.some(({ key }) => times[key]);
  const validUrl = (url: string) => { try { const parsed = new URL(url); return parsed.protocol === "https:" && parsed.hostname === "howlongtobeat.com" && /^\/game\/\d+$/.test(parsed.pathname) && !parsed.username && !parsed.password; } catch { return false; } };
  const url = validUrl(times.url) ? times.url : looked?.url ?? `https://howlongtobeat.com/?q=${encodeURIComponent(game.title)}`;

  // Per category: the user's own figure, else HLTB's (which uses 0 for "no data").
  const shown = (field: (typeof fields)[number]["key"]) => {
    if (times[field]) return { hours: times[field], yours: true };
    const auto = looked?.[field];
    return auto ? { hours: String(auto), yours: false } : null;
  };
  const anyShown = fields.some(({ key }) => shown(key));

  function save() {
    if (fields.some(({ key }) => draft[key] && (!Number.isFinite(Number(draft[key])) || Number(draft[key]) <= 0))) { setNotice("Enter positive hours, or leave a field blank."); return; }
    if (draft.url && !validUrl(draft.url)) { setNotice("Use a HowLongToBeat game link, such as https://howlongtobeat.com/game/123."); return; }
    try { localStorage.setItem(key, JSON.stringify(draft)); setTimes(draft); setEditing(false); setNotice("Saved on this device."); } catch { setNotice("Couldn't save on this device."); }
  }

  return <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Completion times">
    <h2 className="flex items-center gap-2 text-sm font-semibold"><Clock size={16} className="text-primary" /> How long to beat</h2>
    {looking && !anyShown ? (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Looking up HowLongToBeat…</p>
    ) : anyShown ? (
      <dl className="space-y-2">{fields.map(({ key, label }) => { const value = shown(key); return <div key={key} className="flex items-center justify-between gap-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-semibold tabular-nums">{value ? `${value.hours} h` : "—"}{value?.yours && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(yours)</span>}</dd></div>; })}</dl>
    ) : (
      <p className="text-xs leading-relaxed text-muted-foreground">No match found on HowLongToBeat. You can add the times yourself.</p>
    )}
    {looked && looked.name.toLowerCase() !== game.title.toLowerCase() && <p className="text-[11px] text-muted-foreground">Matched to “{looked.name}” on HowLongToBeat.</p>}
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">View on HowLongToBeat <ExternalLink size={12} /></a>
    {!editing ? <Button size="sm" variant="outline" onClick={() => { setDraft(times); setNotice(""); setEditing(true); }}>{hasOverrides ? "Edit your times" : "Enter your own times"}</Button> : <form className="space-y-3" onSubmit={event => { event.preventDefault(); save(); }}><p className="text-xs text-muted-foreground">Leave a field blank to use HowLongToBeat's figure.</p><div className="grid grid-cols-3 gap-2">{fields.map(({ key, label }) => <label key={key} className="text-xs text-muted-foreground">{label}<Input type="number" min="0.1" step="any" aria-label={`${label} hours`} placeholder={looked?.[key] ? String(looked[key]) : ""} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}</div><label className="block text-xs text-muted-foreground">HowLongToBeat game link (optional)<Input value={draft.url} placeholder="https://howlongtobeat.com/game/…" onChange={event => setDraft({ ...draft, url: event.target.value })} /></label><div className="flex gap-2"><Button size="sm" type="submit">Save times</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div></form>}
    {notice && <p className="text-xs text-muted-foreground" role="status">{notice}</p>}
  </section>;
}
