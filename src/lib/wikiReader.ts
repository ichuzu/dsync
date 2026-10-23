/**
 * Reader mode for MediaWiki wikis (Fandom, wiki.gg, …): fetches an article's
 * rendered HTML with action=parse and cleans it up to show inside Dsync.
 *
 * The HTML comes from a third-party site, so it is treated as hostile:
 *   - anything that can run code is removed: <script>, inline on* handlers,
 *     javascript: URLs, and embeds (<iframe>, <object>, <embed>);
 *   - editor chrome, ads and video players are dropped;
 *   - Fandom's lazy-loaded images get their real src back;
 *   - links to other articles on the same wiki become in-app links
 *     (data-wiki-title), everything else opens outside.
 */

export interface ReaderSource {
  api: string;
  pageBase: string;
}

export interface ReaderArticle {
  title: string;
  html: string;
}

const REMOVE = [
  "script", "style", "link", "meta", "base", "iframe", "object", "embed", "form", "input", "button",
  "textarea", "select", "noscript", "audio", "video", "source",
  ".mw-editsection", ".toc", "#toc", ".navbox", ".noprint", ".mw-empty-elt",
  "[data-video-key]", ".article-media-video", ".ad-slot", ".gpt-ad", "[id^='gpt']",
].join(",");

/** The article title a same-wiki link points at, or null for anything else. */
function articleTitleFrom(href: string, source: ReaderSource): string | null {
  let url: URL;
  try {
    url = new URL(href, source.pageBase);
  } catch {
    return null;
  }
  const base = new URL(source.pageBase);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
  if (url.searchParams.has("action")) return null;
  const title = decodeURIComponent(url.pathname.slice(base.pathname.length)).replace(/_/g, " ");
  // Special pages and file pages aren't articles; open those outside.
  if (!title || /^(Special|File|Image|Media|User|Talk):/i.test(title)) return null;
  return title;
}

const absolute = (value: string, base: string) => {
  try {
    return new URL(value.startsWith("//") ? `https:${value}` : value, base).href;
  } catch {
    return null;
  }
};

export function cleanArticleHtml(raw: string, source: ReaderSource): string {
  const doc = new DOMParser().parseFromString(`<div id="root">${raw}</div>`, "text/html");
  const root = doc.getElementById("root")!;

  root.querySelectorAll(REMOVE).forEach((el) => el.remove());

  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if ((name === "href" || name === "src" || name === "xlink:href") && value.startsWith("javascript:"))
        el.removeAttribute(attr.name);
      // Inline styles can pull remote content in through url(…).
      else if (name === "style" && value.includes("url(")) el.removeAttribute(attr.name);
    }
  }

  for (const img of Array.from(root.querySelectorAll("img"))) {
    const lazy = img.getAttribute("data-src");
    const src = lazy || img.getAttribute("src") || "";
    const fixed = src && !src.startsWith("data:") ? absolute(src, source.pageBase) : null;
    if (!fixed) {
      img.remove();
      continue;
    }
    img.setAttribute("src", fixed);
    img.removeAttribute("srcset");
    img.removeAttribute("data-src");
    img.setAttribute("loading", "lazy");
    img.setAttribute("referrerpolicy", "no-referrer");
    img.classList.remove("lazyload");
  }

  for (const a of Array.from(root.querySelectorAll("a"))) {
    const href = a.getAttribute("href");
    if (!href) continue;
    if (href.startsWith("#")) continue; // footnotes and in-page anchors
    const title = articleTitleFrom(href, source);
    if (title) {
      a.setAttribute("data-wiki-title", title);
      a.setAttribute("href", "#");
    } else {
      const url = absolute(href, source.pageBase);
      if (!url || !/^https?:/.test(url)) {
        a.removeAttribute("href");
        continue;
      }
      a.setAttribute("href", url);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noreferrer");
    }
  }

  // Wide tables scroll inside the column instead of stretching the page.
  for (const table of Array.from(root.querySelectorAll("table"))) {
    if (table.parentElement?.classList.contains("wiki-table-scroll")) continue;
    const wrap = doc.createElement("div");
    wrap.className = "wiki-table-scroll";
    table.replaceWith(wrap);
    wrap.appendChild(table);
  }

  return root.innerHTML;
}

export async function readArticle(
  title: string,
  source: ReaderSource,
  signal?: AbortSignal,
): Promise<ReaderArticle> {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "text|displaytitle",
    redirects: "1",
    disableeditsection: "1",
    disabletoc: "1",
    formatversion: "2",
    format: "json",
    origin: "*",
  });
  const res = await fetch(`${source.api}?${params}`, { signal });
  if (res.status === 429) throw new Error("The wiki is busy. Try again in a moment.");
  if (!res.ok) throw new Error("The wiki is unavailable right now.");
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.code === "missingtitle" ? "This article couldn't be found." : "The wiki couldn't load this article.");
  }
  const display = new DOMParser().parseFromString(data.parse?.displaytitle ?? "", "text/html").body.textContent;
  return {
    title: display?.trim() || data.parse?.title || title,
    html: cleanArticleHtml(data.parse?.text ?? "", source),
  };
}
