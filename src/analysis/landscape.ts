import type { LexiconEntry } from "../canon/types.js";
import type { EvidenceRef, Extraction, Source } from "../core/model.js";
import { bestForm, contentTokens, count, excerpt, findPhrase, fold, ngrams, round, sentences, stem, surfaceForms, terms, TfIdf, words } from "../core/text.js";
import { findLexicon } from "./lexicon.js";
import { describeVoice, measureVoice, type VoiceMetrics } from "./voice.js";

/**
 * The category as its brands describe it. Competitors' own words show the
 * conventions every brand repeats (the "sea of sameness"); the audience's words
 * show what people actually care about; the gap between both is where a brand
 * can stand apart.
 */

export interface EntityProfile {
  readonly entity: string;
  readonly role: "cliente" | "concorrente" | "referencia";
  readonly sources: readonly string[];
  readonly words: number;
  readonly voice: VoiceMetrics;
  readonly voiceSummary: string;
  /** What they lead with: titles, meta descriptions and top headings. */
  readonly claims: readonly EvidenceRef[];
  /** Terms this brand uses that the others don't (TF-IDF against the set). */
  readonly ownTerms: readonly string[];
  /** Generic and conventional language found. */
  readonly genericHits: readonly { term: string; kind: string; sourceId: string; excerpt: string }[];
  readonly genericPer100: number;
}

export interface Convention {
  readonly term: string;
  readonly stems: string;
  /** Share of competitors that use it (0-1). */
  readonly share: number;
  readonly entities: readonly string[];
  readonly evidence: readonly EvidenceRef[];
}

export interface Landscape {
  readonly builtAt: string;
  readonly brand: string;
  readonly entities: readonly EntityProfile[];
  readonly conventions: readonly Convention[];
  /** Cosine similarity of vocabularies (0-1) between every pair of entities. */
  readonly similarity: readonly { a: string; b: string; value: number }[];
  /** Whom the client's current material sounds most like. */
  readonly brandClosest: readonly { entity: string; value: number }[];
  readonly categoryVoice: { readonly formality: number; readonly avgSentence: number; readonly we: number; readonly you: number; readonly exclamations: number } | null;
  /** The audience's own vocabulary, with representative quotes. */
  readonly audience: {
    readonly phrases: readonly { phrase: string; count: number; usedByCompetitors: boolean }[];
    readonly quotes: readonly EvidenceRef[];
    readonly words: number;
  } | null;
  /** Concrete openings: audience words nobody owns, voice positions nobody takes. */
  readonly whitespace: readonly string[];
  readonly limitations: readonly string[];
}

const textOf = (e: Extraction): string => e.segments.map((s) => s.text).join("\n");

const entityName = (s: Source, brand: string): string => (s.role === "cliente" ? brand : s.entity?.trim() || s.label);

const firstEvidence = (extractions: readonly Extraction[], phrase: string, max = 2): EvidenceRef[] => {
  const out: EvidenceRef[] = [];
  for (const e of extractions) {
    for (const s of e.segments) {
      const at = findPhrase(s.text, phrase)[0];
      if (at !== undefined) {
        out.push({ sourceId: e.sourceId, locator: s.locator, excerpt: excerpt(s.text, at, 70) });
        break;
      }
    }
    if (out.length >= max) break;
  }
  return out;
};

