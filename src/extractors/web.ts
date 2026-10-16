import { load, type CheerioAPI } from "cheerio";

import type { Segment } from "../core/model.js";
import { fold, words } from "../core/text.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 brand-genome";

/** Pages that usually carry what a brand says about itself. */
const KEY_PATHS = /(sobre|quem-somos|about|manifesto|nossa-historia|historia|story|missao|mission|proposito|purpose|valores|values|empresa|company|marca|brand|produtos?|products?|servicos?|services?|solucoes|solutions|por-que|why)/i;

export interface WebPage { url: string; title: string; segments: Segment[] }

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Read the text a site shows: title, description, headings, paragraphs, lists and calls to action. */
export const segmentsFromHtml = (html: string, url: string, idPrefix: string): { title: string; segments: Segment[]; links: string[] } => {
  const $: CheerioAPI = load(html);
  const links: string[] = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href");
    if (href) links.push(href);
  });
  $("script, style, noscript, svg, iframe, template, form select, [aria-hidden=true], .cookie, #cookie, [class*=cookie], [id*=cookie]").remove();
  const title = clean($("title").first().text()) || clean($("h1").first().text()) || url;
  const segs: Segment[] = [];
  const seen = new Set<string>();
  const push = (kind: Segment["kind"], text: string): void => {
    const t = clean(text);
    if (!t || words(t).length < (kind === "cta" ? 1 : 2)) return;
    const key = fold(t);
    if (seen.has(key)) return;
    seen.add(key);
    segs.push({ id: `${idPrefix}-${segs.length + 1}`, kind, text: t, locator: url });
  };
  push("title", title);
  const desc = $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content");
  if (desc) push("meta", desc);
  const root = $("main").length ? $("main") : $("body");
  root.find("header nav, nav, footer [class*=legal], .breadcrumb").remove();
  root.find("h1, h2, h3, h4, p, li, blockquote, figcaption, button, a.button, a.btn, [class*=btn], [role=button], td, dd").each((_, el) => {
    const $el = $(el);
    const tag = el.tagName.toLowerCase();
    if (tag === "li" && $el.find("p, li").length) return;
    if ((tag === "td" || tag === "dd") && $el.find("p").length) return;
    const text = $el.text();
    if (/^h[1-4]$/.test(tag)) push("heading", text);
    else if (tag === "li") push("list", text);
    else if (tag === "blockquote") push("quote", text);
    else if (tag === "button" || tag === "a" || $el.attr("role") === "button" || /btn/.test($el.attr("class") ?? "")) {
      if (words(text).length <= 8) push("cta", text);
    } else push("paragraph", text);
  });
  // Text that sits directly in divs (common in builders) when nothing else was found.
  if (segs.length < 6) {
    root.find("div, span, section").each((_, el) => {
      const $el = $(el);
      if ($el.children().length > 0) return;
      push("paragraph", $el.text());
    });
  }
  return { title, segments: segs, links };
};

const fetchHtml = async (url: string): Promise<{ html: string; finalUrl: string }> => {
  const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/html|xml|text/.test(type)) throw new Error(`${url} não é uma página (${type}).`);
  return { html: await res.text(), finalUrl: res.url || url };
};

/** Render with Chromium when the site builds its text with JavaScript. Optional dependency. */
const renderHtml = async (url: string): Promise<string | null> => {
  try {
    const mod = (await import("playwright" as string)) as { chromium: { launch: (o: object) => Promise<{ newPage: () => Promise<{ goto: (u: string, o: object) => Promise<unknown>; content: () => Promise<string>; waitForTimeout: (ms: number) => Promise<void> }>; close: () => Promise<void> }> } };
    const browser = await mod.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      await page.waitForTimeout(800);
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
};

const sameSite = (a: string, b: string): boolean => new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "");

/**
 * Read a site: the page given plus up to `maxPages - 1` pages of the same site
 * whose address suggests the brand talks about itself (about, manifesto,
 * products…). Falls back to a headless browser for JavaScript sites.
 */
export const readSite = async (url: string, opts: { maxPages?: number; idPrefix: string; log?: (m: string) => void }): Promise<{ pages: WebPage[]; limitations: string[] }> => {
  const maxPages = Math.max(1, Math.min(12, opts.maxPages ?? 5));
  const limitations: string[] = [];
  const pages: WebPage[] = [];
  const queue: string[] = [url];
  const visited = new Set<string>();
  while (queue.length && pages.length < maxPages) {
    const next = queue.shift()!;
    const norm = next.replace(/#.*$/, "").replace(/\/$/, "");
    if (visited.has(norm)) continue;
    visited.add(norm);
    let html: string;
    let finalUrl = next;
    try {
      ({ html, finalUrl } = await fetchHtml(next));
    } catch (e) {
      if (pages.length === 0) {
        const rendered = await renderHtml(next);
        if (!rendered) throw e;
        html = rendered;
        limitations.push("página lida pelo navegador headless após falha no acesso direto");
      } else {
        limitations.push(`não foi possível ler ${next}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }
    let read = segmentsFromHtml(html, finalUrl, `${opts.idPrefix}-p${pages.length + 1}`);
    const wc = read.segments.reduce((n, s) => n + words(s.text).length, 0);
    if (wc < 120) {
      const rendered = await renderHtml(finalUrl);
      if (rendered) {
        const again = segmentsFromHtml(rendered, finalUrl, `${opts.idPrefix}-p${pages.length + 1}`);
        if (again.segments.length > read.segments.length) {
          read = again;
          limitations.push(`${finalUrl}: texto montado por JavaScript, lido com navegador headless`);
        }
      } else {
        limitations.push(`${finalUrl}: pouco texto no HTML (${wc} palavras); o site pode montar o conteúdo com JavaScript e o Chromium não está disponível`);
      }
    }
    pages.push({ url: finalUrl, title: read.title, segments: read.segments });
    opts.log?.(`lido ${finalUrl} (${read.segments.length} trechos)`);
    if (pages.length === 1) {
      const candidates = new Set<string>();
      for (const href of read.links) {
        try {
          const abs = new URL(href, finalUrl).toString();
          if (!/^https?:/.test(abs) || !sameSite(abs, finalUrl)) continue;
          const path = new URL(abs).pathname;
          if (KEY_PATHS.test(path) && !/\.(pdf|jpg|png|zip)$/i.test(path) && path.split("/").filter(Boolean).length <= 3) candidates.add(abs.replace(/#.*$/, ""));
        } catch {
          /* bad href */
        }
      }
      queue.push(...[...candidates].slice(0, 20));
    }
  }
  return { pages, limitations };
};
