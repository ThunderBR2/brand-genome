/**
 * Text primitives shared by every analysis: normalization, tokens, sentences,
 * n-grams and TF-IDF. Portuguese (Brazil) first, English second.
 */

export type Lang = "pt" | "en";

/** Lowercase and strip accents, so "Inovação" and "inovacao" match. */
export const fold = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const STOP_PT = `a à ao aos as às até com como contra da das de dela dele deles depois do dos e é ela elas ele eles em entre era eram essa essas esse esses esta está estão estas este estes eu foi foram há isso isto já la lá lhe lhes mais mas me mesmo meu meus minha minhas muito muita muitos muitas na nas nem no nos nós nossa nossas nosso nossos num numa o os ou para pela pelas pelo pelos por porque qual quando que quem se sem ser será seu seus sua suas só também te tem têm tu tua tuas teu teus um uma umas uns você vocês vos ter ser estar sobre sob cada todo toda todos todas outro outra outros outras pra pro onde aqui ali então assim ainda bem tão tudo nada algo alguém sempre nunca seja sejam são sou somos estamos fazer faz feito vai vão vamos pode podem deve devem também cada quer queremos nosso`;
const STOP_EN = `a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves us get got also can will just one`;

export const STOPWORDS = new Set([...STOP_PT.split(/\s+/), ...STOP_EN.split(/\s+/)].map(fold));

/** Guess the language from stopword hits. Defaults to Portuguese. */
export const detectLang = (text: string): Lang => {
  const words = fold(text).match(/[a-z]+/g) ?? [];
  const pt = new Set(STOP_PT.split(/\s+/).map(fold));
  const en = new Set(STOP_EN.split(/\s+/).map(fold));
  let p = 0;
  let e = 0;
  for (const w of words.slice(0, 2000)) {
    if (pt.has(w) && !en.has(w)) p++;
    else if (en.has(w) && !pt.has(w)) e++;
  }
  return e > p * 1.3 ? "en" : "pt";
};

/** Words as they appear (letters, digits, inner hyphens/apostrophes). */
export const words = (text: string): string[] =>
  text.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? [];

/** Folded content tokens: no stopwords, no 1-2 letter words, no pure numbers. */
export const contentTokens = (text: string): string[] =>
  words(text)
    .map(fold)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

/** Very light stemmer, enough to merge plurals and common suffixes in PT/EN. */
export const stem = (w: string): string => {
  let s = w;
  for (const suf of ["mente", "coes", "cao", "oes", "ies", "ing", "es", "s"]) {
    if (s.length > suf.length + 3 && s.endsWith(suf)) {
      s = suf === "coes" ? `${s.slice(0, -4)}cao` : suf === "ies" ? `${s.slice(0, -3)}y` : s.slice(0, -suf.length);
      break;
    }
  }
  return s;
};

export const stems = (text: string): string[] => contentTokens(text).map(stem);

/** Content n-grams (stemmed) for phrase-level comparison. */
export const ngrams = (tokens: readonly string[], n: number): string[] => {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  return out;
};

/** Sentences, keeping the terminal punctuation. Splits on . ! ? … and line breaks. */
export const sentences = (text: string): string[] =>
  text
    .replace(/\s*\n\s*\n\s*/g, "\n")
    .split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}"“'(])|\n+/u)
    .map((s) => s.trim())
    .filter((s) => words(s).length > 0);

export const count = <T>(items: Iterable<T>): Map<T, number> => {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return m;
};

/** TF-IDF vectors for a set of documents, with cosine similarity between any two. */
export class TfIdf {
  readonly idf = new Map<string, number>();
  readonly vectors: Map<string, number>[] = [];

  constructor(readonly docs: readonly string[][]) {
    const df = new Map<string, number>();
    for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
    const n = docs.length;
    for (const [t, f] of df) this.idf.set(t, Math.log((1 + n) / (1 + f)) + 1);
    for (const d of docs) this.vectors.push(this.vector(d));
  }

  vector(tokens: readonly string[]): Map<string, number> {
    const tf = count(tokens);
    const v = new Map<string, number>();
    let norm = 0;
    for (const [t, f] of tf) {
      const w = (1 + Math.log(f)) * (this.idf.get(t) ?? Math.log(1 + this.docs.length) + 1);
      v.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  }

  static cosine(a: Map<string, number>, b: Map<string, number>): number {
    const [small, big] = a.size < b.size ? [a, b] : [b, a];
    let dot = 0;
    for (const [t, w] of small) dot += w * (big.get(t) ?? 0);
    return dot;
  }
}

/** Like fold, but keeps every UTF-16 offset aligned with the original string. */
export const foldKeep = (s: string): string => {
  let out = "";
  for (const c of s) {
    const d = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (d.length === c.length) out += d;
    else {
      const l = c.toLowerCase();
      out += l.length === c.length ? l : c;
    }
  }
  return out;
};

const lowerKeep = (s: string): string => {
  let out = "";
  for (const c of s) {
    const l = c.toLowerCase();
    out += l.length === c.length ? l : c;
  }
  return out;
};

/**
 * Comparable terms of a text: stemmed content words plus pairs of neighbouring
 * content words, never across a sentence boundary.
 */
export const terms = (text: string): string[] => {
  const out: string[] = [];
  for (const sent of sentences(text)) {
    const toks = contentTokens(sent).map(stem);
    out.push(...toks, ...ngrams(toks, 2));
  }
  return out;
};

/**
 * How each stemmed term is actually written (with the small words in between:
 * "data torra" -> "data da torra"), counted so the most common form can be shown.
 */
export const surfaceForms = (texts: readonly string[]): Map<string, Map<string, number>> => {
  const forms = new Map<string, Map<string, number>>();
  const add = (key: string, surf: string): void => {
    const m = forms.get(key) ?? new Map<string, number>();
    const low = surf.toLowerCase();
    m.set(low, (m.get(low) ?? 0) + 1);
    forms.set(key, m);
  };
  for (const t of texts) for (const sent of sentences(t)) {
    const ws = words(sent);
    const content = ws.map((w, i) => ({ w, i, k: contentTokens(w).map(stem)[0] })).filter((x) => x.k);
    content.forEach((c, j) => {
      add(c.k!, c.w);
      const next = content[j + 1];
      if (next && next.i - c.i <= 3) add(`${c.k} ${next.k}`, ws.slice(c.i, next.i + 1).join(" "));
    });
  }
  return forms;
};

export const bestForm = (forms: Map<string, Map<string, number>>, key: string): string => {
  const m = forms.get(key);
  if (!m) return key;
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0];
};

/** Phrase search on folded text with word boundaries; returns match offsets in the original. */
export const findPhrase = (text: string, phrase: string, opts: { accents?: boolean } = {}): number[] => {
  // With accents on, a phrase written with diacritics only matches the same spelling ("é só" is not "e só").
  const strict = opts.accents === true && phrase.normalize("NFD") !== phrase.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const hay = strict ? lowerKeep(text) : foldKeep(text);
  const needle = (strict ? phrase.toLowerCase() : fold(phrase)).trim();
  if (!needle) return [];
  const out: number[] = [];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu");
  for (const m of hay.matchAll(re)) out.push(m.index ?? 0);
  return out;
};

/** A short excerpt around an offset, for evidence. */
export const excerpt = (text: string, at: number, radius = 80): string => {
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
};

export const round = (n: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const slug = (s: string): string =>
  fold(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
