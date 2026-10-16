import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import type { Segment } from "../core/model.js";
import { words } from "../core/text.js";
import { segmentsFromHtml } from "./web.js";

export interface DocRead { title: string; pages: string[]; segments: Segment[]; limitations: string[] }

const paragraphs = (text: string): string[] =>
  text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter((p) => words(p).length > 0);

const segKind = (p: string): Segment["kind"] => (/^#{1,6}\s/.test(p) || (words(p).length <= 10 && !/[.!?]$/.test(p)) ? "heading" : /^[-*•]\s/.test(p) ? "list" : "paragraph");

const fromPlain = (text: string, idPrefix: string, locatorBase: string): Segment[] =>
  paragraphs(text).map((p, i) => ({ id: `${idPrefix}-${i + 1}`, kind: segKind(p), text: p.replace(/^#{1,6}\s+|^[-*•]\s+/, ""), locator: `${locatorBase} §${i + 1}` }));

const pdfText = async (buf: Buffer): Promise<string[]> => {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument: (o: object) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string; hasEOL?: boolean }[] }> }> }> };
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let s = "";
    for (const it of content.items) {
      s += it.str ?? "";
      s += it.hasEOL ? "\n" : " ";
    }
    // Lines that end a sentence or are short (titles) become paragraph breaks.
    pages.push(s.replace(/[ \t]+/g, " ").replace(/([.!?:])\s*\n/g, "$1\n\n"));
  }
  return pages;
};

/** Subtitles and transcripts: drop cue numbers and timestamps, keep the first timestamp of each block as locator. */
const fromSubtitles = (raw: string, idPrefix: string, label: string): Segment[] => {
  const blocks = raw.replace(/\r/g, "").replace(/^WEBVTT.*\n/, "").split(/\n\s*\n/);
  const segs: Segment[] = [];
  let buffer = "";
  let start = "";
  const flush = (): void => {
    if (words(buffer).length) segs.push({ id: `${idPrefix}-${segs.length + 1}`, kind: "paragraph", text: buffer.trim(), locator: `${label} ${start}` });
    buffer = "";
    start = "";
  };
  for (const b of blocks) {
    const lines = b.split("\n").filter((l) => !/^\d+$/.test(l.trim()));
    const ts = lines.find((l) => /-->/.test(l));
    const text = lines.filter((l) => !/-->/.test(l)).join(" ").replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    if (!start && ts) start = ts.split("-->")[0]!.trim().replace(/[,.]\d+$/, "");
    buffer += ` ${text}`;
    if (words(buffer).length > 120 || /[.!?]$/.test(text)) flush();
  }
  flush();
  return segs;
};

/** Parse CSV with quoted fields (commas, semicolons and line breaks inside quotes). The separator comes from the header. */
export const parseCsv = (raw: string): string[][] => {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = text.split("\n", 1)[0] ?? "";
  const countOutside = (line: string, ch: string): number => {
    let n = 0;
    let q = false;
    for (const c of line) {
      if (c === '"') q = !q;
      else if (c === ch && !q) n++;
    }
    return n;
  };
  const sep = [";", "\t", ","].map((c) => ({ c, n: countOutside(firstLine, c) })).sort((a, b) => b.n - a.n)[0]!;
  const delim = sep.n > 0 ? sep.c : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
};

/** CSV rows (reviews, survey answers): every text-heavy cell becomes a quote. */
const fromCsv = (raw: string, idPrefix: string, label: string): Segment[] => {
  const rows = parseCsv(raw);
  const segs: Segment[] = [];
  rows.forEach((row, r) => {
    if (r === 0 && rows.length > 1 && row.every((c) => words(c).length <= 3)) return;
    for (const c of row.filter((x) => words(x).length >= 4)) segs.push({ id: `${idPrefix}-${segs.length + 1}`, kind: "quote", text: c.replace(/\s+/g, " ").trim(), locator: `${label} linha ${r + 1}` });
  });
  return segs;
};

export const readDocument = async (opts: { uri: string; local?: string; idPrefix: string; label: string }): Promise<DocRead> => {
  const limitations: string[] = [];
  let buf: Buffer;
  let ext: string;
  if (opts.local) {
    buf = await readFile(opts.local);
    ext = extname(opts.local).toLowerCase();
  } else {
    const res = await fetch(opts.uri, { redirect: "follow", signal: AbortSignal.timeout(60_000), headers: { "user-agent": "Mozilla/5.0 brand-genome" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${opts.uri}`);
    buf = Buffer.from(await res.arrayBuffer());
    ext = extname(new URL(opts.uri).pathname).toLowerCase() || ".pdf";
  }
  const label = opts.label;
  if (ext === ".pdf") {
    const pages = await pdfText(buf);
    const segs: Segment[] = [];
    pages.forEach((p, i) => {
      for (const s of fromPlain(p, `${opts.idPrefix}-pg${i + 1}`, `${label} p.${i + 1}`)) segs.push(s);
    });
    if (segs.reduce((n, s) => n + words(s.text).length, 0) < 30) limitations.push("PDF sem camada de texto (escaneado?): pouco ou nenhum texto extraído");
    const title = segs.find((s) => s.kind === "heading")?.text ?? label;
    return { title, pages: pages.map((_, i) => `${label} p.${i + 1}`), segments: segs, limitations };
  }
  if (ext === ".docx") {
    const mammoth = (await import("mammoth")) as unknown as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> };
    const { value } = await mammoth.extractRawText({ buffer: buf });
    const segs = fromPlain(value.replace(/\n(?!\n)/g, "\n\n"), opts.idPrefix, label);
    return { title: segs[0]?.text ?? label, pages: [label], segments: segs, limitations };
  }
  const raw = buf.toString("utf8");
  if (ext === ".html" || ext === ".htm") {
    const r = segmentsFromHtml(raw, label, opts.idPrefix);
    return { title: r.title, pages: [label], segments: r.segments, limitations };
  }
  if (ext === ".srt" || ext === ".vtt") return { title: label, pages: [label], segments: fromSubtitles(raw, opts.idPrefix, label), limitations };
  if (ext === ".csv") return { title: label, pages: [label], segments: fromCsv(raw, opts.idPrefix, label), limitations };
  if (ext === ".json") {
    const data = JSON.parse(raw) as unknown;
    const texts: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === "string" && words(v).length >= 4) texts.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(data);
    return { title: label, pages: [label], segments: texts.map((t, i) => ({ id: `${opts.idPrefix}-${i + 1}`, kind: "quote" as const, text: t.trim(), locator: `${label} item ${i + 1}` })), limitations };
  }
  const segs = fromPlain(raw, opts.idPrefix, label);
  return { title: segs.find((s) => s.kind === "heading")?.text ?? label, pages: [label], segments: segs, limitations };
};
