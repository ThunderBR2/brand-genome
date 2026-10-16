import { z } from "zod";

/** Card formats of the canon. Lenient on input (agents write them), strict on what is used. */

export const DOMAINS = [
  "estrategia", "posicionamento", "publico", "ciencia-crescimento", "equity-medicao", "arquitetura", "naming",
  "identidade-verbal", "narrativa-proposito", "identidade-visual", "ativos-distintivos", "sonoro-motion",
  "experiencia", "ativacao-eficacia", "gestao-governanca", "b2b", "cultura-interna",
] as const;

export const SCHOOLS = [
  "ehrenberg-bass", "posicionamento-diferenciacao", "eficacia", "comportamental", "identidade-design", "cultural",
  "proposito", "verbal", "naming", "pratica", "academica", "misto",
] as const;
export type School = (typeof SCHOOLS)[number];

export const SCHOOL_LABEL: Record<School, string> = {
  "ehrenberg-bass": "Ciência de marketing (Ehrenberg-Bass)",
  "posicionamento-diferenciacao": "Posicionamento e diferenciação",
  eficacia: "Eficácia (IPA, Binet & Field)",
  comportamental: "Ciência comportamental",
  "identidade-design": "Identidade e design",
  cultural: "Branding cultural",
  proposito: "Propósito",
  verbal: "Identidade verbal",
  naming: "Naming",
  pratica: "Prática de estrategistas",
  academica: "Academia",
  misto: "Várias escolas",
};

export const EVIDENCE = ["empirica", "meta-analise", "caso", "opiniao-especialista", "framework", "guia-oficial"] as const;
export const EVIDENCE_WEIGHT: Record<(typeof EVIDENCE)[number], number> = {
  "meta-analise": 1, empirica: 0.9, "guia-oficial": 0.7, caso: 0.6, framework: 0.55, "opiniao-especialista": 0.45,
};

const str = z.preprocess((v) => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v)), z.string());
const strArr = z.preprocess((v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))) : [String(v)]), z.array(z.string()));
const enumOr = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.preprocess((v) => (typeof v === "string" && (values as readonly string[]).includes(v) ? v : fallback), z.enum(values));
const enumArr = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => typeof x === "string" && (values as readonly string[]).includes(x)), z.array(z.enum(values)));

export const STAGE_IDS = ["diagnostico", "paisagem", "publico", "posicionamento", "plataforma", "arquitetura", "naming", "voz", "ativos", "narrativa", "ativacao"] as const;

export const sourceRefSchema = z.preprocess(
  (v) => (typeof v === "string" ? { id: v } : v),
  z.object({ id: z.string(), locator: str.optional(), paraphrase: str.optional(), quote: str.optional() }),
);
export type SourceRef = z.infer<typeof sourceRefSchema>;
const refs = z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(sourceRefSchema));

export const canonSourceSchema = z.object({
  id: z.string(),
  title: str,
  url: str,
  author: str,
  year: z.preprocess((v) => (typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10) || undefined), z.number().optional()),
  format: str,
  language: str,
  access: str,
  license: str,
  school: enumOr(SCHOOLS, "misto"),
  evidence: enumOr(EVIDENCE, "opiniao-especialista"),
  sponsored: z.preprocess((v) => v === true, z.boolean()),
  dissected: z.preprocess((v) => v !== false, z.boolean()),
  summary: str,
  notes: str,
});
export type CanonSource = z.infer<typeof canonSourceSchema>;

export const principleSchema = z.object({
  id: z.string(),
  title: str,
  statement: str,
  why: str,
  how: strArr,
  tests: strArr,
  polarity: enumOr(["sempre", "nunca", "prefira", "evite", "fato"] as const, "prefira"),
  domain: enumArr(DOMAINS),
  stage: enumArr(STAGE_IDS),
  school: enumOr(SCHOOLS, "misto"),
  evidence: enumOr(EVIDENCE, "opiniao-especialista"),
  strength: z.preprocess((v) => Math.max(1, Math.min(3, Number(v) || 2)), z.number()),
  sources: refs,
  conflictsWith: strArr,
  cases: strArr,
  contexts: str,
});
export type Principle = z.infer<typeof principleSchema>;

