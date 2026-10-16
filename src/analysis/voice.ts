import { fold, round, sentences, words, type Lang } from "../core/text.js";

/** Measured voice of a text. Every number is computed, never judged. */
export interface VoiceMetrics {
  readonly words: number;
  readonly sentences: number;
  readonly avgSentence: number;
  readonly p90Sentence: number;
  readonly maxSentence: number;
  /** Share of person markers: "we" (nós, nosso, a gente), "you" (você, seu), "it" (a empresa, the company). */
  readonly person: { readonly we: number; readonly you: number; readonly it: number };
  readonly informalPer100: number;
  readonly formalPer100: number;
  /** 1 (very casual) to 5 (very formal), from markers, sentence length and punctuation. */
  readonly formality: number;
  readonly exclamationsPer100Sentences: number;
  readonly questionsPer100Sentences: number;
  readonly emojiPer1000Words: number;
  readonly capsWordsPer100: number;
  readonly numbersPer100: number;
  readonly longWordShare: number;
}

const WE_PT = /^(nosso|nossa|nossos|nossas|conosco|somos|estamos|fazemos|acreditamos|criamos|queremos|torramos|vendemos|oferecemos|temos|trabalhamos)$/;
const YOU_PT = /^(voce|voces|seu|sua|seus|suas|contigo|vc|te|teu|tua)$/;
const WE_EN = /^(we|our|ours|us|we're|we've|we'll)$/;
const YOU_EN = /^(you|your|yours|you're|you've|you'll)$/;
const IT_RE = /\b(a empresa|a companhia|a organizacao|a marca|the company|the brand|the organization)\b/g;

// Unambiguous casual markers only (no "cara", "beleza", "massa": they are also ordinary words). Matched on lowercase text, accents kept.
const INFORMAL_PT = /(?<![\p{L}])(pra|pras|pros|tá|né|a gente|vc|vcs|bora|valeu|galera|tô|tamo|tamos|tipo assim|olha só|fala sério|beleza\?|show de bola)(?![\p{L}])/gu;
const FORMAL_PT = /\b(prezado|prezada|prezados|vossa senhoria|mediante|outrossim|ademais|doravante|vimos por meio|solicitamos|informamos que|cordialmente|atenciosamente|no tocante|tendo em vista|haja vista|destarte|todavia|outrossim|em conformidade)\b/g;
const INFORMAL_EN = /\b(gonna|wanna|gotta|hey|awesome|yeah|stuff|kinda|folks|y'all|super cool)\b/g;
const CONTRACTION_EN = /\b\w+'(re|ll|ve|d|t)\b/g;
const FORMAL_EN = /\b(hereby|pursuant|kindly|therefore|furthermore|moreover|whereas|herein|thereof|nevertheless|accordingly|regards|sincerely)\b/g;

const EMOJI = /\p{Extended_Pictographic}/gu;

const pct = (n: number, d: number, scale = 100): number => (d ? round((n / d) * scale, 2) : 0);

export const measureVoice = (text: string, lang: Lang = "pt"): VoiceMetrics => {
  const sents = sentences(text);
  const lens = sents.map((s) => words(s).length).sort((a, b) => a - b);
  const all = words(text);
  const folded = all.map(fold);
  const ftext = fold(text);
  let we = 0;
  let you = 0;
  const lower = text.toLowerCase();
  for (const w of folded) {
    if (lang === "pt" ? WE_PT.test(w) : WE_EN.test(w)) we++;
    else if (lang === "pt" ? YOU_PT.test(w) : YOU_EN.test(w)) you++;
  }
  if (lang === "pt") {
    // "nós" only with the accent: folded "nos" is also the contraction "em + os".
    we += (lower.match(/(?<![\p{L}])nós(?![\p{L}])/gu) ?? []).length;
    we += (ftext.match(/\ba gente\b/g) ?? []).length;
  }
  const it = (ftext.match(IT_RE) ?? []).length;
  const personTotal = we + you + it || 1;
  const informal = lang === "pt" ? (lower.match(INFORMAL_PT) ?? []).length : (lower.match(INFORMAL_EN) ?? []).length + 0.25 * (lower.match(CONTRACTION_EN) ?? []).length;
  const formal = lang === "pt" ? (ftext.match(FORMAL_PT) ?? []).length : (ftext.match(FORMAL_EN) ?? []).length;
  const excl = sents.filter((s) => /!\s*$/.test(s) || /!/.test(s)).length;
  const quest = sents.filter((s) => /\?/.test(s)).length;
  const emoji = (text.match(EMOJI) ?? []).length;
  const caps = all.filter((w) => w.length > 3 && w === w.toUpperCase() && /\p{L}/u.test(w)).length;
  const numbers = (text.match(/\d+([.,]\d+)?\s*(%|x|mil|milh|bi|k\b)?/gi) ?? []).length;
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const longShare = all.length ? all.filter((w) => w.length >= 12).length / all.length : 0;
  const n = all.length || 1;
  // Formality: start neutral, move with markers, sentence length, exclamation, emoji and "you" address.
  let f = 3;
  f += Math.min(1.5, (formal / n) * 100 * 0.6);
  f -= Math.min(1.5, (informal / n) * 100 * 0.5);
  f += avg > 24 ? 0.6 : avg > 18 ? 0.3 : avg < 10 && lens.length > 2 ? -0.4 : 0;
  f += longShare > 0.08 ? 0.4 : 0;
  f -= pct(excl, sents.length || 1) > 15 ? 0.5 : 0;
  f -= emoji > 0 ? 0.4 : 0;
  f -= you / personTotal > 0.5 && informal > 0 ? 0.2 : 0;
  f += it / personTotal > 0.4 ? 0.4 : 0;
  return {
    words: all.length,
    sentences: sents.length,
    avgSentence: round(avg, 1),
    p90Sentence: lens.length ? lens[Math.min(lens.length - 1, Math.floor(lens.length * 0.9))]! : 0,
    maxSentence: lens.at(-1) ?? 0,
    person: { we: round(we / personTotal, 2), you: round(you / personTotal, 2), it: round(it / personTotal, 2) },
    informalPer100: pct(informal, n),
    formalPer100: pct(formal, n),
    formality: round(Math.max(1, Math.min(5, f)), 1),
    exclamationsPer100Sentences: pct(excl, sents.length || 1),
    questionsPer100Sentences: pct(quest, sents.length || 1),
    emojiPer1000Words: pct(emoji, n, 1000),
    capsWordsPer100: pct(caps, n),
    numbersPer100: pct(numbers, n),
    longWordShare: round(longShare, 3),
  };
};

export const describeVoice = (m: VoiceMetrics): string => {
  const parts: string[] = [];
  parts.push(m.formality >= 4 ? "formal" : m.formality <= 2 ? "descontraída" : "neutra");
  parts.push(`frases de ${m.avgSentence} palavras em média`);
  const lead = m.person.we >= m.person.you && m.person.we >= m.person.it ? "fala de si (nós)" : m.person.you >= m.person.it ? "fala com a pessoa (você)" : "fala na terceira pessoa (a empresa)";
  parts.push(lead);
  if (m.exclamationsPer100Sentences > 10) parts.push(`exclamação em ${m.exclamationsPer100Sentences}% das frases`);
  if (m.emojiPer1000Words > 0) parts.push("usa emoji");
  if (m.numbersPer100 >= 2) parts.push("usa números");
  return parts.join(", ");
};
