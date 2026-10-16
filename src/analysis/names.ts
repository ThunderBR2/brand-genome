import type { LexiconEntry } from "../canon/types.js";
import { fold, round } from "../core/text.js";
import type { Landscape } from "./landscape.js";
import { sectorMatches } from "./lexicon.js";

/**
 * Mechanical checks for name candidates. They catch what is measurable
 * (length, sound, clichés, closeness to competitors, descriptive words).
 * Meaning, connotation and legal availability stay with people: the result
 * lists the searches to run by hand.
 */

export interface NameCheck {
  readonly name: string;
  readonly score: number;
  readonly letters: number;
  readonly syllables: number;
  readonly flags: readonly { severity: "alta" | "media" | "baixa"; message: string }[];
  readonly closestCompetitor: { name: string; similarity: number } | null;
  readonly manualChecks: readonly { what: string; where: string }[];
}

/** Patterns tested on the name as written (case matters for e-/i- prefixes). */
const CLICHE_PATTERNS: [RegExp, string][] = [
  [/(ify|[^aeiou]ly|io|ize|[^aeiou]r)$/i, "terminação da moda em startups (-ify, -ly, -io, -r sem vogal antes, como Flickr): envelhece rápido e se parece com centenas de nomes"],
  [/^(e-|i(?=[A-Z])|my(?=[A-Z ])|smart|super(?=[A-Z ])|mega(?=[A-Z ])|easy|f[aá]cil)/, "prefixo batido (e-, iAlgo, My, Smart, Super, Mega, Fácil)"],
  [/[0-9]/, "número no nome: difícil de falar e de buscar"],
];

const GENERIC_TAIL = new Set(["hub", "tech", "solutions", "solucoes", "group", "grupo", "lab", "labs", "digital", "brasil", "br", "online", "global", "plus", "max", "360", "express"]);

/** Words of a name, splitting CamelCase: "CafeHub" -> cafe, hub. */
const nameWords = (name: string): string[] => fold(name.replace(/([a-z])([A-Z])/g, "$1 $2")).split(/[^a-z0-9]+/).filter(Boolean);

const vowelGroups = (s: string): number => (fold(s).match(/[aeiouy]+/g) ?? []).length;

const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m]![n]!;
};

const similarity = (a: string, b: string): number => {
  const x = fold(a).replace(/[^a-z0-9]/g, "");
  const y = fold(b).replace(/[^a-z0-9]/g, "");
  if (!x || !y) return 0;
  const lev = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  const prefix = x.slice(0, 4) === y.slice(0, 4) && x.length >= 4 ? 0.15 : 0;
  return round(Math.min(1, lev + prefix), 2);
};

