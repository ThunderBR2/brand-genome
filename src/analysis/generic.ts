import type { LexiconEntry } from "../canon/types.js";
import { contentTokens, count, excerpt, findPhrase, fold, round, sentences, STOPWORDS, terms, TfIdf, words } from "../core/text.js";
import type { Landscape } from "./landscape.js";
import { findLexicon } from "./lexicon.js";
import { measureVoice, type VoiceMetrics } from "./voice.js";

/** The voice a brand committed to (output of the "voz" stage), in the form the checker reads. */
export interface VoiceSpec {
  readonly avoid: readonly string[];
  readonly use: readonly string[];
  readonly ownWords: readonly string[];
  readonly person?: "nos" | "voce" | "eu" | "terceira" | "misto" | undefined;
  readonly formality?: number | undefined;
  readonly sentenceTarget?: number | undefined;
  readonly sentenceMax?: number | undefined;
  readonly exclamation?: "nunca" | "raro" | "livre" | undefined;
  readonly emoji?: "nunca" | "raro" | "livre" | undefined;
}

export interface Deviation {
  readonly severity: "alta" | "media" | "baixa";
  readonly facet: "generico" | "convencao" | "troca" | "especificidade" | "voz";
  readonly message: string;
  readonly excerpt?: string;
  readonly fix?: string;
}

export interface Assessment {
  readonly score: number;
  readonly verdict: string;
  readonly facets: readonly { facet: Deviation["facet"]; label: string; score: number; weight: number; note: string }[];
  readonly deviations: readonly Deviation[];
  readonly voice: VoiceMetrics;
  readonly closest: readonly { entity: string; value: number }[];
}

export interface AssessContext {
  readonly lexicon: readonly LexiconEntry[];
  readonly sector: string;
  readonly lang: "pt" | "en";
  readonly landscape?: Landscape | null;
  /** Competitors' full text, by name, for the swap test. */
  readonly competitorTexts?: ReadonlyMap<string, string>;
  /** The brand's own strategic text (platform, positioning, narrative), when it exists. */
  readonly brandText?: string;
  readonly brandName?: string;
  readonly voice?: VoiceSpec | null;
}

const FACET_LABEL: Record<Deviation["facet"], string> = {
  generico: "Linguagem genérica",
  convencao: "Convenções da categoria",
  troca: "Teste de troca (soa como concorrente?)",
  especificidade: "Especificidade",
  voz: "Fidelidade à voz",
};
const KIND_WEIGHT: Record<string, number> = { cliche: 1, jargao: 1, "promessa-vaga": 1.2, "proposito-generico": 1.2, categoria: 1, "adjetivo-vazio": 0.5 };
const KIND_LABEL: Record<string, string> = { cliche: "clichê", jargao: "jargão", "promessa-vaga": "promessa vaga", "proposito-generico": "propósito genérico", categoria: "convenção da categoria", "adjetivo-vazio": "adjetivo vazio" };

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

const tokensFor = (t: string): string[] => terms(t);

/** Capitalized words that are not sentence-initial: names, places, products (signals of specificity). */
const properNouns = (text: string, brandName?: string): string[] => {
  const out: string[] = [];
  const brand = brandName ? fold(brandName) : "";
  for (const s of sentences(text)) {
    const ws = words(s);
    ws.slice(1).forEach((w) => {
      if (/^\p{Lu}/u.test(w) && !STOPWORDS.has(fold(w)) && fold(w) !== brand && w.length > 1 && w !== w.toUpperCase()) out.push(w);
    });
  }
  return out;
};

/**
 * Score a piece of text (a tagline, a manifesto, a post, a page) for how
 * generic it is and how well it holds the brand's voice. Every deviation
 * says where it is and what to do instead.
 */
