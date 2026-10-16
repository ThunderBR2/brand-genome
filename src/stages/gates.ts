import type { Assessment, VoiceSpec } from "../analysis/generic.js";
import type { Landscape } from "../analysis/landscape.js";
import { findLexicon } from "../analysis/lexicon.js";
import { checkNames } from "../analysis/names.js";
import type { LexiconEntry } from "../canon/types.js";
import type { EvidenceRef, GateResult, Stage, StageRecord } from "../core/model.js";
import { contentTokens, excerpt, fold, ngrams, stem, terms, words } from "../core/text.js";
import type { StageOutput } from "./schemas.js";

export interface CompetitorSegment { readonly entity: string; readonly sourceId: string; readonly locator: string; readonly text: string }

export interface GateContext {
  readonly sector: string;
  readonly lang: "pt" | "en";
  readonly brandName: string;
  readonly landscape: Landscape | null;
  readonly lexicon: readonly LexiconEntry[];
  readonly stages: Partial<Record<Stage, StageRecord>>;
  readonly competitorSegments: readonly CompetitorSegment[];
  readonly audienceText: string;
  readonly voiceSpec: VoiceSpec | null;
  readonly assess: (text: string, opts?: { voice?: VoiceSpec | null }) => Assessment;
}

const gate = (id: string, title: string, severity: GateResult["severity"], pass: boolean, detail: string, fix?: string, evidence?: EvidenceRef[]): GateResult => ({
  id, title, severity, pass, detail, ...(fix ? { fix } : {}), ...(evidence?.length ? { evidence } : {}),
});

const bigramStems = (t: string): Set<string> => new Set(terms(t).filter((x) => x.includes(" ")));
const hasNumberOrName = (t: string): boolean => /\d/.test(t) || words(t).slice(1).some((w) => /^\p{Lu}/u.test(w) && w !== w.toUpperCase());

/** Where a phrase's meaningful word pairs already appear in competitors' text. */
export const foundInCompetitors = (text: string, segs: readonly CompetitorSegment[], minShared = 1): { entity: string; ev: EvidenceRef; shared: string[] }[] => {
  const mine = bigramStems(text);
  if (!mine.size) return [];
  const out: { entity: string; ev: EvidenceRef; shared: string[] }[] = [];
  const seen = new Set<string>();
  for (const s of segs) {
    if (seen.has(s.entity)) continue;
    const theirs = bigramStems(s.text);
    const shared = [...mine].filter((b) => theirs.has(b));
    if (shared.length >= minShared) {
      seen.add(s.entity);
      out.push({ entity: s.entity, ev: { sourceId: s.sourceId, locator: s.locator, excerpt: s.text.slice(0, 220) }, shared });
    }
  }
  return out;
};

const genericIn = (t: string, ctx: GateContext) => findLexicon(t, ctx.lexicon, { sector: ctx.sector, lang: ctx.lang });
/** In analytical fields single words like "confiança" are fine; only phrases and jargon count. */
const clicheIn = (t: string, ctx: GateContext) => genericIn(t, ctx).filter((h) => h.kind === "cliche" || h.kind === "jargao" || h.kind === "proposito-generico" || h.term.includes(" "));

const conventionShare = (t: string, ctx: GateContext): { share: number; terms: string[] } => {
  const conv = new Map((ctx.landscape?.conventions ?? []).map((c) => [c.stems, c.term]));
  if (!conv.size) return { share: 0, terms: [] };
  const toks = contentTokens(t).map(stem);
  const all = terms(t);
  const hits = all.filter((x) => conv.has(x));
  return { share: toks.length ? hits.reduce((n, h) => n + h.split(" ").length, 0) / toks.length : 0, terms: [...new Set(hits.map((h) => conv.get(h)!))] };
};

const BRAND_METRIC = /(lembran|recall|awareness|consider|preferen|saliencia|salience|associa|reconhec|recogni|penetra|share of search|nps|mental|marca)/i;

type Out<S extends Stage> = StageOutput<S>;

