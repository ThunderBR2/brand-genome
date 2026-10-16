import { contentTokens, fold, stem } from "../core/text.js";
import { SCHOOL_LABEL, type Canon, type CardKind } from "./types.js";

type AnyCard = Canon["principles"][number] | Canon["frameworks"][number] | Canon["debates"][number] | Canon["cases"][number] | Canon["antipatterns"][number];

export interface CanonQuery {
  readonly text?: string;
  readonly kind?: CardKind;
  readonly stage?: string;
  readonly domain?: string;
  readonly school?: string;
  readonly limit?: number;
}

const cardText = (kind: CardKind, c: AnyCard): string => {
  switch (kind) {
    case "principle": { const p = c as Canon["principles"][number]; return `${p.title} ${p.title} ${p.statement} ${p.statement} ${p.why} ${p.how.join(" ")} ${p.tests.join(" ")} ${p.contexts}`; }
    case "framework": { const f = c as Canon["frameworks"][number]; return `${f.name} ${f.name} ${f.author} ${f.purpose} ${f.components.map((x) => `${x.name} ${x.description}`).join(" ")} ${f.steps.join(" ")}`; }
    case "debate": { const d = c as Canon["debates"][number]; return `${d.question} ${d.question} ${d.positions.map((p) => p.claim).join(" ")} ${d.synthesis} ${d.systemStance}`; }
    case "case": { const k = c as Canon["cases"][number]; return `${k.brand} ${k.brand} ${k.agency} ${k.sector} ${k.type} ${k.challenge} ${k.insight} ${k.strategy} ${k.lessons.join(" ")}`; }
    case "antipattern": { const a = c as Canon["antipatterns"][number]; return `${a.name} ${a.name} ${a.description} ${a.signals.join(" ")} ${a.fix}`; }
    default: return "";
  }
};

const collections = (canon: Canon): [CardKind, readonly AnyCard[]][] => [
  ["principle", canon.principles],
  ["framework", canon.frameworks],
  ["debate", canon.debates],
  ["case", canon.cases],
  ["antipattern", canon.antipatterns],
];

const quality = (kind: CardKind, c: AnyCard): number => {
  if (kind === "principle") {
    const p = c as Canon["principles"][number];
    return p.strength * (1 + Math.log2(1 + p.sourceCount)) * (p.support === "consolidado" ? 1.2 : 1);
  }
  if (kind === "case") return 1 + (c as Canon["cases"][number]).results.length * 0.2;
  return 1.5;
};