export const assessText = (text: string, ctx: AssessContext): Assessment => {
  const deviations: Deviation[] = [];
  const facets: Assessment["facets"][number][] = [];
  const voice = measureVoice(text, ctx.lang);
  const n = Math.max(1, voice.words);
  const short = voice.words < 14;

  // 1. Generic language from the canon's lexicon.
  const hits = findLexicon(text, ctx.lexicon, { sector: ctx.sector, lang: ctx.lang });
  const weighted = hits.reduce((s, h) => s + (KIND_WEIGHT[h.kind] ?? 1), 0);
  const density = (weighted / n) * 100;
  const genericScore = clamp(100 - density * (short ? 9 : 16));
  for (const h of hits.slice(0, 25)) {
    deviations.push({
      severity: h.kind === "adjetivo-vazio" ? "baixa" : "media",
      facet: "generico",
      message: `"${h.term}" é ${KIND_LABEL[h.kind] ?? h.kind}${h.kind === "categoria" && h.category ? ` (${h.category})` : ""}: qualquer marca poderia dizer isso.`,
      excerpt: h.excerpt,
      fix: h.replacement || "Troque por um fato, um número, um exemplo ou uma palavra que só esta marca usaria.",
    });
  }
  facets.push({ facet: "generico", label: FACET_LABEL.generico, score: genericScore, weight: 0.3, note: hits.length ? `${hits.length} termo(s) genérico(s), ${round(density, 1)} a cada 100 palavras` : "nenhum termo genérico do léxico" });

  // 2. Category conventions measured among competitors.
  const conv = ctx.landscape?.conventions ?? [];
  if (conv.length) {
    const toks = tokensFor(text);
    const convSet = new Map(conv.map((c) => [c.stems, c]));
    const used = new Map<string, number>();
    for (const t of toks) if (convSet.has(t)) used.set(t, (used.get(t) ?? 0) + 1);
    const contentCount = contentTokens(text).length || 1;
    const share = Math.min(1, [...used.entries()].reduce((s, [t, c]) => s + c * t.split(" ").length, 0) / contentCount);
    const score = clamp(100 - Math.max(0, share - 0.04) * 260);
    const top = [...used.keys()].map((k) => convSet.get(k)!).sort((a, b) => b.share - a.share);
    if (top.length && share > 0.08) {
      deviations.push({
        severity: share > 0.2 ? "alta" : "media",
        facet: "convencao",
        message: `O texto repete o que a categoria inteira diz: ${top.slice(0, 6).map((c) => `"${c.term}" (${Math.round(c.share * 100)}% dos concorrentes)`).join(", ")}.`,
        fix: "Mantenha só a convenção que for obrigatória para ser entendido; troque o resto pelo que a marca tem e os outros não.",
      });
    }
    facets.push({ facet: "convencao", label: FACET_LABEL.convencao, score, weight: 0.2, note: `${Math.round(share * 100)}% das palavras de conteúdo são convenções da categoria` });
  }

  // 3. Swap test: does this read like a competitor?
  let closest: { entity: string; value: number }[] = [];
  if (ctx.competitorTexts && ctx.competitorTexts.size && !short) {
    const names = [...ctx.competitorTexts.keys()];
    const docs = [...names.map((k) => tokensFor(ctx.competitorTexts!.get(k)!)), ...(ctx.brandText ? [tokensFor(ctx.brandText)] : [])];
    const model = new TfIdf(docs);
    const v = model.vector(tokensFor(text));
    closest = names.map((name, i) => ({ entity: name, value: round(TfIdf.cosine(v, model.vectors[i]!), 3) })).sort((a, b) => b.value - a.value);
    const brandSim = ctx.brandText ? TfIdf.cosine(v, model.vectors[names.length]!) : 0;
    const top = closest[0]!;
    let score = clamp(100 - Math.max(0, top.value - 0.12) * 220);
    if (ctx.brandText && top.value > brandSim + 0.03 && top.value > 0.15) {
      score = Math.min(score, 55);
      deviations.push({ severity: top.value > 0.3 ? "alta" : "media", facet: "troca", message: `Este texto soa mais como ${top.entity} (similaridade ${top.value}) do que como a plataforma da marca (${round(brandSim, 3)}).`, fix: "Puxe o texto para as palavras próprias, os pilares e as provas da marca." });
    } else if (top.value > 0.3) {
      deviations.push({ severity: "media", facet: "troca", message: `O vocabulário está muito próximo do de ${top.entity} (similaridade ${top.value}).`, fix: "Troque as palavras que vocês dois usam pelas que só esta marca usaria." });
    }
    facets.push({ facet: "troca", label: FACET_LABEL.troca, score, weight: 0.2, note: `mais próximo: ${top.entity} (${top.value})${ctx.brandText ? `; plataforma da marca: ${round(brandSim, 3)}` : ""}` });
  }
  if (ctx.voice?.ownWords.length || ctx.brandName) {
    const own = [...(ctx.voice?.ownWords ?? [])];
    const usesOwn = own.some((w) => findPhrase(text, w).length);
    if (!short && voice.words > 25 && !usesOwn && !hits.length && own.length) {
      deviations.push({ severity: "baixa", facet: "troca", message: "Nenhuma das palavras próprias da marca aparece: o texto pode ser correto e ainda assim anônimo.", fix: `Use pelo menos uma: ${own.slice(0, 6).join(", ")}.` });
    }
  }

  // 4. Specificity: numbers, names, concrete detail.
  if (!short) {
    const proper = properNouns(text, ctx.brandName);
    const per100 = voice.numbersPer100 + (proper.length / n) * 100;
    const score = clamp(35 + per100 * 18);
    if (per100 < 1 && voice.words > 40) {
      deviations.push({ severity: "media", facet: "especificidade", message: "Não há nenhum número, nome ou detalhe concreto: o texto afirma, mas não prova.", fix: "Inclua um fato verificável (quanto, quando, onde, quem, como)." });
    }
    facets.push({ facet: "especificidade", label: FACET_LABEL.especificidade, score, weight: 0.1, note: `${round(voice.numbersPer100, 1)} números e ${proper.length} nomes próprios` });
  }

  // 5. The brand's committed voice.
  const spec = ctx.voice;
  if (spec) {
    let penalty = 0;
    for (const w of spec.avoid) {
      const at = findPhrase(text, w);
      if (at.length) {
        penalty += 14;
        deviations.push({ severity: "alta", facet: "voz", message: `"${w}" está na lista de palavras que a marca não usa.`, excerpt: excerpt(text, at[0]!, 60), fix: spec.use.length ? `Prefira: ${spec.use.slice(0, 5).join(", ")}.` : "Reescreva sem essa palavra." });
      }
    }
    if (spec.sentenceTarget && voice.sentences >= 2) {
      const diff = Math.abs(voice.avgSentence - spec.sentenceTarget) / spec.sentenceTarget;
      if (diff > 0.35) {
        penalty += diff > 0.7 ? 18 : 10;
        deviations.push({ severity: "media", facet: "voz", message: `Frases com ${voice.avgSentence} palavras em média; a voz pede cerca de ${spec.sentenceTarget}.`, fix: voice.avgSentence > spec.sentenceTarget ? "Corte frases longas em duas; uma ideia por frase." : "Junte frases picadas quando a ideia for uma só." });
      }
    }
    if (spec.sentenceMax) {
      const long = sentences(text).filter((s) => words(s).length > spec.sentenceMax!);
      for (const s of long.slice(0, 3)) {
        penalty += 5;
        deviations.push({ severity: "baixa", facet: "voz", message: `Frase com ${words(s).length} palavras (limite ${spec.sentenceMax}).`, excerpt: s.slice(0, 160) });
      }
    }
    if (spec.person && spec.person !== "misto") {
      const { we, you, it } = voice.person;
      const want = spec.person === "voce" ? you : spec.person === "nos" || spec.person === "eu" ? we : it;
      const other = Math.max(we, you, it);
      if (we + you + it > 0 && want + 0.15 < other) {
        penalty += 10;
        deviations.push({ severity: "media", facet: "voz", message: `A voz pede falar como "${spec.person}", mas o texto fala mais como ${other === we ? "nós" : other === you ? "você" : "terceira pessoa"}.`, fix: spec.person === "voce" ? "Traga o leitor para o centro: o que muda para ele." : "Assuma a autoria: diga o que a marca faz e acredita." });
      }
    }
    if (spec.exclamation === "nunca" && voice.exclamationsPer100Sentences > 0) {
      penalty += 10;
      deviations.push({ severity: "media", facet: "voz", message: "A voz não usa exclamação, e o texto usa.", fix: "Tire as exclamações; deixe a força nas palavras." });
    } else if (spec.exclamation === "raro" && voice.exclamationsPer100Sentences > 12) {
      penalty += 6;
      deviations.push({ severity: "baixa", facet: "voz", message: `Exclamação em ${voice.exclamationsPer100Sentences}% das frases; a voz usa raramente.` });
    }
    if (spec.emoji === "nunca" && voice.emojiPer1000Words > 0) {
      penalty += 8;
      deviations.push({ severity: "media", facet: "voz", message: "A voz não usa emoji, e o texto usa." });
    }
    if (spec.formality && voice.sentences >= 2) {
      const d = Math.abs(voice.formality - spec.formality);
      if (d >= 1) {
        penalty += d >= 1.5 ? 14 : 7;
        deviations.push({ severity: d >= 1.5 ? "media" : "baixa", facet: "voz", message: `Formalidade medida ${voice.formality}/5; a voz pede ${spec.formality}/5.`, fix: voice.formality > spec.formality ? "Menos rodeio, palavras mais curtas, fale com a pessoa." : "Menos gíria e exclamação, mais precisão." });
      }
    }
    facets.push({ facet: "voz", label: FACET_LABEL.voz, score: clamp(100 - penalty), weight: 0.2, note: `formalidade ${voice.formality}/5, frases de ${voice.avgSentence} palavras` });
  }

  const totalW = facets.reduce((s, f) => s + f.weight, 0) || 1;
  const score = clamp(facets.reduce((s, f) => s + f.score * f.weight, 0) / totalW);
  const highs = deviations.filter((d) => d.severity === "alta").length;
  const verdict = score >= 85 && !highs ? "forte: específico e com cara de marca" : score >= 70 ? "bom, com ajustes" : score >= 50 ? "fraco: ainda soa genérico" : "genérico: reescreva";
  return { score, verdict, facets, deviations: deviations.sort((a, b) => ["alta", "media", "baixa"].indexOf(a.severity) - ["alta", "media", "baixa"].indexOf(b.severity)), voice, closest };
};

/** Count how often each of the given phrases appears (for convention checks of lists). */
export const phraseHits = (text: string, phrases: readonly string[]): Map<string, number> =>
  count(phrases.flatMap((p) => findPhrase(text, p).map(() => p)));