export const buildLandscape = (input: { brand: string; sector: string; sources: readonly Source[]; extractions: readonly Extraction[]; lexicon: readonly LexiconEntry[] }): Landscape => {
  const limitations: string[] = [];
  const byId = new Map(input.sources.map((s) => [s.id, s]));
  const groups = new Map<string, { role: EntityProfile["role"]; extractions: Extraction[] }>();
  const audience: Extraction[] = [];
  for (const e of input.extractions) {
    const s = byId.get(e.sourceId);
    if (!s) continue;
    if (s.role === "publico") {
      audience.push(e);
      continue;
    }
    if (s.role !== "cliente" && s.role !== "concorrente" && s.role !== "referencia") continue;
    const name = entityName(s, input.brand);
    const g = groups.get(fold(name)) ?? { role: s.role, extractions: [] };
    g.extractions.push(e);
    groups.set(fold(name), g);
  }
  const names = new Map<string, string>();
  for (const e of input.extractions) {
    const s = byId.get(e.sourceId);
    if (s && s.role !== "publico") names.set(fold(entityName(s, input.brand)), entityName(s, input.brand));
  }
  const keys = [...groups.keys()];
  const corpora = keys.map((k) => groups.get(k)!.extractions.map(textOf).join("\n"));
  const tokenDocs = corpora.map((t) => terms(t));
  const tfidf = new TfIdf(tokenDocs);

  const entities: EntityProfile[] = keys.map((k, i) => {
    const g = groups.get(k)!;
    const text = corpora[i]!;
    const lang = g.extractions[0]?.lang ?? "pt";
    const voice = measureVoice(text, lang);
    const vec = tfidf.vectors[i]!;
    const others = tokenDocs.filter((_, j) => j !== i).map((d) => new Set(d));
    const own = [...vec.entries()]
      .filter(([t]) => !others.some((o) => o.has(t)) && t.length > 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([t]) => t);
    const forms = surfaceForms([text]);
    const claims: EvidenceRef[] = [];
    for (const e of g.extractions) {
      for (const s of e.segments.filter((x) => x.kind === "title" || x.kind === "meta" || x.kind === "heading").slice(0, 5)) {
        claims.push({ sourceId: e.sourceId, locator: s.locator, excerpt: s.text.slice(0, 220) });
      }
    }
    const genericHits = g.extractions.flatMap((e) =>
      findLexicon(textOf(e), input.lexicon, { sector: input.sector, lang }).map((h) => ({ term: h.term, kind: h.kind, sourceId: e.sourceId, excerpt: h.excerpt })),
    );
    return {
      entity: names.get(k) ?? k,
      role: g.role,
      sources: g.extractions.map((e) => e.sourceId),
      words: voice.words,
      voice,
      voiceSummary: describeVoice(voice),
      claims: claims.slice(0, 10),
      ownTerms: own.map((t) => bestForm(forms, t)),
      genericHits: genericHits.slice(0, 40),
      genericPer100: voice.words ? round((genericHits.length / voice.words) * 100, 2) : 0,
    };
  });

  // Conventions: what most competitors say.
  const compIdx = keys.map((k, i) => ({ k, i })).filter(({ k }) => groups.get(k)!.role === "concorrente");
  const conventions: Convention[] = [];
  if (compIdx.length >= 2) {
    const df = new Map<string, Set<number>>();
    compIdx.forEach(({ i }) => {
      for (const t of new Set(tokenDocs[i])) {
        const set = df.get(t) ?? new Set<number>();
        set.add(i);
        df.set(t, set);
      }
    });
    const compTexts = compIdx.map(({ i }) => corpora[i]!);
    const compExtractions = compIdx.flatMap(({ k }) => groups.get(k)!.extractions);
    const forms = surfaceForms(compTexts);
    const minShare = compIdx.length >= 4 ? 0.5 : 0.66;
    const generic = new Set(["empresa", "cliente", "client", "produto", "servico", "site", "pagina", "contato", "termo", "politica", "privacidade", "cooki", "direito", "reservado", "copyright", "login", "entrar", "menu", "buscar", "carrinho", "home", "inicio", "blog"]);
    const candidates = [...df.entries()]
      .map(([t, set]) => ({ t, share: set.size / compIdx.length, set }))
      .filter(({ t, share }) => share >= minShare && !t.split(" ").some((p) => generic.has(p) || p.length < 4));
    // Prefer bigrams; drop unigrams already covered by a kept bigram.
    candidates.sort((a, b) => b.share - a.share || b.t.split(" ").length - a.t.split(" ").length);
    const kept: typeof candidates = [];
    for (const c of candidates) {
      if (c.t.split(" ").length === 1 && kept.some((k) => k.t.split(" ").length === 2 && k.t.split(" ").includes(c.t) && k.share >= c.share)) continue;
      kept.push(c);
      if (kept.length >= 40) break;
    }
    for (const c of kept) {
      const term = bestForm(forms, c.t);
      conventions.push({
        term,
        stems: c.t,
        share: round(c.share, 2),
        entities: [...c.set].map((i) => names.get(keys[i]!) ?? keys[i]!),
        evidence: firstEvidence(compExtractions, term),
      });
    }
  } else {
    limitations.push("menos de 2 concorrentes com texto: as convenções da categoria não podem ser medidas. Adicione sites de 3 a 6 concorrentes com o papel \"concorrente\".");
  }

  const similarity: Landscape["similarity"][number][] = [];
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
    similarity.push({ a: names.get(keys[a]!) ?? keys[a]!, b: names.get(keys[b]!) ?? keys[b]!, value: round(TfIdf.cosine(tfidf.vectors[a]!, tfidf.vectors[b]!), 3) });
  }
  const brandKey = keys.find((k) => groups.get(k)!.role === "cliente");
  const brandClosest = brandKey
    ? keys
        .map((k, i) => ({ k, i }))
        .filter(({ k }) => k !== brandKey && groups.get(k)!.role === "concorrente")
        .map(({ k, i }) => ({ entity: names.get(k) ?? k, value: round(TfIdf.cosine(tfidf.vectors[keys.indexOf(brandKey)]!, tfidf.vectors[i]!), 3) }))
        .sort((x, y) => y.value - x.value)
    : [];
  if (!brandKey) limitations.push("nenhum material da própria marca (papel \"cliente\"): não dá para medir como ela soa hoje. Para marca nova, isso é esperado.");

  const comps = entities.filter((e) => e.role === "concorrente" && e.words > 40);
  const categoryVoice = comps.length
    ? {
        formality: round(comps.reduce((n, e) => n + e.voice.formality, 0) / comps.length, 1),
        avgSentence: round(comps.reduce((n, e) => n + e.voice.avgSentence, 0) / comps.length, 1),
        we: round(comps.reduce((n, e) => n + e.voice.person.we, 0) / comps.length, 2),
        you: round(comps.reduce((n, e) => n + e.voice.person.you, 0) / comps.length, 2),
        exclamations: round(comps.reduce((n, e) => n + e.voice.exclamationsPer100Sentences, 0) / comps.length, 1),
      }
    : null;

  let audienceOut: Landscape["audience"] = null;
  const whitespace: string[] = [];
  if (audience.length) {
    const atext = audience.map(textOf).join("\n");
    const grams = new Map<string, number>();
    for (const sent of sentences(atext)) {
      const toks = contentTokens(sent).map(stem);
      for (const g of [...ngrams(toks, 2), ...toks.filter((t) => t.length > 4)]) grams.set(g, (grams.get(g) ?? 0) + 1);
    }
    const compVocab = new Set(compIdx.flatMap(({ i }) => tokenDocs[i]!));
    const forms = surfaceForms([atext]);
    const phrases = [...grams.entries()]
      .filter(([g, n]) => (g.split(" ").length > 1 ? n >= 2 : n >= 3))
      .sort((a, b) => b[1] * b[0].split(" ").length - a[1] * a[0].split(" ").length)
      .slice(0, 30)
      .map(([g, n]) => ({ phrase: bestForm(forms, g), count: n, usedByCompetitors: compVocab.has(g) }));
    const quotes: EvidenceRef[] = [];
    for (const e of audience) for (const s of e.segments) {
      for (const sent of sentences(s.text)) {
        const n = words(sent).length;
        if (n >= 8 && n <= 45 && quotes.length < 24) quotes.push({ sourceId: e.sourceId, locator: s.locator, excerpt: sent });
      }
    }
    audienceOut = { phrases, quotes, words: words(atext).length };
    const unowned = phrases.filter((p) => !p.usedByCompetitors && p.count >= 2 && p.phrase.split(" ").length >= 2).slice(0, 6);
    if (unowned.length) whitespace.push(`O público fala em ${unowned.map((p) => `"${p.phrase}"`).join(", ")}, e nenhum concorrente usa essas palavras.`);
  } else {
    limitations.push("nenhuma fonte com a voz do público (avaliações, entrevistas, comentários): os insights vão depender só do que a marca declara. Adicione com o papel \"publico\".");
  }
  if (categoryVoice) {
    if (categoryVoice.formality >= 3.6) whitespace.push(`A categoria fala de modo formal (formalidade ${categoryVoice.formality}/5): uma voz direta e próxima se destacaria.`);
    else if (categoryVoice.formality <= 2.4) whitespace.push(`A categoria fala de modo descontraído (formalidade ${categoryVoice.formality}/5): sobriedade e precisão se destacariam.`);
    if (categoryVoice.we > 0.55) whitespace.push(`Os concorrentes falam de si mesmos (${Math.round(categoryVoice.we * 100)}% das marcas de pessoa são "nós"): falar da vida do cliente é espaço livre.`);
    if (categoryVoice.exclamations > 15) whitespace.push("A categoria grita (muitas exclamações): calma e confiança seriam diferentes.");
  }
  const avgGeneric = comps.length ? comps.reduce((n, e) => n + e.genericPer100, 0) / comps.length : 0;
  if (avgGeneric > 1) whitespace.push(`Os concorrentes usam ${round(avgGeneric, 1)} termos genéricos a cada 100 palavras: especificidade (números, nomes, provas) já diferencia.`);

  return {
    builtAt: new Date().toISOString(),
    brand: input.brand,
    entities,
    conventions,
    similarity,
    brandClosest,
    categoryVoice,
    audience: audienceOut,
    whitespace,
    limitations,
  };
};

/** Convention terms as a set of stems, for overlap checks. */
export const conventionStems = (l: Landscape | null): Set<string> => new Set((l?.conventions ?? []).map((c) => c.stems));
