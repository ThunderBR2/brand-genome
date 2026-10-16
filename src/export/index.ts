import { STAGES, type Conflict, type Decision, type Stage } from "../core/model.js";
import { briefMarkdown, landscapeMarkdown } from "../render.js";
import type { BrandState, Unknown } from "../service.js";
import { specFromVoz } from "../stages/gates.js";
import { STAGE_INFO } from "../stages/info.js";
import type { StageOutput } from "../stages/schemas.js";
import { brandbookHtml } from "./html.js";

export const EXPORT_FORMATS = ["brandbook-md", "brandbook-html", "brief", "voice-json", "agent-prompt", "design-brief", "landscape", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_FILES: Record<ExportFormat, string> = {
  "brandbook-md": "BRANDBOOK.md",
  "brandbook-html": "BRANDBOOK.html",
  brief: "BRIEF.md",
  "voice-json": "voice.json",
  "agent-prompt": "AGENT-PROMPT.md",
  "design-brief": "DESIGN-BRIEF.md",
  landscape: "LANDSCAPE.md",
  json: "brand-genome.json",
};

/** Field labels for the brand book. */
const LABEL: Record<string, string> = {
  negocio: "Negócio", situacao: "Situação", ambicao: "Ambição", problemaDeMarca: "Problema de marca", verdadesDoNegocio: "Verdades do negócio",
  ativosExistentes: "Ativos existentes", ativo: "Ativo", equity: "Equity", manter: "Manter", evidencia: "Evidência", restricoes: "Restrições",
  metricasDeSucesso: "Métricas de sucesso", lacunas: "Lacunas", categoria: "Categoria", nome: "Nome", quadroDeReferencia: "Quadro de referência",
  comoOPublicoDescreve: "Como o público descreve", alternativas: "Alternativas do público", concorrentes: "Concorrentes", promessa: "Promessa",
  voz: "Voz", forca: "Força", fraqueza: "Fraqueza", convencoes: "Convenções", convencao: "Convenção", tipo: "Tipo", decisao: "Decisão",
  porque: "Por quê", espacosLivres: "Espaços livres", primario: "Público principal", quem: "Quem", contexto: "Contexto", tarefas: "Tarefas",
  tensoes: "Tensões", palavras: "Palavras do público", secundarios: "Públicos secundários", pontosDeEntrada: "Pontos de entrada da categoria",
  cep: "Ponto de entrada", situacaoDeUso: "Situação", porqueImporta: "Por que importa", disputa: "Disputa", insights: "Insights", insight: "Insight",
  implicacao: "Implicação", barreiras: "Barreiras", alvo: "Alvo", pontosDeParidade: "Pontos de paridade", pontosDeDiferenca: "Diferenciais",
  diferencial: "Diferencial", prova: "Prova", relevancia: "Relevância", sustentabilidade: "Por que é difícil copiar", onliness: "Só nós",
  declaracao: "Declaração de posicionamento", razoesParaAcreditar: "Razões para acreditar", sacrificio: "Do que abrimos mão",
  opostoPlausivel: "O oposto que outro defenderia", inimigo: "Inimigo", palavraParaPossuir: "Palavra para possuir", ideiaDeMarca: "Ideia de marca",
  proposito: "Propósito", frase: "Frase", provasOperacionais: "Provas operacionais", visao: "Visão", crencas: "Crenças", valores: "Valores",
  valor: "Valor", comportamento: "Comportamento", exemploDeDecisao: "Exemplo de decisão", personalidade: "Personalidade", traco: "Traço",
  e: "É", naoE: "Não é", pilares: "Pilares", pilar: "Pilar", modelo: "Modelo", justificativa: "Justificativa", marcas: "Marcas", papel: "Papel",
  relacao: "Relação", regras: "Regras", estrategia: "Estratégia", criterios: "Critérios", criterio: "Critério", peso: "Peso", candidatos: "Candidatos",
  racional: "Racional", notas: "Notas", verificacoes: "Verificações", marcaINPI: "Busca de marca (INPI)", dominio: "Domínio", linguistica: "Checagem linguística",
  recomendacao: "Recomendação", tracos: "Traços", significa: "Significa", naoSignifica: "Não significa", faca: "Faça", naoFaca: "Não faça",
  exemplo: "Exemplo", mapaDeTom: "Mapa de tom", ajuste: "Ajuste", lexico: "Léxico", usar: "Usar", evitar: "Evitar", palavrasProprias: "Palavras próprias",
  gramatica: "Gramática", pessoa: "Pessoa", formalidade: "Formalidade (1–5)", frasesMedia: "Palavras por frase (média)", frasesMax: "Palavras por frase (máximo)",
  exclamacao: "Exclamação", emoji: "Emoji", outras: "Outras regras", exemplos: "Exemplos", antes: "Antes", depois: "Depois", ativos: "Ativos",
  descricao: "Descrição", exclusividade: "Por que é só nosso", usoNaCategoria: "Uso na categoria", estrategiaDeFama: "Como fica famoso",
  direcaoVisual: "Direção visual", traducoes: "Traduções", traducaoVisual: "Tradução visual", referencias: "Referências", sonoro: "Som",
  movimento: "Movimento", principios: "Princípios", mantidos: "Ativos mantidos", manifesto: "Manifesto", historia: "História", protagonista: "Protagonista",
  conflito: "Conflito", virada: "Virada", transformacao: "Transformação", casaDeMensagens: "Casa de mensagens", guardaChuva: "Mensagem guarda-chuva",
  mensagens: "Mensagens", provas: "Provas", assinaturas: "Assinaturas", pitch: "Pitch", curto: "Curto", longo: "Longo", lancamento: "Lançamento",
  acao: "Ação", canal: "Canal", quando: "Quando", publico: "Público", regrasDeConsistencia: "Regras de consistência", medicao: "Medição",
  metrica: "Métrica", metodo: "Método", cadencia: "Cadência", horizonte: "Horizonte", governanca: "Governança", dono: "Dono", aprovacoes: "Aprovações",
  checklist: "Checklist", primeiros90dias: "Primeiros 90 dias", naoSeAplica: "Não se aplica", motivo: "Motivo",
};

const label = (k: string): string => LABEL[k] ?? k;

const toMd = (v: unknown, depth: number): string => {
  const ind = "  ".repeat(Math.max(0, depth - 1));
  if (v === null || v === undefined || v === "") return "";
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== "object")) return v.map((x) => `${ind}- ${String(x)}`).join("\n");
    return v.map((x) => {
      const entries = Object.entries(x as Record<string, unknown>);
      const [k0, v0] = entries[0] ?? ["", ""];
      const head = typeof v0 === "string" ? `${ind}- **${String(v0)}**` : `${ind}- ${label(k0)}`;
      const rest = entries.slice(typeof v0 === "string" ? 1 : 0).map(([k, val]) => {
        const r = toMd(val, depth + 1);
        return typeof val === "object" && val !== null ? `${ind}  - ${label(k)}:\n${r}` : r ? `${ind}  - ${label(k)}: ${r}` : "";
      }).filter(Boolean);
      return [head, ...rest].join("\n");
    }).join("\n");
  }
  return Object.entries(v as Record<string, unknown>).map(([k, val]) => {
    const r = toMd(val, depth + 1);
    if (!r) return "";
    return typeof val === "object" ? `${ind}- **${label(k)}:**\n${r}` : `${ind}- **${label(k)}:** ${r}`;
  }).filter(Boolean).join("\n");
};

