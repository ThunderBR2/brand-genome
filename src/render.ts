import type { Assessment } from "./analysis/generic.js";
import type { Landscape } from "./analysis/landscape.js";
import type { NameCheck } from "./analysis/names.js";
import { cardMarkdown, stageCanon } from "./canon/query.js";
import { STAGES, type Conflict, type Decision, type Stage, type StageRecord } from "./core/model.js";
import type { BrandState, Unknown } from "./service.js";
import { STAGE_INFO } from "./stages/info.js";
import { STAGE_SCHEMAS } from "./stages/schemas.js";

/** Markdown views for agents: compact, ranked, always with the evidence path. */

const pct = (n: number): string => `${Math.round(n * 100)}%`;

export const landscapeMarkdown = (l: Landscape, detail: "summary" | "full" = "summary"): string => {
  const L: string[] = [`# Paisagem da categoria — ${l.brand}`, ""];
  if (l.limitations.length) L.push("**Limitações:**", ...l.limitations.map((x) => `- ${x}`), "");
  if (l.conventions.length) {
    L.push("## Convenções (o que a maioria dos concorrentes diz)", "Medido no texto dos concorrentes. Cada convenção precisa de uma decisão: seguir (necessária para ser entendido) ou quebrar.", "");
    for (const c of l.conventions.slice(0, detail === "full" ? 40 : 18)) {
      L.push(`- **${c.term}** — ${pct(c.share)} dos concorrentes (${c.entities.join(", ")})${c.evidence[0] ? `: "${c.evidence[0].excerpt}"` : ""}`);
    }
    L.push("");
  }
  if (l.categoryVoice) {
    const v = l.categoryVoice;
    L.push("## Voz da categoria (média dos concorrentes)", `Formalidade ${v.formality}/5, frases de ${v.avgSentence} palavras, ${pct(v.we)} das marcas de pessoa em "nós", ${pct(v.you)} em "você", exclamação em ${v.exclamations}% das frases.`, "");
  }
  if (l.entities.length) L.push("## Marcas", "");
  for (const e of l.entities) {
    L.push(`### ${e.entity} (${e.role}) — ${e.words} palavras`);
    L.push(`Voz: ${e.voiceSummary}. Formalidade ${e.voice.formality}/5. Genérico: ${e.genericPer100} termos a cada 100 palavras.`);
    if (e.claims.length) L.push(`Abre com: ${e.claims.slice(0, detail === "full" ? 8 : 3).map((c) => `"${c.excerpt}"`).join(" · ")}`);
    if (e.ownTerms.length) L.push(`Palavras só dela: ${e.ownTerms.slice(0, 10).join(", ")}`);
    if (e.genericHits.length) L.push(`Clichês: ${[...new Set(e.genericHits.map((h) => h.term))].slice(0, 10).join(", ")}`);
    L.push("");
  }
  if (l.brandClosest.length) L.push("## Com quem a marca soa parecida hoje", ...l.brandClosest.map((c) => `- ${c.entity}: similaridade ${c.value}`), "");
  if (l.audience) {
    L.push(`## O público, nas palavras dele (${l.audience.words} palavras lidas)`);
    L.push(l.audience.phrases.slice(0, detail === "full" ? 30 : 15).map((p) => `${p.phrase} (${p.count}×${p.usedByCompetitors ? ", concorrentes também usam" : ""})`).join("; "));
    L.push("", "Citações:", ...l.audience.quotes.slice(0, detail === "full" ? 24 : 8).map((q) => `- "${q.excerpt}" — ${q.locator}`), "");
  }
  if (l.whitespace.length) L.push("## Espaços livres medidos", ...l.whitespace.map((w) => `- ${w}`), "");
  if (l.similarity.length && detail === "full") L.push("## Similaridade de vocabulário", ...l.similarity.map((s) => `- ${s.a} × ${s.b}: ${s.value}`), "");
  return L.join("\n");
};

