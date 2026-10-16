import type { Extraction, Source } from "../core/model.js";
import type { Project } from "../core/project.js";
import { detectLang, words } from "../core/text.js";
import { readDocument } from "./document.js";
import { readSite } from "./web.js";

/** Read one source into segments of text with locators. Never invents text. */
export const extractSource = async (project: Project, source: Source, log: (m: string) => void = () => {}): Promise<Extraction> => {
  const idPrefix = source.id.replace(/^src_/, "s");
  let title = source.label;
  let pages: string[] = [];
  let segments: Extraction["segments"] = [];
  let limitations: string[] = [];
  if (source.kind === "web") {
    const maxPages = typeof source.options.maxPages === "number" ? source.options.maxPages : source.role === "concorrente" || source.role === "cliente" ? 5 : 1;
    const read = await readSite(source.uri, { maxPages, idPrefix, log });
    title = read.pages[0]?.title ?? source.label;
    pages = read.pages.map((p) => p.url);
    segments = read.pages.flatMap((p) => p.segments);
    limitations = read.limitations;
  } else {
    const read = await readDocument({ uri: source.uri, ...(source.local ? { local: project.dir(source.local) } : {}), idPrefix, label: source.kind === "note" ? source.label : source.label });
    title = source.kind === "note" ? source.label : read.title;
    pages = read.pages;
    segments = read.segments;
    limitations = read.limitations;
  }
  const all = segments.map((s) => s.text).join("\n");
  const extraction: Extraction = {
    sourceId: source.id,
    extractedAt: new Date().toISOString(),
    title,
    lang: detectLang(all),
    pages,
    segments,
    wordCount: words(all).length,
    limitations,
  };
  if (extraction.wordCount < 40) extraction.limitations.push(`pouco texto (${extraction.wordCount} palavras): esta fonte pesa pouco nas análises`);
  await project.saveExtraction(extraction);
  return extraction;
};