export const brandbookMarkdown = (s: BrandState, conflicts: readonly (Conflict & { decision?: Decision })[], unknowns: readonly Unknown[]): string => {
  const L: string[] = [`# ${s.project.brandName} — Brand book`, "", `Gerado pelo Brand Genome em ${new Date().toLocaleDateString("pt-BR")}. Cada etapa mostra o status (rascunho, reprovada ou aprovada pelo cliente).`, ""];
  for (const st of STAGES) {
    const rec = s.stages[st];
    if (!rec) continue;
    const o = rec.output as Record<string, unknown>;
    if (o.naoSeAplica) continue;
    L.push(`## ${STAGES.indexOf(st) + 1}. ${STAGE_INFO[st].title}`, `_Status: ${rec.status}, versão ${rec.version}_`, "");
    if (st === "posicionamento") L.push(`> ${(o as StageOutput<"posicionamento">).onliness}`, "");
    if (st === "plataforma") L.push(`> **${(o as StageOutput<"plataforma">).ideiaDeMarca}**`, "");
    if (st === "narrativa") {
      const n = o as StageOutput<"narrativa">;
      L.push("### Manifesto", "", ...n.manifesto.split(/\n+/).map((p) => `${p}\n`), "");
      L.push(toMd({ ...n, manifesto: undefined }, 1), "");
      continue;
    }
    L.push(toMd(o, 1), "");
  }
  const open = conflicts.filter((c) => !c.decision);
  if (open.length) L.push("## Pendências", ...open.map((c) => `- ${c.title}`), "");
  if (unknowns.length) L.push("## Ainda desconhecido", ...unknowns.map((u) => `- **${u.what}:** ${u.why}. Como descobrir: ${u.how}.`), "");
  return L.join("\n");
};

export const agentPrompt = (s: BrandState, conflicts: readonly (Conflict & { decision?: Decision })[], unknowns: readonly Unknown[]): string => {
  const voz = s.stages.voz?.output as StageOutput<"voz"> | undefined;
  const L = [
    `Você escreve pela marca ${s.project.brandName}. Tudo o que você precisa saber sobre ela está abaixo. Não invente fatos: use só as provas listadas; se faltar informação, pergunte.`,
    "",
    briefMarkdown(s, conflicts, unknowns),
    "",
  ];
  if (voz) {
    L.push("## Antes e depois (exemplos aprovados)");
    for (const e of voz.exemplos) L.push(`- ${e.contexto}\n  - Antes: ${e.antes}\n  - Depois: ${e.depois}`);
    L.push("");
  }
  L.push("## Como checar o que escreveu", "- Releia: algum concorrente poderia assinar este texto? Se sim, reescreva com as palavras próprias e as provas da marca.", "- Corte adjetivos de autoelogio (inovador, excelência, qualidade, paixão por) e troque por fatos.", "- Se tiver acesso ao Brand Genome, rode brand_verify e corrija os desvios altos e médios.");
  return L.join("\n");
};