export const checkNames = (names: readonly string[], ctx: { competitors: readonly string[]; landscape?: Landscape | null; lexicon: readonly LexiconEntry[]; sector: string; market: string }): NameCheck[] => {
  const conventions = (ctx.landscape?.conventions ?? []).map((c) => c.term);
  const naming = ctx.lexicon.filter((e) => fold(e.category) === "naming");
  const categoryWords = ctx.lexicon.filter((e) => e.kind === "categoria" && sectorMatches(e.category, ctx.sector)).map((e) => e.term);
  return names.map((raw) => {
    const name = raw.trim();
    const flags: NameCheck["flags"][number][] = [];
    const letters = name.replace(/[^\p{L}\p{N}]/gu, "").length;
    const syl = vowelGroups(name);
    let score = 100;
    if (letters > 14) { score -= 15; flags.push({ severity: "media", message: `${letters} letras: nomes longos viram apelido (quem decide o apelido é o público).` }); }
    if (syl > 4) { score -= 10; flags.push({ severity: "baixa", message: `${syl} sílabas: difícil de falar de uma vez.` }); }
    if (letters <= 3) { score -= 5; flags.push({ severity: "baixa", message: "Nome de até 3 letras: quase sempre já registrado e difícil de dar significado." }); }
    for (const [re, msg] of CLICHE_PATTERNS) if (re.test(name.normalize("NFC"))) { score -= 15; flags.push({ severity: "media", message: msg }); }
    const ws = nameWords(name);
    if (ws.length > 1 && GENERIC_TAIL.has(ws.at(-1)!)) { score -= 15; flags.push({ severity: "media", message: "palavra final genérica (hub, tech, soluções, group, labs, digital, plus, 360): diz pouco e quase todos usam" }); }
    const seen = new Set<string>();
    for (const e of naming) {
      const t = fold(e.term).trim();
      const hit = t.startsWith("-") ? ws.some((w) => w.endsWith(t.slice(1)) && w.length > t.length + 1) : ws.includes(t);
      if (!hit || seen.has(t.replace(/^-/, ""))) continue;
      seen.add(t.replace(/^-/, ""));
      score -= 10;
      flags.push({ severity: "media", message: `Usa "${e.term}", um clichê de naming${e.replacement ? `: ${e.replacement}` : ""}.` });
    }
    const f = fold(name);
    if (/[^aeiou\s]{4,}/.test(f.replace(/[^a-z\s]/g, ""))) { score -= 8; flags.push({ severity: "baixa", message: "Encontro de 4+ consoantes: difícil de pronunciar em português." }); }
    if (/(ch|sh|x|ss|ç|c[ei]|s[ei]|z|w|k|y|ph|th)/.test(f)) flags.push({ severity: "baixa", message: "Ao ouvir, pode ser escrito de mais de um jeito (ch/x, s/ç/ss, k/c, w/v, y/i): teste o 'ditado' com 5 pessoas." });
    const descriptive = [...conventions, ...categoryWords].filter((w) => w.split(" ").length === 1 && w.length > 3 && f.includes(fold(w)));
    if (descriptive.length) {
      score -= 20;
      flags.push({ severity: "alta", message: `Usa palavra que a categoria inteira usa (${descriptive.slice(0, 3).join(", ")}): nome descritivo é fraco para memória e difícil de registrar (no Brasil, a Lei 9.279/96, art. 124, VI, impede registrar sinal genérico ou simplesmente descritivo).` });
    }
    let closest: NameCheck["closestCompetitor"] = null;
    for (const c of ctx.competitors) {
      const s = similarity(name, c);
      if (!closest || s > closest.similarity) closest = { name: c, similarity: s };
    }
    if (closest && closest.similarity >= 0.6) {
      score -= closest.similarity >= 0.75 ? 35 : 20;
      flags.push({ severity: closest.similarity >= 0.75 ? "alta" : "media", message: `Parecido com ${closest.name} (${Math.round(closest.similarity * 100)}%): risco de confusão e de oposição no registro.` });
    }
    const q = encodeURIComponent(name);
    const manualChecks = [
      { what: "Busca de marca no INPI (Brasil), na classe do seu produto/serviço", where: "https://busca.inpi.gov.br/pePI/" },
      { what: "WIPO Global Brand Database (marcas no mundo, inclui busca por imagem) — busca manual, a WIPO proíbe consulta automatizada", where: "https://branddb.wipo.int" },
      { what: "TMview (União Europeia e vários países)", where: "https://www.tmdn.org/tmview" },
      { what: "Domínio .com.br", where: `https://registro.br/busca-dominio/?fqdn=${q}.com.br` },
      { what: "@ no Instagram e no TikTok", where: `https://www.instagram.com/${fold(name).replace(/[^a-z0-9._]/g, "")}` },
      { what: "Significado e gíria em PT, EN e ES; conotações negativas; como soa dito em voz alta", where: "pessoas nativas (não tradutor automático)" },
    ];
    return { name, score: Math.max(0, score), letters, syllables: syl, flags, closestCompetitor: closest, manualChecks };
  });
};