const stageSummary = (rec: StageRecord): string => {
  const o = rec.output;
  const short = (v: unknown, depth = 0): string => {
    if (typeof v === "string") return v.length > 260 ? `${v.slice(0, 260)}…` : v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) return v.slice(0, 8).map((x) => short(x, depth + 1)).join(depth ? "; " : " | ");
    if (v && typeof v === "object") return Object.entries(v).map(([k, x]) => `${k}: ${short(x, depth + 1)}`).join(depth ? ", " : "\n");
    return "";
  };
  return short(o);
};

/** The brief for one stage: what we know, what the canon says, the format and the gates. */
export const stageRequestMarkdown = (s: BrandState, stage: Stage): string => {
  const info = STAGE_INFO[stage];
  const n = STAGES.indexOf(stage) + 1;
  const L: string[] = [`# Etapa ${n}/11 — ${info.title}${info.optional ? " (opcional)" : ""}`, "", `**Objetivo:** ${info.goal}`, "", `**Por que importa:** ${info.why}`, ""];
  L.push(`Marca: ${s.project.brandName} · setor: ${s.project.sector || "não informado"} · mercado: ${s.project.market}`, "");
  const deps = info.dependsOn.filter((d) => s.stages[d]);
  const missing = info.dependsOn.filter((d) => !s.stages[d]);
  if (missing.length) L.push(`> Atenção: etapas anteriores ainda não entregues: ${missing.map((m) => STAGE_INFO[m].title).join(", ")}. Trabalhe com o que existe e marque o resto como hipótese.`, "");
  if (deps.length) {
    L.push("## O que já foi decidido");
    for (const d of deps) L.push(`### ${STAGE_INFO[d].title} (${s.stages[d]!.status})`, stageSummary(s.stages[d]!), "");
  }
  if (["paisagem", "publico", "posicionamento", "voz", "ativos", "narrativa"].includes(stage)) {
    L.push("## Medido nas fontes", landscapeMarkdown(s.landscape, "summary").replace(/^# .*\n/, ""), "");
  }
  const cards = stageCanon(s.canon, stage, info.canonFocus);
  if (cards.length) {
    L.push("## O que o cânone diz", "Princípios ordenados por força da evidência e corroboração. Debates mostram onde as escolas discordam: não misture as escolas, siga a posição do sistema ou pergunte ao usuário.", "");
    for (const c of cards) L.push(cardMarkdown(s.canon, c.kind, c.card), "");
  } else {
    L.push("## O que o cânone diz", "(o cânone ainda não tem cards para esta etapa)", "");
  }
  const rec = s.stages[stage];
  if (rec) {
    L.push(`## Entrega atual (v${rec.version}, ${rec.status})`);
    const failing = rec.gates.filter((g) => !g.pass);
    L.push(failing.length ? failing.map((g) => `- [${g.severity}] ${g.title}: ${g.detail}${g.fix ? ` → ${g.fix}` : ""}`).join("\n") : "Todos os portões passaram.", "");
  }
  L.push("## Como fazer bem", ...info.guide.map((g) => `- ${g}`), "");
  L.push("## Perguntas ao usuário (só o que as fontes não respondem)", ...info.questions.map((q) => `- ${q}`), "");
  L.push("## Formato da entrega (brand_stage_submit)", "```json", JSON.stringify(schemaSketch(STAGE_SCHEMAS[stage]), null, 1), "```", "");
  L.push("Depois de enviar, o sistema roda os portões de qualidade. Portões que bloqueiam deixam a etapa como reprovada até a correção. Mostre a entrega ao usuário e só aprove (brand_stage_approve) com o OK dele.");
  return L.join("\n");
};

/** A readable sketch of a zod schema: field → type/description. */
const schemaSketch = (schema: unknown): unknown => {
  const def = (schema as { _def?: { typeName?: string; description?: string; shape?: () => Record<string, unknown>; type?: unknown; innerType?: unknown; values?: string[]; schema?: unknown; checks?: { kind: string; value: number }[]; minLength?: { value: number } | null; valueType?: unknown } })._def;
  if (!def) return "?";
  const d = def.description ? ` — ${def.description}` : "";
  switch (def.typeName) {
    case "ZodObject": {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(def.shape!())) out[k] = schemaSketch(v);
      return out;
    }
    case "ZodArray": {
      const min = def.minLength?.value;
      const inner = schemaSketch(def.type);
      return typeof inner === "string" ? [`${inner}${min ? ` (mín. ${min})` : ""}${d}`] : [inner, ...(min ? [`… mín. ${min} itens${d}`] : d ? [d.slice(3)] : [])];
    }
    case "ZodString": return `texto${d}`;
    case "ZodNumber": {
      const lo = def.checks?.find((c) => c.kind === "min")?.value;
      const hi = def.checks?.find((c) => c.kind === "max")?.value;
      return `número${lo !== undefined ? ` ${lo}` : ""}${hi !== undefined ? `–${hi}` : ""}${d}`;
    }
    case "ZodBoolean": return `true/false${d}`;
    case "ZodEnum": return `${def.values!.join(" | ")}${d}`;
    case "ZodOptional": { const x = schemaSketch(def.innerType); return typeof x === "string" ? `(opcional) ${x}` : x; }
    case "ZodDefault": return schemaSketch(def.innerType);
    case "ZodEffects": return schemaSketch(def.schema);
    case "ZodRecord": return { "<critério>": schemaSketch(def.valueType) };
    default: return "?";
  }
};

export const stageResultMarkdown = (rec: StageRecord): string => {
  const L = [`# ${STAGE_INFO[rec.stage].title} — v${rec.version}: ${rec.status}`, ""];
  const by = (sev: string) => rec.gates.filter((g) => g.severity === sev);
  for (const sev of ["bloqueia", "alerta", "dica"]) {
    const gs = by(sev);
    if (!gs.length) continue;
    L.push(`## ${sev === "bloqueia" ? "Portões que bloqueiam" : sev === "alerta" ? "Alertas" : "Dicas"}`);
    for (const g of gs) {
      L.push(`- ${g.pass ? "✓" : "✗"} ${g.title}: ${g.detail}${!g.pass && g.fix ? `\n  → ${g.fix}` : ""}`);
      if (!g.pass) for (const e of g.evidence ?? []) L.push(`  evidência (${e.sourceId}, ${e.locator}): "${e.excerpt}"`);
    }
    L.push("");
  }
  L.push(rec.status === "reprovada" ? "Corrija os portões que bloqueiam e envie de novo." : "Mostre a entrega e os alertas ao usuário. Aprove com brand_stage_approve só depois do OK dele.");
  return L.join("\n");
};

export const assessmentMarkdown = (a: Assessment, label: string): string => {
  const L = [`# Verificação: ${label}`, "", `**Nota ${a.score}/100 — ${a.verdict}**`, ""];
  for (const f of a.facets) L.push(`- ${f.label}: ${f.score} (${f.note})`);
  if (a.closest.length) L.push(`- Vocabulário mais próximo de: ${a.closest.slice(0, 3).map((c) => `${c.entity} (${c.value})`).join(", ")}`);
  L.push("");
  if (a.deviations.length) {
    L.push("## Desvios");
    for (const d of a.deviations.slice(0, 30)) L.push(`- [${d.severity}] ${d.message}${d.excerpt ? `\n  trecho: "${d.excerpt}"` : ""}${d.fix ? `\n  → ${d.fix}` : ""}`);
  } else L.push("Nenhum desvio.");
  return L.join("\n");
};

export const namesMarkdown = (checks: readonly NameCheck[]): string => {
  const L = ["# Triagem de nomes", "", "Checagem mecânica: som, tamanho, clichês, palavras descritivas da categoria e semelhança com concorrentes. Significado, conotação e disponibilidade legal são verificações manuais (lista abaixo).", ""];
  for (const c of [...checks].sort((a, b) => b.score - a.score)) {
    L.push(`## ${c.name} — ${c.score}/100`, `${c.letters} letras, ~${c.syllables} sílabas${c.closestCompetitor ? `; mais parecido com ${c.closestCompetitor.name} (${Math.round(c.closestCompetitor.similarity * 100)}%)` : ""}`);
    for (const f of c.flags) L.push(`- [${f.severity}] ${f.message}`);
    L.push("");
  }
  if (checks[0]) L.push("## Verificações manuais (para cada finalista)", ...checks[0].manualChecks.map((m) => `- ${m.what}: ${m.where}`));
  return L.join("\n");
};

export const conflictsMarkdown = (cs: readonly (Conflict & { decision?: Decision })[]): string => {
  if (!cs.length) return "Nenhum conflito aberto.";
  const L = ["# Conflitos", "Conflitos não são resolvidos sozinhos: mostre os lados ao usuário e registre a decisão dele com brand_resolve_conflict.", ""];
  for (const c of cs) {
    L.push(`## ${c.title} \`${c.id}\`${c.decision ? ` — decidido: ${c.decision.choice}` : ""}`, `Tipo: ${c.kind}${c.stage ? ` · etapa ${c.stage}` : ""}${c.canonRef ? ` · cânone: ${c.canonRef}` : ""}`);
    for (const s of c.sides) L.push(`- **${s.label}:** ${s.detail}`);
    L.push("");
  }
  return L.join("\n");
};

/** The whole brand genome as a compact brief for agents writing or designing for the brand. */
export const briefMarkdown = (s: BrandState, conflicts: readonly (Conflict & { decision?: Decision })[], unknowns: readonly Unknown[]): string => {
  const L: string[] = [`# Genoma de marca — ${s.project.brandName}`, ""];
  L.push(`Setor: ${s.project.sector || "—"} · mercado: ${s.project.market} · ${s.project.sources.length} fontes · cânone com ${s.canon.principles.length} princípios`, "");
  const get = <T>(st: Stage): T | undefined => s.stages[st]?.output as T | undefined;
  const status = (st: Stage): string => (s.stages[st] ? ` _(${s.stages[st]!.status})_` : "");
  const pos = get<{ onliness: string; declaracao: string; quadroDeReferencia: string; alvo: string; pontosDeDiferenca: { diferencial: string; prova: string }[]; sacrificio: string[]; razoesParaAcreditar: string[] }>("posicionamento");
  if (pos) {
    L.push(`## Posicionamento${status("posicionamento")}`, `**${pos.onliness}**`, pos.declaracao, `Quadro de referência: ${pos.quadroDeReferencia}. Para: ${pos.alvo}.`, `Diferenciais: ${pos.pontosDeDiferenca.map((p) => `${p.diferencial} (prova: ${p.prova})`).join("; ")}`, `Razões para acreditar: ${pos.razoesParaAcreditar.join("; ")}`, `Abre mão de: ${pos.sacrificio.join("; ")}`, "");
  }
  const plat = get<{ ideiaDeMarca: string; promessa: string; crencas: string[]; valores: { valor: string; comportamento: string }[]; personalidade: { traco: string; e: string; naoE: string }[]; pilares: { pilar: string; prova: string }[]; proposito?: { frase: string } }>("plataforma");
  if (plat) {
    L.push(`## Plataforma${status("plataforma")}`, `Ideia de marca: **${plat.ideiaDeMarca}**`, `Promessa: ${plat.promessa}`);
    if (plat.proposito) L.push(`Propósito: ${plat.proposito.frase}`);
    L.push(`Crenças: ${plat.crencas.join(" | ")}`, `Valores: ${plat.valores.map((v) => `${v.valor} → ${v.comportamento}`).join("; ")}`, `Personalidade: ${plat.personalidade.map((p) => `${p.traco} (é ${p.e}; não é ${p.naoE})`).join("; ")}`, `Pilares: ${plat.pilares.map((p) => `${p.pilar} (${p.prova})`).join("; ")}`, "");
  }
  const voz = get<{ tracos: { traco: string; significa: string; naoSignifica: string; faca: string[]; naoFaca: string[] }[]; lexico: { usar: string[]; evitar: string[]; palavrasProprias: string[] }; gramatica: Record<string, unknown>; mapaDeTom: { situacao: string; ajuste: string }[] }>("voz");
  if (voz) {
    L.push(`## Voz${status("voz")}`);
    for (const t of voz.tracos) L.push(`- **${t.traco}**: ${t.significa} (não é: ${t.naoSignifica}). Faça: ${t.faca.join("; ")}. Não faça: ${t.naoFaca.join("; ")}.`);
    L.push(`Gramática: ${Object.entries(voz.gramatica).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(", ") : String(v)}`).join("; ")}`, `Usar: ${voz.lexico.usar.join(", ")}`, `Palavras próprias: ${voz.lexico.palavrasProprias.join(", ")}`, `Evitar: ${voz.lexico.evitar.join(", ")}`, `Tom por situação: ${voz.mapaDeTom.map((m) => `${m.situacao} → ${m.ajuste}`).join("; ")}`, "");
  }
  const atv = get<{ ativos: { tipo: string; descricao: string; estrategiaDeFama: string }[]; direcaoVisual: { traducoes: { traco: string; traducaoVisual: string }[]; evitar: string[] } }>("ativos");
  if (atv) L.push(`## Ativos distintivos${status("ativos")}`, ...atv.ativos.map((a) => `- ${a.tipo}: ${a.descricao} — fama: ${a.estrategiaDeFama}`), `Direção visual: ${atv.direcaoVisual.traducoes.map((t) => `${t.traco} → ${t.traducaoVisual}`).join("; ")}. Evitar: ${atv.direcaoVisual.evitar.join(", ")}`, "");
  const narr = get<{ casaDeMensagens: { guardaChuva: string; pilares: { pilar: string; mensagens: string[]; provas: string[] }[] }; assinaturas: { frase: string }[]; pitch: { curto: string } }>("narrativa");
  if (narr) L.push(`## Mensagens${status("narrativa")}`, `Guarda-chuva: ${narr.casaDeMensagens.guardaChuva}`, ...narr.casaDeMensagens.pilares.map((p) => `- ${p.pilar}: ${p.mensagens.join(" / ")} (provas: ${p.provas.join("; ")})`), `Assinaturas: ${narr.assinaturas.map((a) => `"${a.frase}"`).join(", ")}`, `Pitch: ${narr.pitch.curto}`, "");
  if (s.landscape.conventions.length) L.push("## Convenções da categoria (medidas)", s.landscape.conventions.slice(0, 15).map((c) => `${c.term} (${pct(c.share)})`).join(", "), "");
  const open = conflicts.filter((c) => !c.decision);
  if (open.length) L.push("## Conflitos abertos (não escolha um lado sozinho)", ...open.map((c) => `- ${c.title} \`${c.id}\``), "");
  const decided = conflicts.filter((c) => c.decision);
  if (decided.length) L.push("## Decisões do usuário", ...decided.map((c) => `- ${c.title}: ${c.decision!.choice}${c.decision!.note ? ` (${c.decision!.note})` : ""}`), "");
  if (unknowns.length) L.push("## Desconhecido (não invente)", ...unknowns.map((u) => `- ${u.what}: ${u.why}`), "");
  L.push("## Regras para quem escreve ou cria pela marca", "- Escreva na voz acima e rode brand_verify em todo texto antes de entregar; corrija até nota 70+ sem desvios altos.", "- Nunca use os termos da lista evitar nem as convenções que a marca decidiu quebrar.", "- Afirmação sem prova vira prova: use as razões para acreditar e as verdades do negócio.", "- Peças visuais: siga a direção visual e verifique com o Design Genome (genome_verify).");
  return L.join("\n");
};
