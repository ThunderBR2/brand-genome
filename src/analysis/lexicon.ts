import type { Canon, LexiconEntry, LexiconKind } from "../canon/types.js";
import { excerpt, findPhrase, fold } from "../core/text.js";

/**
 * A minimal seed so the generic-language check works even before the canon is
 * built. The canon's lexicon (hundreds of terms with sources) extends it.
 */
const SEED: LexiconEntry[] = [
  ...[
    ["soluções inovadoras", "promessa-vaga"], ["inovação", "adjetivo-vazio"], ["inovador", "adjetivo-vazio"], ["excelência", "promessa-vaga"],
    ["qualidade", "promessa-vaga"], ["compromisso com", "promessa-vaga"], ["paixão por", "cliche"], ["transformar vidas", "proposito-generico"],
    ["fazer a diferença", "proposito-generico"], ["mundo melhor", "proposito-generico"], ["entregar valor", "jargao"], ["agregar valor", "jargao"],
    ["sinergia", "jargao"], ["alavancar", "jargao"], ["jornada", "jargao"], ["experiência única", "cliche"], ["o melhor para você", "cliche"],
    ["foco no cliente", "promessa-vaga"], ["cliente no centro", "cliche"], ["referência no mercado", "promessa-vaga"], ["líder de mercado", "promessa-vaga"],
    ["há mais de", "cliche"], ["tecnologia de ponta", "cliche"], ["soluções completas", "promessa-vaga"], ["de ponta a ponta", "jargao"],
    ["próximo nível", "cliche"], ["sem igual", "cliche"], ["confiança", "adjetivo-vazio"], ["ética", "adjetivo-vazio"], ["transparência", "adjetivo-vazio"],
    ["comprometimento", "adjetivo-vazio"], ["respeito", "adjetivo-vazio"], ["humanizado", "cliche"], ["disruptivo", "jargao"], ["revolucionário", "cliche"],
  ].map(([term, kind]) => ({ term: term!, lang: "pt" as const, kind: kind as LexiconKind, category: "", replacement: "", sources: ["seed"] })),
  ...[
    ["innovative solutions", "promessa-vaga"], ["innovation", "adjetivo-vazio"], ["world-class", "cliche"], ["best-in-class", "cliche"], ["cutting-edge", "cliche"],
    ["seamless", "cliche"], ["synergy", "jargao"], ["leverage", "jargao"], ["empower", "jargao"], ["passionate about", "cliche"], ["customer-centric", "jargao"],
    ["next level", "cliche"], ["game-changer", "cliche"], ["disruptive", "jargao"], ["quality", "promessa-vaga"], ["excellence", "promessa-vaga"],
    ["make a difference", "proposito-generico"], ["better world", "proposito-generico"], ["end-to-end", "jargao"], ["one-stop shop", "cliche"],
  ].map(([term, kind]) => ({ term: term!, lang: "en" as const, kind: kind as LexiconKind, category: "", replacement: "", sources: ["seed"] })),
];

export interface LexiconHit {
  readonly term: string;
  readonly kind: LexiconKind;
  readonly category: string;
  readonly replacement: string;
  readonly at: number;
  readonly excerpt: string;
}

export const lexiconFrom = (canon: Canon | null): LexiconEntry[] => {
  const map = new Map<string, LexiconEntry>();
  for (const e of [...SEED, ...(canon?.lexicon ?? [])]) {
    const key = `${e.lang}:${fold(e.term)}:${e.kind === "categoria" ? fold(e.category) : ""}`;
    const prev = map.get(key);
    map.set(key, prev && prev.replacement ? prev : e);
  }
  return [...map.values()];
};

const SECTOR_ALIASES: Record<string, string[]> = {
  banco: ["banco", "fintech", "financeiro", "finance", "bank"],
  fintech: ["fintech", "banco", "financeiro", "pagamentos"],
  beleza: ["beleza", "cosmetico", "cosmeticos", "beauty", "skincare"],
  alimentacao: ["alimentacao", "comida", "food", "restaurante", "cafe", "cafeteria"],
  bebida: ["bebida", "bebidas", "cerveja", "drink", "beverage", "cafe"],
  varejo: ["varejo", "loja", "retail", "ecommerce", "e-commerce"],
  moda: ["moda", "fashion", "vestuario", "roupa"],
  tech: ["tech", "tecnologia", "software", "startup", "app"],
  saas: ["saas", "software", "b2b"],
  saude: ["saude", "health", "clinica", "hospital", "bem-estar"],
  educacao: ["educacao", "escola", "curso", "education", "edtech"],
  imobiliario: ["imobiliario", "imobiliaria", "construtora", "real estate"],
  automotivo: ["automotivo", "carro", "auto", "automotive"],
  agro: ["agro", "agronegocio", "agricultura"],
  consultoria: ["consultoria", "consulting", "gestao"],
  agencia: ["agencia", "agency", "estudio", "studio", "design", "marketing"],
  luxo: ["luxo", "luxury", "premium"],
  sustentabilidade: ["sustentabilidade", "sustentavel", "esg"],
  "noturno-eventos": ["noturno", "eventos", "balada", "festa", "nightlife", "casa noturna", "show"],
};

/** Does a lexicon category apply to this project's sector? */
export const sectorMatches = (category: string, sector: string): boolean => {
  if (!category) return true;
  const c = fold(category);
  const s = fold(sector);
  if (!s) return false;
  if (s.includes(c) || c.includes(s)) return true;
  return (SECTOR_ALIASES[c] ?? []).some((a) => s.includes(fold(a)));
};

/** Find lexicon terms in a text. Category terms only count when they match the sector. */
export const findLexicon = (text: string, lexicon: readonly LexiconEntry[], opts: { sector?: string; lang?: "pt" | "en" } = {}): LexiconHit[] => {
  const hits: LexiconHit[] = [];
  const taken: [number, number][] = [];
  const sorted = [...lexicon].sort((a, b) => b.term.length - a.term.length);
  for (const e of sorted) {
    if (opts.lang && e.lang !== opts.lang && !(e.lang === "en" && /[a-z]/.test(e.term) && e.term.split(" ").length > 1)) continue;
    if (e.kind === "categoria" && !sectorMatches(e.category, opts.sector ?? "")) continue;
    for (const at of findPhrase(text, e.term, { accents: true })) {
      const end = at + e.term.length;
      if (taken.some(([s, f]) => at < f && end > s)) continue;
      taken.push([at, end]);
      hits.push({ term: e.term, kind: e.kind, category: e.category, replacement: e.replacement, at, excerpt: excerpt(text, at, 60) });
    }
  }
  return hits.sort((a, b) => a.at - b.at);
};