export const frameworkSchema = z.object({
  id: z.string(),
  name: str,
  author: str,
  purpose: str,
  components: z.preprocess((v) => (Array.isArray(v) ? v.map((c) => (typeof c === "string" ? { name: c, description: "" } : c)) : []), z.array(z.object({ name: str, description: str }))),
  steps: strArr,
  inputs: strArr,
  outputs: strArr,
  pitfalls: strArr,
  criticisms: strArr,
  domain: enumArr(DOMAINS),
  stage: enumArr(STAGE_IDS),
  school: enumOr(SCHOOLS, "misto"),
  sources: refs,
});
export type Framework = z.infer<typeof frameworkSchema>;

export const debateSchema = z.object({
  id: z.string(),
  question: str,
  positions: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.object({ school: enumOr(SCHOOLS, "misto"), claim: str, evidence: str, sources: refs }))),
  synthesis: str,
  systemStance: str,
  stage: enumArr(STAGE_IDS),
  domain: enumArr(DOMAINS),
});
export type Debate = z.infer<typeof debateSchema>;

export const caseSchema = z.object({
  id: z.string(),
  brand: str,
  year: z.preprocess((v) => (typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10) || undefined), z.number().optional()),
  agency: str,
  sector: str,
  market: str,
  type: str,
  challenge: str,
  insight: str,
  strategy: str,
  execution: str,
  results: z.preprocess((v) => (Array.isArray(v) ? v.map((r) => (typeof r === "string" ? { metric: r, value: "" } : r)) : []), z.array(z.object({ metric: str, value: str, independent: z.preprocess((x) => x === true, z.boolean()), source: str.optional() }))),
  lessons: strArr,
  principles: strArr,
  sources: refs,
});
export type Case = z.infer<typeof caseSchema>;

export const antipatternSchema = z.object({
  id: z.string(),
  name: str,
  description: str,
  signals: strArr,
  whyBad: str,
  fix: str,
  domain: enumArr(DOMAINS),
  stage: enumArr(STAGE_IDS),
  sources: refs,
});
export type Antipattern = z.infer<typeof antipatternSchema>;

export const LEXICON_KINDS = ["cliche", "jargao", "adjetivo-vazio", "promessa-vaga", "categoria", "proposito-generico"] as const;
export type LexiconKind = (typeof LEXICON_KINDS)[number];

export const lexiconSchema = z.object({
  term: z.preprocess((v) => String(v ?? "").trim().toLowerCase(), z.string().min(2)),
  lang: z.preprocess((v) => (v === "en" ? "en" : "pt"), z.enum(["pt", "en"])),
  kind: enumOr(LEXICON_KINDS, "cliche"),
  category: str,
  replacement: str,
  sources: strArr,
});
export type LexiconEntry = z.infer<typeof lexiconSchema>;

export const batchSchema = z.object({
  batch: str,
  sources: z.array(z.unknown()).default([]),
  principles: z.array(z.unknown()).default([]),
  frameworks: z.array(z.unknown()).default([]),
  debates: z.array(z.unknown()).default([]),
  cases: z.array(z.unknown()).default([]),
  antipatterns: z.array(z.unknown()).default([]),
  lexicon: z.array(z.unknown()).default([]),
});

export type Support = "consolidado" | "fonte-unica";

export interface Canon {
  readonly builtAt: string;
  readonly batches: readonly string[];
  /** Distinct pages (by URL) and how many of them were actually read. */
  readonly uniqueSources: number;
  readonly dissectedSources: number;
  readonly sources: readonly CanonSource[];
  readonly principles: readonly (Principle & { support: Support; sourceCount: number; batches: string[]; debatedIn: string[] })[];
  readonly frameworks: readonly (Framework & { batches: string[] })[];
  readonly debates: readonly (Debate & { batches: string[] })[];
  readonly cases: readonly (Case & { batches: string[] })[];
  readonly antipatterns: readonly (Antipattern & { batches: string[] })[];
  readonly lexicon: readonly LexiconEntry[];
  readonly warnings: readonly string[];
}

export type CardKind = "principle" | "framework" | "debate" | "case" | "antipattern" | "source";