/** Ranked search over the canon: words in the query, filtered by kind, stage, domain and school. */
export const searchCanon = (canon: Canon, q: CanonQuery): { kind: CardKind; card: AnyCard; score: number }[] => {
  const terms = q.text ? [...new Set(contentTokens(q.text).map(stem))] : [];
  const out: { kind: CardKind; card: AnyCard; score: number }[] = [];
  for (const [kind, items] of collections(canon)) {
    if (q.kind && q.kind !== kind) continue;
    for (const card of items) {
      const c = card as AnyCard & { stage?: readonly string[]; domain?: readonly string[]; school?: string };
      if (q.stage && !(c.stage ?? []).includes(q.stage)) continue;
      if (q.domain && !(c.domain ?? []).includes(q.domain)) continue;
      if (q.school && c.school !== q.school && !(kind === "debate" && (card as Canon["debates"][number]).positions.some((p) => p.school === q.school))) continue;
      let match = 1;
      if (terms.length) {
        const bag = contentTokens(cardText(kind, card)).map(stem);
        const counts = new Map<string, number>();
        for (const t of bag) counts.set(t, (counts.get(t) ?? 0) + 1);
        let hit = 0;
        let covered = 0;
        for (const t of terms) {
          const n = counts.get(t) ?? 0;
          if (n) covered++;
          hit += Math.log2(1 + n);
        }
        if (!covered) continue;
        match = hit * (covered / terms.length) ** 2;
        if (fold(card.id).includes(fold(q.text!).replace(/\s+/g, "-"))) match *= 2;
      }
      out.push({ kind, card, score: match * quality(kind, card) });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, q.limit ?? 12);
};

export const findCard = (canon: Canon, id: string): { kind: CardKind; card: AnyCard } | null => {
  const key = fold(id).trim();
  for (const [kind, items] of collections(canon)) {
    const c = items.find((x) => x.id === key);
    if (c) return { kind, card: c };
  }
  const s = canon.sources.find((x) => x.id === id);
  return s ? { kind: "source", card: s as unknown as AnyCard } : null;
};

const srcLine = (canon: Canon, refs: readonly { id: string; locator?: string | undefined }[], max = 3): string => {
  const names = refs.slice(0, max).map((r) => {
    const s = canon.sources.find((x) => x.id === r.id);
    return s ? `${s.author ? `${s.author}, ` : ""}${s.title}${s.year ? ` (${s.year})` : ""}` : r.id;
  });
  return names.length ? `Fontes: ${names.join("; ")}${refs.length > max ? ` e mais ${refs.length - max}` : ""}` : "Fontes: —";
};

/** One card as compact markdown, for agents. `full` adds how-to, tests and pitfalls. */
export const cardMarkdown = (canon: Canon, kind: CardKind, card: AnyCard, full = false): string => {
  const L: string[] = [];
  if (kind === "principle") {
    const p = card as Canon["principles"][number];
    L.push(`**${p.title || p.id}** \`${p.id}\` — ${p.support === "consolidado" ? `consolidado (${p.sourceCount} fontes)` : "fonte única"}, força ${p.strength}/3, ${SCHOOL_LABEL[p.school]}, evidência ${p.evidence}${p.debatedIn.length ? ` · em debate` : ""}`);
    L.push(p.statement);
    if (p.why) L.push(`Por quê: ${p.why}`);
    if (full && p.how.length) L.push(`Como: ${p.how.map((h, i) => `(${i + 1}) ${h}`).join(" ")}`);
    if (p.tests.length) L.push(`Teste: ${(full ? p.tests : p.tests.slice(0, 2)).join(" | ")}`);
    if (full && p.contexts) L.push(`Quando vale: ${p.contexts}`);
    if (p.debatedIn.length) L.push(`Em debate com: ${p.debatedIn.join(", ")} (veja os debates antes de aplicar)`);
    L.push(srcLine(canon, p.sources));
  } else if (kind === "framework") {
    const f = card as Canon["frameworks"][number];
    L.push(`**${f.name}** \`${f.id}\`${f.author ? ` — ${f.author}` : ""}`);
    if (f.purpose) L.push(f.purpose);
    if (f.components.length) L.push(`Componentes: ${f.components.map((c) => (c.description && full ? `${c.name} (${c.description})` : c.name)).join("; ")}`);
    if (full && f.steps.length) L.push(`Passos: ${f.steps.map((s, i) => `(${i + 1}) ${s}`).join(" ")}`);
    if (f.pitfalls.length) L.push(`Armadilhas: ${(full ? f.pitfalls : f.pitfalls.slice(0, 2)).join("; ")}`);
    if (full && f.criticisms.length) L.push(`Críticas: ${f.criticisms.join("; ")}`);
    L.push(srcLine(canon, f.sources));
  } else if (kind === "debate") {
    const d = card as Canon["debates"][number];
    L.push(`**Debate: ${d.question}** \`${d.id}\``);
    for (const p of d.positions) L.push(`- ${SCHOOL_LABEL[p.school]}: ${p.claim}${full && p.evidence ? ` (${p.evidence})` : ""}`);
    if (d.synthesis) L.push(`Onde concordam: ${d.synthesis}`);
    if (d.systemStance) L.push(`Posição do sistema: ${d.systemStance}`);
  } else if (kind === "case") {
    const c = card as Canon["cases"][number];
    L.push(`**${c.brand}${c.year ? ` ${c.year}` : ""}** \`${c.id}\` — ${c.type}${c.agency ? `, ${c.agency}` : ""}${c.market ? `, ${c.market}` : ""}`);
    if (c.challenge) L.push(`Desafio: ${c.challenge}`);
    if (full && c.insight) L.push(`Insight: ${c.insight}`);
    if (c.strategy) L.push(`Estratégia: ${c.strategy}`);
    if (full && c.execution) L.push(`Execução: ${c.execution}`);
    if (c.results.length) L.push(`Resultados: ${c.results.map((r) => `${r.metric}${r.value ? ` ${r.value}` : ""}${r.independent ? "" : " (declarado)"}`).join("; ")}`);
    if (c.lessons.length) L.push(`Lições: ${(full ? c.lessons : c.lessons.slice(0, 3)).join("; ")}`);
    if (full) L.push(srcLine(canon, c.sources));
  } else if (kind === "antipattern") {
    const a = card as Canon["antipatterns"][number];
    L.push(`**Antipadrão: ${a.name}** \`${a.id}\``);
    if (a.description) L.push(a.description);
    if (a.signals.length) L.push(`Sinais: ${(full ? a.signals : a.signals.slice(0, 4)).join("; ")}`);
    if (a.fix) L.push(`Como corrigir: ${a.fix}`);
  } else {
    const s = card as unknown as Canon["sources"][number];
    L.push(`**${s.title}** \`${s.id}\` — ${s.author}${s.year ? ` (${s.year})` : ""}, ${s.format}, ${s.access}, licença ${s.license || "não informada"}`);
    if (s.url) L.push(s.url);
    if (s.summary) L.push(s.summary);
    if (s.notes) L.push(`Notas: ${s.notes}`);
  }
  return L.join("\n");
};

/** The canon a stage needs: strongest principles, frameworks, debates, antipatterns and a few cases. */
export const stageCanon = (canon: Canon, stage: string, extraText = ""): { kind: CardKind; card: AnyCard }[] => {
  const pick = (kind: CardKind, n: number) => searchCanon(canon, { kind, stage, ...(extraText ? {} : {}), limit: n }).map(({ kind: k, card }) => ({ kind: k, card }));
  const out = [...pick("principle", 14), ...pick("framework", 4), ...pick("debate", 4), ...pick("antipattern", 6), ...pick("case", 3)];
  if (extraText) {
    for (const r of searchCanon(canon, { text: extraText, limit: 6 })) if (!out.some((o) => o.card.id === r.card.id)) out.push({ kind: r.kind, card: r.card });
  }
  return out;
};