export const designBrief = (s: BrandState): string => {
  const plat = s.stages.plataforma?.output as StageOutput<"plataforma"> | undefined;
  const atv = s.stages.ativos?.output as StageOutput<"ativos"> | undefined;
  const pos = s.stages.posicionamento?.output as StageOutput<"posicionamento"> | undefined;
  const pais = s.stages.paisagem?.output as StageOutput<"paisagem"> | undefined;
  const L = [`# Brief de design — ${s.project.brandName}`, "", "Para designers e para o Design Genome. A estratégia vem do Brand Genome; a medição e a verificação das peças visuais ficam com o Design Genome (genome_add_sources com as referências, genome_blueprint para planejar, genome_verify para conferir).", ""];
  if (pos) L.push("## Estratégia em uma linha", pos.onliness, "");
  if (plat) L.push("## Ideia de marca", plat.ideiaDeMarca, "", "## Personalidade → decisões visuais", ...plat.personalidade.map((p) => `- **${p.traco}** (é ${p.e}; não é ${p.naoE})`), "");
  if (atv) {
    L.push("## Traduções visuais", ...atv.direcaoVisual.traducoes.map((t) => `- ${t.traco} → ${t.traducaoVisual}`), "");
    L.push("## Ativos distintivos a construir", ...atv.ativos.map((a) => `- **${a.tipo}:** ${a.descricao}. Papel: ${a.papel}. Por que é só nosso: ${a.exclusividade}. Na categoria: ${a.usoNaCategoria}. Como fica famoso: ${a.estrategiaDeFama}`), "");
    if (atv.mantidos.length) L.push("## Manter (equity existente)", ...atv.mantidos.map((m) => `- ${m}`), "");
    L.push("## Evitar", ...atv.direcaoVisual.evitar.map((e) => `- ${e}`), "");
    if (atv.sonoro) L.push("## Som", `${atv.sonoro.papel}: ${atv.sonoro.descricao}`, "");
    if (atv.movimento) L.push("## Movimento", ...atv.movimento.principios.map((p) => `- ${p}`), "");
    if (atv.direcaoVisual.referencias.length) L.push("## Referências", ...atv.direcaoVisual.referencias.map((r) => `- ${r}`), "");
  }
  const visualConv = pais?.convencoes.filter((c) => c.tipo === "visual") ?? [];
  if (visualConv.length) L.push("## Convenções visuais da categoria", ...visualConv.map((c) => `- ${c.convencao}: **${c.decisao}** (${c.porque})`), "");
  L.push("## Teste de cada peça", "- Cubra o logo: ainda dá para saber de quem é? (ativos distintivos)", "- Coloque ao lado dos concorrentes: some no meio deles? (convenções)", "- A peça expressa a ideia de marca e a personalidade, ou só está bonita?");
  return L.join("\n");
};

export const voiceJson = (s: BrandState): unknown => {
  const voz = s.stages.voz?.output as StageOutput<"voz"> | undefined;
  if (!voz) return { brand: s.project.brandName, voice: null, note: "A etapa voz ainda não foi entregue." };
  return { brand: s.project.brandName, status: s.stages.voz!.status, spec: specFromVoz(voz), traits: voz.tracos, toneMap: voz.mapaDeTom, examples: voz.exemplos, lexicon: voz.lexico, grammar: voz.gramatica };
};

export const exportBrand = (s: BrandState, format: ExportFormat, conflicts: readonly (Conflict & { decision?: Decision })[], unknowns: readonly Unknown[]): string => {
  switch (format) {
    case "brandbook-md": return brandbookMarkdown(s, conflicts, unknowns);
    case "brandbook-html": return brandbookHtml(s, conflicts, unknowns);
    case "brief": return briefMarkdown(s, conflicts, unknowns);
    case "voice-json": return JSON.stringify(voiceJson(s), null, 2);
    case "agent-prompt": return agentPrompt(s, conflicts, unknowns);
    case "design-brief": return designBrief(s);
    case "landscape": return landscapeMarkdown(s.landscape, "full");
    case "json": return JSON.stringify({ project: { name: s.project.name, brandName: s.project.brandName, sector: s.project.sector, market: s.project.market }, stages: s.stages, landscape: s.landscape, conflicts, unknowns, decisions: s.decisions }, null, 2);
  }
};

export const stageList = (): readonly Stage[] => STAGES;
