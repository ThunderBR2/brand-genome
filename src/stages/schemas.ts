import { z } from "zod";

import type { Stage } from "../core/model.js";

/** What each stage must deliver. Field names are Portuguese because the deliverable is the brand book. */

const s = z.string().trim();
const req = (min = 3) => s.min(min, "preencha este campo");
const list = (min = 0) => z.array(req(2)).min(min);
const skip = { naoSeAplica: z.boolean().optional(), motivo: s.optional() };

export const STAGE_SCHEMAS = {
  diagnostico: z.object({
    negocio: req(10).describe("o que a empresa faz, para quem, como ganha dinheiro"),
    situacao: z.enum(["marca-nova", "reposicionamento", "rebrand", "evolucao"]),
    ambicao: req(10).describe("onde quer chegar em 3 a 5 anos"),
    problemaDeMarca: req(10).describe("o problema que a marca precisa resolver (não o do negócio inteiro)"),
    verdadesDoNegocio: list(3).describe("fatos verificáveis que já diferenciam: origem, processo, números, pessoas, escolhas"),
    ativosExistentes: z.array(z.object({ ativo: req(2), equity: z.enum(["alta", "media", "baixa", "desconhecida"]), manter: z.enum(["sim", "nao", "avaliar"]), evidencia: s.optional() })).default([]),
    restricoes: list().default([]),
    metricasDeSucesso: list(1),
    lacunas: list().default([]).describe("o que ainda não se sabe e precisa ser descoberto"),
  }),
  paisagem: z.object({
    categoria: z.object({ nome: req(2), quadroDeReferencia: req(5), comoOPublicoDescreve: s.optional() }),
    alternativas: list(1).describe("o que o público faria se a marca não existisse (inclui 'não fazer nada' e soluções caseiras)"),
    concorrentes: z.array(z.object({ nome: req(2), promessa: req(5), voz: s.optional(), forca: s.optional(), fraqueza: s.optional() })).min(2),
    convencoes: z.array(z.object({ convencao: req(3), tipo: z.enum(["verbal", "visual", "promessa", "tom", "preco", "canal", "experiencia"]), decisao: z.enum(["seguir", "quebrar"]), porque: req(5) })).min(3),
    espacosLivres: list(1),
  }),
  publico: z.object({
    primario: z.object({ quem: req(5), contexto: req(5), tarefas: list(1), tensoes: list(1), palavras: list(3).describe("como o público fala, nas palavras dele") }),
    secundarios: z.array(z.object({ quem: req(3), porque: req(3) })).default([]),
    pontosDeEntrada: z.array(z.object({ cep: req(3), situacao: req(3), porqueImporta: s.optional(), disputa: z.enum(["livre", "disputado", "dominado"]) })).min(3),
    insights: z.array(z.object({ insight: req(10), evidencia: req(5), implicacao: req(5) })).min(2),
    barreiras: list().default([]),
  }),
  posicionamento: z.object({
    quadroDeReferencia: req(3),
    alvo: req(5),
    pontosDeParidade: list(1),
    pontosDeDiferenca: z.array(z.object({ diferencial: req(5), prova: req(5), relevancia: req(5), sustentabilidade: req(5) })).min(1),
    onliness: req(15).describe("Somos a única ___ que ___ para ___ que ___ em ___ "),
    declaracao: req(20),
    razoesParaAcreditar: list(2),
    sacrificio: list(1).describe("o que a marca escolhe NÃO ser ou NÃO fazer"),
    opostoPlausivel: req(10).describe("o posicionamento oposto que um concorrente sério poderia defender"),
    inimigo: s.optional(),
    palavraParaPossuir: s.optional(),
  }),
  plataforma: z.object({
    ideiaDeMarca: req(3),
    proposito: z.object({ frase: req(10), provasOperacionais: z.array(req(5)).default([]) }).optional(),
    visao: s.optional(),
    crencas: list(1).describe("o ponto de vista da marca: o que ela acredita que a categoria faz errado"),
    valores: z.array(z.object({ valor: req(2), comportamento: req(8), exemploDeDecisao: req(8) })).min(2).max(6),
    personalidade: z.array(z.object({ traco: req(3), e: req(5), naoE: req(5) })).min(3).max(6),
    promessa: req(8),
    pilares: z.array(z.object({ pilar: req(3), prova: req(5) })).min(2).max(5),
  }),
  arquitetura: z.object({
    ...skip,
    modelo: z.enum(["marca-unica", "branded-house", "submarcas", "endossada", "house-of-brands", "hibrido"]).optional(),
    justificativa: s.optional(),
    marcas: z.array(z.object({ nome: req(2), papel: req(3), relacao: req(3) })).default([]),
    regras: list().default([]),
  }),
  naming: z.object({
    ...skip,
    estrategia: s.optional(),
    criterios: z.array(z.object({ criterio: req(3), peso: z.number().min(1).max(5) })).default([]),
    candidatos: z.array(z.object({
      nome: req(2),
      tipo: z.enum(["descritivo", "sugestivo", "abstrato", "inventado", "composto", "metafora", "fundador", "acronimo", "outro"]),
      racional: req(10),
      notas: z.record(z.number().min(1).max(5)).default({}),
      verificacoes: z.object({
        marcaINPI: z.enum(["nao-feito", "sem-conflito-aparente", "conflito", "em-analise"]).default("nao-feito"),
        dominio: z.enum(["nao-feito", "livre", "ocupado", "alternativa"]).default("nao-feito"),
        linguistica: z.enum(["nao-feito", "ok", "problema"]).default("nao-feito"),
      }).default({}),
    })).default([]),
    recomendacao: s.optional(),
  }),
  voz: z.object({
    tracos: z.array(z.object({ traco: req(3), significa: req(8), naoSignifica: req(5), faca: list(2), naoFaca: list(2), exemplo: req(8) })).min(3).max(5),
    mapaDeTom: z.array(z.object({ situacao: req(3), ajuste: req(5), exemplo: req(5) })).min(3),
    lexico: z.object({ usar: list(3), evitar: list(5), palavrasProprias: list(3) }),
    gramatica: z.object({
      pessoa: z.enum(["nos", "voce", "eu", "terceira", "misto"]),
      formalidade: z.number().min(1).max(5),
      frasesMedia: z.number().min(4).max(40),
      frasesMax: z.number().min(6).max(80),
      exclamacao: z.enum(["nunca", "raro", "livre"]),
      emoji: z.enum(["nunca", "raro", "livre"]),
      outras: list().default([]),
    }),
    exemplos: z.array(z.object({ contexto: req(3), antes: req(10), depois: req(10) })).min(3),
  }),
  ativos: z.object({
    ativos: z.array(z.object({
      tipo: z.enum(["cor", "forma", "tipografia", "simbolo", "personagem", "som", "motion", "frase", "padrao", "embalagem", "ritual", "outro"]),
      descricao: req(5),
      papel: req(5),
      exclusividade: req(5).describe("por que isto pode ser só desta marca"),
      usoNaCategoria: req(3).describe("quem na categoria usa algo parecido"),
      estrategiaDeFama: req(5).describe("como vai ficar famoso: onde aparece, com que frequência, por quanto tempo sem mudar"),
    })).min(3),
    direcaoVisual: z.object({ traducoes: z.array(z.object({ traco: req(3), traducaoVisual: req(5) })).min(2), evitar: list(2), referencias: list().default([]) }),
    sonoro: z.object({ papel: req(3), descricao: req(5) }).optional(),
    movimento: z.object({ principios: list(1) }).optional(),
    mantidos: list().default([]),
  }),
  narrativa: z.object({
    manifesto: req(120),
    historia: z.object({ protagonista: req(3), conflito: req(5), virada: req(5), transformacao: req(5) }),
    casaDeMensagens: z.object({ guardaChuva: req(5), pilares: z.array(z.object({ pilar: req(3), mensagens: list(1), provas: list(1) })).min(2) }),
    assinaturas: z.array(z.object({ frase: req(3), racional: req(5) })).min(2),
    pitch: z.object({ curto: req(10), longo: req(30) }),
  }),
  ativacao: z.object({
    lancamento: z.array(z.object({ acao: req(5), canal: req(2), quando: req(2), publico: s.optional() })).min(2),
    regrasDeConsistencia: list(3),
    medicao: z.array(z.object({ metrica: req(3), metodo: req(3), cadencia: req(3), horizonte: z.enum(["curto", "longo"]) })).min(2),
    governanca: z.object({ dono: req(2), aprovacoes: req(3), checklist: list(3) }),
    primeiros90dias: list(3),
  }),
} satisfies Record<Stage, z.ZodTypeAny>;

export type StageOutput<S extends Stage> = z.infer<(typeof STAGE_SCHEMAS)[S]>;