export const STAGE_GATES: { [S in Stage]: (o: Out<S>, ctx: GateContext) => GateResult[] } = {
  diagnostico: (o) => {
    const truths = o.verdadesDoNegocio;
    const concrete = truths.filter(hasNumberOrName);
    const out = [
      gate("verdades-concretas", "Verdades do negócio são fatos verificáveis", "alerta", concrete.length >= Math.min(2, truths.length), `${concrete.length} de ${truths.length} verdades têm número, nome ou detalhe verificável.`, "Reescreva as verdades como fatos: quanto, desde quando, onde, quem, como. 'Paixão por X' não é verdade do negócio."),
      gate("metrica-de-marca", "Há métrica de sucesso de marca (não só vendas)", "alerta", o.metricasDeSucesso.some((m) => BRAND_METRIC.test(fold(m))), "Métricas: " + o.metricasDeSucesso.join("; "), "Inclua lembrança espontânea, consideração ou associação com os momentos de compra."),
    ];
    if (o.situacao !== "marca-nova") {
      out.push(gate("ativos-mapeados", "Rebrand/reposicionamento lista os ativos que o público já reconhece", "bloqueia", o.ativosExistentes.length > 0, `${o.ativosExistentes.length} ativo(s) listado(s).`, "Liste nome, cores, símbolo, frases, personagens, embalagens e o reconhecimento de cada um. Abandonar ativos com equity é o erro mais caro (Tropicana, Gap)."));
      const unknown = o.ativosExistentes.filter((a) => a.equity === "desconhecida");
      if (unknown.length) out.push(gate("equity-desconhecida", "Equity dos ativos atuais medida", "dica", false, `Equity desconhecida para: ${unknown.map((a) => a.ativo).join(", ")}.`, "Antes de mudar, teste reconhecimento: mostre o ativo sem o nome para 30+ pessoas da categoria e pergunte de quem é."));
    }
    return out;
  },

  paisagem: (o, ctx) => {
    const out: GateResult[] = [];
    const comps = ctx.landscape?.entities.filter((e) => e.role === "concorrente") ?? [];
    out.push(gate("concorrentes-medidos", "Concorrentes medidos a partir de fontes reais", "alerta", comps.length >= 3, `${comps.length} concorrente(s) com texto analisado.`, "Adicione os sites de 3 a 6 concorrentes com brand_add_sources (papel 'concorrente') e rode brand_landscape."));
    const strong = (ctx.landscape?.conventions ?? []).filter((c) => c.share >= 0.66).slice(0, 12);
    const decided = o.convencoes.map((c) => fold(c.convencao)).join(" | ");
    const missing = strong.filter((c) => !decided.includes(fold(c.term)) && !c.term.split(" ").every((w) => decided.includes(fold(w))));
    out.push(gate("convencoes-decididas", "Convenções medidas foram decididas (seguir ou quebrar)", "alerta", missing.length === 0, missing.length ? `Convenções fortes ainda sem decisão: ${missing.map((c) => `"${c.term}" (${Math.round(c.share * 100)}%)`).join(", ")}.` : "Todas as convenções fortes medidas têm decisão.", "Inclua cada uma em 'convencoes' com decisao seguir/quebrar e o porquê.", missing.flatMap((c) => c.evidence.slice(0, 1))));
    const breaks = o.convencoes.filter((c) => c.decisao === "quebrar");
    out.push(gate("quebra-alguma", "A marca quebra pelo menos uma convenção", "bloqueia", breaks.length >= 1, `${breaks.length} convenção(ões) a quebrar.`, "Uma marca que segue todas as convenções da categoria nasce invisível. Escolha onde ser diferente."));
    const vague = o.espacosLivres.filter((e) => clicheIn(e, ctx).length > 0 || words(e).length < 6);
    out.push(gate("espacos-especificos", "Espaços livres são específicos", "alerta", vague.length === 0, vague.length ? `Vagos: ${vague.join(" | ")}` : "Espaços livres específicos.", "Diga exatamente o que ninguém faz ou diz, para quem e quando."));
    return out;
  },

  publico: (o, ctx) => {
    const out: GateResult[] = [];
    const hasAudience = ctx.audienceText.trim().length > 0;
    const verbatim = o.primario.palavras.filter((p) => fold(ctx.audienceText).includes(fold(p)));
    out.push(gate("voz-do-publico", "Palavras do público vêm de fontes do público", hasAudience ? "alerta" : "dica", hasAudience ? verbatim.length >= Math.min(2, o.primario.palavras.length) : false, hasAudience ? `${verbatim.length} de ${o.primario.palavras.length} expressões aparecem nas fontes do público.` : "Não há fontes com a voz do público: estas palavras são hipótese.", "Adicione avaliações, entrevistas ou comentários (papel 'publico') e use as expressões que aparecem lá."));
    out.push(gate("muitos-ceps", "Pontos de entrada da categoria mapeados de forma ampla", "alerta", o.pontosDeEntrada.length >= 5, `${o.pontosDeEntrada.length} ponto(s) de entrada.`, "Mapeie pelo menos 5 situações de compra/uso (quando, onde, com quem, por quê, com o quê) e marque quais estão livres."));
    const tension = /( mas | porem | porém | no entanto | ao mesmo tempo | sem | ainda assim | but | yet | while | although |, so )/i;
    const flat = o.insights.filter((i) => !tension.test(` ${fold(i.insight)} `));
    out.push(gate("insight-com-tensao", "Insights têm tensão (querer x obstáculo)", "dica", flat.length === 0, flat.length ? `Sem tensão aparente: ${flat.map((i) => `"${i.insight.slice(0, 80)}"`).join("; ")}` : "Todos os insights mostram uma tensão.", "Formato útil: 'quer X, mas Y', e a implicação para a marca."));
    const genericInsights = o.insights.filter((i) => clicheIn(i.insight, ctx).length > 0);
    out.push(gate("insight-sem-cliche", "Insights sem linguagem genérica", "alerta", genericInsights.length === 0, genericInsights.length ? `Com clichê: ${genericInsights.map((i) => i.insight.slice(0, 80)).join("; ")}` : "Insights sem clichê.", "Use a palavra do público, não a do marketing."));
    return out;
  },

  posicionamento: (o, ctx) => {
    const out: GateResult[] = [];
    for (const [i, pod] of o.pontosDeDiferenca.entries()) {
      const found = foundInCompetitors(`${pod.diferencial}`, ctx.competitorSegments);
      const conv = conventionShare(pod.diferencial, ctx);
      out.push(gate(`diferencial-${i + 1}-exclusivo`, `Diferencial ${i + 1} não aparece nos concorrentes`, "bloqueia", found.length === 0 && conv.share < 0.5, found.length ? `"${pod.diferencial}" já aparece em ${found.map((f) => f.entity).join(", ")}.` : conv.share >= 0.5 ? `"${pod.diferencial}" é feito de convenções da categoria: ${conv.terms.join(", ")}.` : "Não encontrado nos textos dos concorrentes.", "Se o concorrente já diz isso, é ponto de paridade. Mova para 'pontosDeParidade' ou encontre o recorte que só vocês têm.", found.map((f) => f.ev)));
      out.push(gate(`diferencial-${i + 1}-prova`, `Diferencial ${i + 1} tem prova concreta`, "alerta", hasNumberOrName(pod.prova) || words(pod.prova).length >= 8, `Prova: ${pod.prova}`, "Prova é fato: número, processo, certificação, nome, origem, garantia."));
    }
    const onlyRe = /(unic[ao]|só (a|o|nós)|only|nenhuma outra|ninguem mais)/;
    const onl = ctx.assess(o.onliness);
    const onlFound = foundInCompetitors(o.onliness, ctx.competitorSegments, 2);
    out.push(gate("onliness", "A frase 'somos a única' é realmente só nossa", "bloqueia", onlyRe.test(fold(o.onliness)) && onlFound.length === 0 && onl.score >= 60, `Nota ${onl.score}/100${onlFound.length ? `; partes já ditas por ${onlFound.map((f) => f.entity).join(", ")}` : ""}${onlyRe.test(fold(o.onliness)) ? "" : "; a frase não afirma ser 'a única'"}.`, "Formato: 'Somos a única [categoria] que [diferencial] para [quem] que [necessidade] em [contexto]'. Se cabe em outro, troque o diferencial.", onlFound.map((f) => f.ev)));
    const decl = ctx.assess(o.declaracao);
    out.push(gate("declaracao-especifica", "Declaração de posicionamento não é genérica", "bloqueia", decl.score >= 60, `Nota ${decl.score}/100 (${decl.verdict}). ${decl.deviations.slice(0, 3).map((d) => d.message).join(" ")}`, "Reescreva com o quadro de referência, o alvo e o diferencial com prova."));
    out.push(gate("sacrificio", "Há sacrifício explícito", "bloqueia", o.sacrificio.length > 0 && o.sacrificio.every((x) => words(x).length >= 3), o.sacrificio.join("; ") || "nenhum", "Diga de que público, ocasião, atributo ou canal a marca abre mão."));
    const oppGeneric = clicheIn(o.opostoPlausivel, ctx);
    const silly = /(sem qualidade|ruim|pior|caro e ruim|nao se importa|não se importa|desonest|bad|worst|no quality)/i.test(fold(o.opostoPlausivel));
    out.push(gate("oposto-plausivel", "O oposto do posicionamento é algo que um concorrente sério defenderia", "alerta", !silly && oppGeneric.length === 0, `Oposto: ${o.opostoPlausivel}`, "Se ninguém defenderia o oposto, o posicionamento não é uma escolha. Ex.: oposto de 'rápido e simples' é 'completo e personalizado' (alguém defende)."));
    const weakRtb = o.razoesParaAcreditar.filter((r) => !hasNumberOrName(r) && genericIn(r, ctx).length > 0);
    out.push(gate("rtb-concretas", "Razões para acreditar são concretas", "alerta", weakRtb.length === 0, weakRtb.length ? `Vagas: ${weakRtb.join("; ")}` : "Razões concretas.", "Use as verdades do negócio do diagnóstico."));
    return out;
  },

  plataforma: (o, ctx) => {
    const out: GateResult[] = [];
    out.push(gate("ideia-curta", "Ideia de marca curta (2 a 7 palavras)", "alerta", words(o.ideiaDeMarca).length >= 2 && words(o.ideiaDeMarca).length <= 7, `"${o.ideiaDeMarca}" tem ${words(o.ideiaDeMarca).length} palavras.`, "A ideia de marca é um norte que cabe na cabeça, não um parágrafo."));
    const ideaFound = foundInCompetitors(o.ideiaDeMarca, ctx.competitorSegments);
    out.push(gate("ideia-propria", "Ideia de marca não é dita pelos concorrentes", "alerta", ideaFound.length === 0, ideaFound.length ? `Aparece em ${ideaFound.map((f) => f.entity).join(", ")}.` : "Não aparece nos concorrentes.", undefined, ideaFound.map((f) => f.ev)));
    const emptyValues = o.valores.filter((v) => genericIn(v.valor, ctx).some((h) => h.kind === "adjetivo-vazio" || h.kind === "promessa-vaga") && !hasNumberOrName(v.comportamento) && words(v.comportamento).length < 10);
    out.push(gate("valores-comportamento", "Valores viram comportamento observável", "alerta", emptyValues.length === 0, emptyValues.length ? `Valores genéricos sem comportamento concreto: ${emptyValues.map((v) => v.valor).join(", ")}.` : "Cada valor tem comportamento.", "Troque o nome do valor por um comportamento ('mostramos o custo de cada item na nota') ou detalhe o que muda nas decisões."));
    if (o.proposito) {
      out.push(gate("proposito-operacional", "Propósito tem provas operacionais", "bloqueia", o.proposito.provasOperacionais.length >= 2, `${o.proposito.provasOperacionais.length} prova(s) operacional(is).`, "Propósito sem prova é o que o público mais desconfia. Liste o que a empresa faz diferente por causa dele, ou retire o propósito."));
      const pg = genericIn(o.proposito.frase, ctx).filter((h) => h.kind === "proposito-generico");
      out.push(gate("proposito-especifico", "Propósito não é genérico", "alerta", pg.length === 0, pg.length ? `Genérico: ${pg.map((h) => `"${h.term}"`).join(", ")}.` : "Propósito específico.", "Diga qual mudança, para quem, em que escala, medida como."));
    }
    const noOpinion = o.crencas.filter((c) => words(c).length < 6);
    out.push(gate("crencas-com-opiniao", "Crenças expressam ponto de vista", "dica", noOpinion.length === 0, o.crencas.join(" | "), "Crença boa tem alguém que discorda: 'A categoria trata o cliente como suspeito; nós partimos da confiança.'"));
    const promise = ctx.assess(o.promessa);
    out.push(gate("promessa-especifica", "Promessa não é genérica", "alerta", promise.score >= 65, `Nota ${promise.score}/100. ${promise.deviations.slice(0, 2).map((d) => d.message).join(" ")}`));
    return out;
  },

  arquitetura: (o) => {
    if (o.naoSeAplica) return [gate("motivo", "Motivo registrado para pular a etapa", "alerta", Boolean(o.motivo && o.motivo.length > 5), o.motivo ?? "sem motivo")];
    return [
      gate("modelo", "Modelo de arquitetura escolhido", "bloqueia", Boolean(o.modelo), o.modelo ?? "nenhum"),
      gate("justificativa", "Escolha justificada", "alerta", Boolean(o.justificativa && words(o.justificativa).length >= 8), o.justificativa ?? ""),
      gate("regras", "Regras aplicáveis para novas marcas/linhas", "alerta", o.regras.length >= 2, `${o.regras.length} regra(s).`, "Escreva como nasce uma submarca, como o nome se forma e como a marca-mãe aparece."),
    ];
  },

  naming: (o, ctx) => {
    if (o.naoSeAplica) return [gate("motivo", "Motivo registrado para pular a etapa", "alerta", Boolean(o.motivo && o.motivo.length > 5), o.motivo ?? "sem motivo")];
    const out: GateResult[] = [];
    out.push(gate("criterios", "Critérios com pesos definidos", "alerta", o.criterios.length >= 4, `${o.criterios.length} critério(s).`));
    out.push(gate("candidatos", "Pelo menos 3 candidatos avaliados", "bloqueia", o.candidatos.length >= 3, `${o.candidatos.length} candidato(s).`));
    const competitors = ctx.landscape?.entities.filter((e) => e.role === "concorrente").map((e) => e.entity) ?? [];
    const checks = checkNames(o.candidatos.map((c) => c.nome), { competitors, landscape: ctx.landscape, lexicon: ctx.lexicon, sector: ctx.sector, market: "" });
    for (const c of checks) {
      const high = c.flags.filter((f) => f.severity === "alta");
      out.push(gate(`nome-${fold(c.name).replace(/[^a-z0-9]+/g, "-")}`, `Triagem de "${c.name}"`, "alerta", high.length === 0 && c.score >= 60, `Nota ${c.score}/100. ${c.flags.map((f) => f.message).join(" ")}`));
    }
    const rec = o.candidatos.find((c) => o.recomendacao && fold(o.recomendacao).includes(fold(c.nome)));
    out.push(gate("recomendacao-verificada", "Nome recomendado passou pela busca de marca", "alerta", Boolean(rec && rec.verificacoes.marcaINPI === "sem-conflito-aparente"), rec ? `Busca no INPI: ${rec.verificacoes.marcaINPI}; domínio: ${rec.verificacoes.dominio}; linguística: ${rec.verificacoes.linguistica}.` : "Nenhum candidato recomendado.", "Faça a busca no INPI (e WIPO, se houver expansão), domínio e checagem com nativos. Até lá, é candidato, não nome."));
    return out;
  },

  voz: (o, ctx) => {
    const out: GateResult[] = [];
    const genericTraits = o.tracos.filter((t) => genericIn(t.traco, ctx).length > 0);
    out.push(gate("tracos-com-forma", "Traços com 'não significa' e exemplos", "alerta", genericTraits.length === 0, genericTraits.length ? `Traços genéricos: ${genericTraits.map((t) => t.traco).join(", ")}.` : "Traços definidos.", "Se o traço é um adjetivo genérico, o 'não significa' e os exemplos precisam carregar o sentido."));
    const conv = (ctx.landscape?.conventions ?? []).slice(0, 15).map((c) => c.term);
    const compGeneric = [...new Set((ctx.landscape?.entities ?? []).filter((e) => e.role === "concorrente").flatMap((e) => e.genericHits.map((h) => h.term)))].slice(0, 15);
    const avoid = o.lexico.evitar.map(fold).join(" | ");
    const covered = [...conv, ...compGeneric].filter((t) => avoid.includes(fold(t)));
    const suggest = [...conv, ...compGeneric].filter((t) => !avoid.includes(fold(t))).slice(0, 10);
    out.push(gate("evitar-categoria", "Lista 'evitar' cobre a linguagem batida da categoria", "dica", covered.length >= Math.min(3, conv.length + compGeneric.length), `${covered.length} termos da categoria na lista 'evitar'.${suggest.length ? ` Sugestões medidas: ${suggest.join(", ")}.` : ""}`));
    if (ctx.landscape?.categoryVoice) {
      const d = Math.abs(ctx.landscape.categoryVoice.formality - o.gramatica.formalidade);
      out.push(gate("formalidade-vs-categoria", "Voz se distingue da formalidade da categoria", "dica", d >= 0.8, `Categoria ${ctx.landscape.categoryVoice.formality}/5; marca ${o.gramatica.formalidade}/5.`, "Não é obrigatório, mas falar no mesmo registro de todos torna a voz menos reconhecível."));
    }
    const spec: VoiceSpec = specFromVoz(o);
    const results = o.exemplos.map((e) => ({ e, a: ctx.assess(e.depois, { voice: spec }) }));
    const weak = results.filter((r) => r.a.score < 70);
    out.push(gate("exemplos-passam", "Exemplos 'depois' passam no verificador com a própria voz", "bloqueia", weak.length === 0, results.map((r) => `${r.e.contexto}: ${r.a.score}`).join("; "), weak.length ? `Corrija: ${weak.flatMap((w) => w.a.deviations.slice(0, 2).map((d) => d.message)).join(" ")}` : undefined));
    return out;
  },

  ativos: (o, ctx) => {
    const out: GateResult[] = [];
    const types = new Set(o.ativos.map((a) => a.tipo));
    out.push(gate("ativos-variados", "Ativos de pelo menos 3 tipos", "alerta", types.size >= 3, [...types].join(", ")));
    out.push(gate("alem-de-logo-e-cor", "Pelo menos um ativo além de cor e símbolo", "alerta", [...types].some((t) => !["cor", "simbolo", "tipografia"].includes(t)), "Personagem, som, frase, forma, padrão, embalagem ou ritual identificam a marca onde o logo não aparece."));
    const shared = o.ativos.filter((a) => !/(nenhum|ninguem|ninguém|none|sem uso)/i.test(fold(a.usoNaCategoria)));
    out.push(gate("unicidade", "Ativos escolhidos não são comuns na categoria", "alerta", shared.length <= Math.floor(o.ativos.length / 2), shared.length ? `Usados por outros: ${shared.map((a) => `${a.tipo} (${a.usoNaCategoria})`).join("; ")}.` : "Ativos sem uso na categoria.", "Ativo compartilhado não identifica ninguém (grade Fama × Unicidade). Troque ou combine com algo único."));
    const diag = ctx.stages.diagnostico?.output as StageOutput<"diagnostico"> | undefined;
    const equity = diag?.ativosExistentes.filter((a) => a.equity === "alta" && a.manter !== "nao") ?? [];
    const kept = o.mantidos.map(fold).join(" | ");
    const dropped = equity.filter((a) => !kept.includes(fold(a.ativo)));
    if (equity.length) out.push(gate("equity-mantida", "Ativos com equity alta foram mantidos ou a troca foi justificada", "bloqueia", dropped.length === 0, dropped.length ? `Sem decisão: ${dropped.map((a) => a.ativo).join(", ")}.` : "Ativos com equity mantidos.", "Liste em 'mantidos' ou registre no diagnóstico (manter: nao) com a evidência que justifica abandonar."));
    return out;
  },

  narrativa: (o, ctx) => {
    const out: GateResult[] = [];
    const m = ctx.assess(o.manifesto, { voice: ctx.voiceSpec });
    out.push(gate("manifesto", "Manifesto forte no verificador", "bloqueia", m.score >= 70, `Nota ${m.score}/100 (${m.verdict}).`, m.deviations.slice(0, 4).map((d) => d.message).join(" ") || undefined));
    for (const a of o.assinaturas) {
      const r = ctx.assess(a.frase, { voice: ctx.voiceSpec });
      const found = foundInCompetitors(a.frase, ctx.competitorSegments);
      out.push(gate(`assinatura-${fold(a.frase).replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`, `Assinatura "${a.frase}"`, "alerta", r.score >= 70 && found.length === 0, `Nota ${r.score}/100${found.length ? `; já dito por ${found.map((f) => f.entity).join(", ")}` : ""}.`, r.deviations.slice(0, 2).map((d) => d.message).join(" ") || undefined, found.map((f) => f.ev)));
    }
    const p = ctx.assess(o.pitch.longo, { voice: ctx.voiceSpec });
    out.push(gate("pitch", "Pitch curto e específico", "alerta", words(o.pitch.curto).length <= 30 && p.score >= 65, `Curto: ${words(o.pitch.curto).length} palavras; longo: nota ${p.score}/100.`));
    const noProof = o.casaDeMensagens.pilares.filter((x) => !x.provas.some(hasNumberOrName));
    out.push(gate("pilares-com-provas", "Cada pilar tem prova concreta", "alerta", noProof.length === 0, noProof.length ? `Sem prova concreta: ${noProof.map((x) => x.pilar).join(", ")}.` : "Pilares provados."));
    return out;
  },

  ativacao: (o) => {
    const longTerm = o.medicao.filter((m) => m.horizonte === "longo");
    return [
      gate("longo-prazo", "Medição inclui o longo prazo", "bloqueia", longTerm.length >= 1, `${longTerm.length} métrica(s) de longo prazo.`, "Inclua métricas de construção de marca (lembrança, associação com pontos de entrada, reconhecimento de ativos) medidas ao longo de meses."),
      gate("metrica-de-marca", "Há métrica de marca", "alerta", o.medicao.some((m) => BRAND_METRIC.test(fold(m.metrica))), o.medicao.map((m) => m.metrica).join("; ")),
      gate("dono", "A marca tem um dono", "alerta", o.governanca.dono.trim().length > 1, o.governanca.dono),
      gate("verificacao-no-checklist", "Checklist de aprovação inclui verificação de texto e de peças", "dica", o.governanca.checklist.some((c) => /verif|brand_verify|genome_verify|checar|revis/i.test(fold(c))), o.governanca.checklist.join("; ")),
    ];
  },
};

/** The voice spec the checker reads, from an approved or draft "voz" output. */
export const specFromVoz = (o: StageOutput<"voz">): VoiceSpec => ({
  avoid: o.lexico.evitar,
  use: o.lexico.usar,
  ownWords: o.lexico.palavrasProprias,
  person: o.gramatica.pessoa,
  formality: o.gramatica.formalidade,
  sentenceTarget: o.gramatica.frasesMedia,
  sentenceMax: o.gramatica.frasesMax,
  exclamation: o.gramatica.exclamacao,
  emoji: o.gramatica.emoji,
});

export const unusedExcerpt = excerpt;
