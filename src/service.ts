import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

import { assessText, type Assessment, type VoiceSpec } from "./analysis/generic.js";
import { buildLandscape, type Landscape } from "./analysis/landscape.js";
import { lexiconFrom } from "./analysis/lexicon.js";
import { checkNames } from "./analysis/names.js";
import { loadCanon } from "./canon/build.js";
import type { Canon, LexiconEntry } from "./canon/types.js";
import {
  STAGES,
  type Conflict,
  type Decision,
  type Extraction,
  type GateResult,
  type SelfCheck,
  type Source,
  type SourceRole,
  type Stage,
  type StageRecord,
} from "./core/model.js";
import { Project, type AddSourceInput } from "./core/project.js";
import { fold, words } from "./core/text.js";
import { extractSource } from "./extractors/index.js";
import { foundInCompetitors, specFromVoz, STAGE_GATES, type CompetitorSegment, type GateContext } from "./stages/gates.js";
import { STAGE_INFO } from "./stages/info.js";
import { STAGE_SCHEMAS, type StageOutput } from "./stages/schemas.js";

export interface BrandState {
  readonly project: Project;
  readonly canon: Canon;
  readonly lexicon: LexiconEntry[];
  readonly extractions: Extraction[];
  readonly landscape: Landscape;
  readonly stages: Partial<Record<Stage, StageRecord>>;
  readonly decisions: Decision[];
  readonly competitorSegments: CompetitorSegment[];
  readonly competitorTexts: Map<string, string>;
  readonly audienceText: string;
  readonly voiceSpec: VoiceSpec | null;
  readonly brandText: string;
}

export interface Unknown { readonly what: string; readonly why: string; readonly how: string }

const textOf = (e: Extraction): string => e.segments.map((s) => s.text).join("\n");

/** Everything the brand has decided so far, as plain text: used by the swap test. */
const strategicText = (stages: Partial<Record<Stage, StageRecord>>): string => {
  const parts: string[] = [];
  const collect = (v: unknown): void => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  };
  for (const s of ["posicionamento", "plataforma", "voz", "narrativa"] as const) if (stages[s]) collect(stages[s]!.output);
  return parts.join("\n");
};

/** One layer used by the MCP tools and the CLI. */
export class BrandService {
  private state: BrandState | null = null;

  constructor(readonly dir: string, private readonly log: (m: string) => void = () => {}) {}

  project(): Promise<Project> { return Project.open(this.dir); }

  async addSources(inputs: readonly AddSourceInput[], extract = true): Promise<{ source: Source; ok: boolean; words?: number; limitations?: string[]; error?: string }[]> {
    const p = await this.project();
    const out: { source: Source; ok: boolean; words?: number; limitations?: string[]; error?: string }[] = [];
    for (const input of inputs) {
      const source = await p.addSource(input);
      if (!extract) {
        out.push({ source, ok: true });
        continue;
      }
      try {
        const e = await extractSource(p, source, this.log);
        out.push({ source, ok: true, words: e.wordCount, limitations: e.limitations });
      } catch (err) {
        out.push({ source, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    this.state = null;
    await this.saveLandscape();
    return out;
  }

  async reextract(ids?: readonly string[]): Promise<{ id: string; ok: boolean; error?: string }[]> {
    const p = await this.project();
    const out: { id: string; ok: boolean; error?: string }[] = [];
    for (const s of p.sources.filter((x) => !ids?.length || ids.includes(x.id))) {
      try {
        await extractSource(p, s, this.log);
        out.push({ id: s.id, ok: true });
      } catch (err) {
        out.push({ id: s.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    this.state = null;
    await this.saveLandscape();
    return out;
  }

  async removeSources(ids: readonly string[]): Promise<number> {
    const n = await (await this.project()).removeSources(ids);
    this.state = null;
    await this.saveLandscape();
    return n;
  }

  private async saveLandscape(): Promise<void> {
    const s = await this.load();
    await writeFile(s.project.dir("landscape.json"), JSON.stringify(s.landscape, null, 1));
  }

  async load(): Promise<BrandState> {
    if (this.state) return this.state;
    const project = await this.project();
    const canon = await loadCanon();
    const lexicon = lexiconFrom(canon);
    const extractions = await project.extractions();
    const landscape = buildLandscape({ brand: project.brandName, sector: project.sector, sources: project.sources, extractions, lexicon });
    const stages = await project.stages();
    const decisions = await project.decisions();
    const byId = new Map(project.sources.map((s) => [s.id, s]));
    const competitorSegments: CompetitorSegment[] = [];
    const competitorTexts = new Map<string, string>();
    let audienceText = "";
    for (const e of extractions) {
      const s = byId.get(e.sourceId);
      if (!s) continue;
      if (s.role === "concorrente") {
        const name = s.entity?.trim() || s.label;
        for (const seg of e.segments) competitorSegments.push({ entity: name, sourceId: s.id, locator: seg.locator, text: seg.text });
        competitorTexts.set(name, `${competitorTexts.get(name) ?? ""}\n${textOf(e)}`);
      } else if (s.role === "publico") audienceText += `\n${textOf(e)}`;
    }
    const voz = stages.voz?.output as StageOutput<"voz"> | undefined;
    const voiceSpec = voz ? specFromVoz(voz) : null;
    this.state = { project, canon, lexicon, extractions, landscape, stages, decisions, competitorSegments, competitorTexts, audienceText, voiceSpec, brandText: strategicText(stages) };
    return this.state;
  }

  async assess(text: string, opts: { voice?: VoiceSpec | null; useVoice?: boolean } = {}): Promise<Assessment> {
    const s = await this.load();
    return assessText(text, {
      lexicon: s.lexicon,
      sector: s.project.sector,
      lang: s.project.lang,
      landscape: s.landscape,
      competitorTexts: s.competitorTexts,
      ...(s.brandText ? { brandText: s.brandText } : {}),
      brandName: s.project.brandName,
      voice: opts.voice !== undefined ? opts.voice : opts.useVoice === false ? null : s.voiceSpec,
    });
  }

  private gateContext(s: BrandState): GateContext {
    return {
      sector: s.project.sector,
      lang: s.project.lang,
      brandName: s.project.brandName,
      landscape: s.landscape,
      lexicon: s.lexicon,
      stages: s.stages,
      competitorSegments: s.competitorSegments,
      audienceText: s.audienceText,
      voiceSpec: s.voiceSpec,
      assess: (text, o) =>
        assessText(text, {
          lexicon: s.lexicon,
          sector: s.project.sector,
          lang: s.project.lang,
          landscape: s.landscape,
          competitorTexts: s.competitorTexts,
          ...(s.brandText ? { brandText: s.brandText } : {}),
          brandName: s.project.brandName,
          voice: o?.voice ?? null,
        }),
    };
  }

  /** Validate, run the quality gates and store a stage. Failing gates keep it as "reprovada" (saved, not approved). */
  async submitStage(stage: Stage, output: unknown, selfChecks: readonly SelfCheck[] = []): Promise<StageRecord> {
    const schema = STAGE_SCHEMAS[stage];
    const parsed = schema.safeParse(output);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `- ${i.path.join(".") || "(raiz)"}: ${i.message}`).join("\n");
      throw new Error(`A entrega da etapa "${stage}" não segue o formato. Corrija e envie de novo:\n${issues}`);
    }
    const s = await this.load();
    // Voice gates need the spec being submitted; the other stages use the stored one.
    const ctx = this.gateContext(s);
    const gates = (STAGE_GATES[stage] as (o: unknown, c: GateContext) => GateResult[])(parsed.data, ctx);
    const prev = s.stages[stage];
    const blocking = gates.filter((g) => !g.pass && g.severity === "bloqueia");
    const record: StageRecord = {
      stage,
      version: (prev?.version ?? 0) + 1,
      status: blocking.length ? "reprovada" : "rascunho",
      submittedAt: new Date().toISOString(),
      output: parsed.data as Record<string, unknown>,
      gates,
      selfChecks,
    };
    await s.project.saveStage(record);
    this.state = null;
    return record;
  }

  /** Approve a stage. Only with the user's explicit agreement (the tool says so). */
  async approveStage(stage: Stage, note?: string, force = false): Promise<StageRecord> {
    const s = await this.load();
    const rec = s.stages[stage];
    if (!rec) throw new Error(`A etapa "${stage}" ainda não foi entregue.`);
    const blocking = rec.gates.filter((g) => !g.pass && g.severity === "bloqueia");
    if (blocking.length && !force) throw new Error(`A etapa tem portões que bloqueiam: ${blocking.map((g) => g.title).join("; ")}. Corrija, ou aprove com force e uma nota explicando a escolha do usuário.`);
    if (blocking.length && force && !note) throw new Error("Aprovar com portões bloqueando exige uma nota com o motivo dado pelo usuário.");
    const approved: StageRecord = { ...rec, status: "aprovada", approvedAt: new Date().toISOString(), ...(note ? { approvalNote: note } : {}) };
    await s.project.saveStage({ ...approved, version: rec.version });
    this.state = null;
    return approved;
  }

  async resolveConflict(conflictId: string, choice: string, note?: string): Promise<void> {
    const p = await this.project();
    await p.addDecision({ conflictId, choice, ...(note ? { note } : {}), decidedAt: new Date().toISOString() });
    this.state = null;
  }

  /** Conflicts between what the brand declares, what was measured and what the stages say. */
  async conflicts(): Promise<(Conflict & { decision?: Decision })[]> {
    const s = await this.load();
    const out: Conflict[] = [];
    const id = (k: string): string => `c_${createHash("sha1").update(k).digest("hex").slice(0, 8)}`;
    const pos = s.stages.posicionamento?.output as StageOutput<"posicionamento"> | undefined;
    if (pos) {
      for (const pod of pos.pontosDeDiferenca) {
        const found = foundInCompetitors(pod.diferencial, s.competitorSegments);
        if (found.length) out.push({ id: id(`pod:${fold(pod.diferencial)}`), kind: "diferencial-na-categoria", stage: "posicionamento", title: `O diferencial "${pod.diferencial}" já aparece em concorrentes`, sides: [{ label: "Declarado como diferencial", detail: pod.diferencial }, ...found.map((f) => ({ label: `Dito por ${f.entity}`, detail: f.ev.excerpt, evidence: [f.ev] }))] });
      }
    }
    const voz = s.stages.voz?.output as StageOutput<"voz"> | undefined;
    const client = s.landscape.entities.find((e) => e.role === "cliente");
    if (voz && client && client.words > 150) {
      const d = client.voice.formality - voz.gramatica.formalidade;
      if (Math.abs(d) >= 1.5) out.push({ id: id("voz:formalidade"), kind: "declarado-vs-observado", stage: "voz", title: "A voz definida e a voz dos materiais atuais da marca estão distantes", sides: [{ label: "Voz definida", detail: `formalidade ${voz.gramatica.formalidade}/5` }, { label: "Materiais atuais (medido)", detail: `formalidade ${client.voice.formality}/5; ${client.voiceSummary}` }] });
    }
    const plat = s.stages.plataforma?.output as StageOutput<"plataforma"> | undefined;
    if (plat?.proposito && plat.proposito.provasOperacionais.length < 2) {
      out.push({ id: id("proposito"), kind: "debate-de-escolas", stage: "plataforma", canonRef: "purpose-value", title: "Propósito declarado com poucas provas operacionais", sides: [{ label: "Escola do propósito", detail: "Propósito orienta a empresa e cria preferência." }, { label: "Ciência de marketing / céticos", detail: "O público raramente conhece o propósito das marcas; sem prova operacional, é frase de efeito." }] });
    }
    const narr = s.stages.narrativa?.output as StageOutput<"narrativa"> | undefined;
    if (narr && s.voiceSpec) {
      const a = await this.assess(narr.manifesto);
      if (a.score < 60) out.push({ id: id("narrativa:voz"), kind: "etapas-incoerentes", stage: "narrativa", title: "O manifesto não segue a voz aprovada", sides: [{ label: "Voz", detail: "regras da etapa voz" }, { label: "Manifesto", detail: `nota ${a.score}/100: ${a.deviations.slice(0, 2).map((x) => x.message).join(" ")}` }] });
    }
    const atv = s.stages.ativacao?.output as StageOutput<"ativacao"> | undefined;
    if (atv && !atv.medicao.some((m) => m.horizonte === "longo")) {
      out.push({ id: id("medicao"), kind: "debate-de-escolas", stage: "ativacao", canonRef: "long-vs-short-term", title: "Medição só de curto prazo", sides: [{ label: "Plano atual", detail: atv.medicao.map((m) => m.metrica).join(", ") }, { label: "Eficácia (Binet & Field)", detail: "Construção de marca aparece em meses e anos; medir só o curto prazo puxa para ações táticas." }] });
    }
    const decided = new Map(s.decisions.map((d) => [d.conflictId, d]));
    return out.map((c) => (decided.has(c.id) ? { ...c, decision: decided.get(c.id)! } : c));
  }

  /** What the system does not know yet, and how to find out. Never invent these. */
  async unknowns(): Promise<Unknown[]> {
    const s = await this.load();
    const out: Unknown[] = [];
    const roles = new Set(s.project.sources.map((x) => x.role));
    const comps = s.landscape.entities.filter((e) => e.role === "concorrente").length;
    if (comps < 3) out.push({ what: "Concorrentes", why: `só ${comps} concorrente(s) com texto: as convenções da categoria ficam fracas`, how: "brand_add_sources com os sites de 3 a 6 concorrentes (role: concorrente, entity: nome)" });
    if (!roles.has("publico")) out.push({ what: "Voz do público", why: "nenhuma avaliação, entrevista ou comentário: insights viram hipótese", how: "adicione avaliações (Google, Reclame Aqui, App Store), transcrições de entrevistas ou comentários (role: publico)" });
    for (const st of STAGES) {
      const rec = s.stages[st];
      if (!rec && !STAGE_INFO[st].optional) out.push({ what: `Etapa ${STAGE_INFO[st].title}`, why: "ainda não entregue", how: `brand_stage_request com stage "${st}"` });
    }
    const naming = s.stages.naming?.output as StageOutput<"naming"> | undefined;
    if (naming && !naming.naoSeAplica && !naming.candidatos.some((c) => c.verificacoes.marcaINPI === "sem-conflito-aparente")) out.push({ what: "Disponibilidade legal do nome", why: "nenhum candidato com busca de marca feita", how: "busca manual no INPI (busca.inpi.gov.br) na classe certa, idealmente com um advogado de marcas" });
    const ativos = s.stages.ativos?.output as StageOutput<"ativos"> | undefined;
    if (ativos) out.push({ what: "Fama e unicidade reais dos ativos", why: "a escolha é hipótese até ser testada com o público", how: "mostre cada ativo sem o nome para 30+ pessoas da categoria e pergunte de que marca é (grade Fama × Unicidade)" });
    return out;
  }

  /** Where the brand stands and what to do next. */
  async status(): Promise<{ brand: string; sector: string; market: string; sources: Record<SourceRole, number>; stages: { stage: Stage; title: string; status: string; version: number; failing: string[] }[]; next: string; canon: { principles: number; sources: number; lexicon: number } }> {
    const s = await this.load();
    const sources = { cliente: 0, concorrente: 0, publico: 0, categoria: 0, referencia: 0, pesquisa: 0 } as Record<SourceRole, number>;
    for (const src of s.project.sources) sources[src.role]++;
    const stages = STAGES.map((st) => {
      const r = s.stages[st];
      return { stage: st, title: STAGE_INFO[st].title, status: r?.status ?? (STAGE_INFO[st].optional ? "vazia (opcional)" : "vazia"), version: r?.version ?? 0, failing: (r?.gates ?? []).filter((g) => !g.pass && g.severity !== "dica").map((g) => g.title) };
    });
    let next = "";
    if (sources.concorrente < 3) next = "Adicione 3 a 6 concorrentes (brand_add_sources, role concorrente) e materiais do público e da própria marca; depois rode brand_landscape.";
    else {
      const pending = stages.find((x) => x.status === "vazia" || x.status === "reprovada" || x.status === "rascunho");
      next = pending ? (pending.status === "rascunho" ? `Mostre a etapa "${pending.title}" ao usuário e peça aprovação (brand_stage_approve), ou melhore e reenvie.` : `Etapa "${pending.title}": brand_stage_request com stage "${pending.stage}".`) : "Todas as etapas entregues. Exporte o brand book (brand_export) e verifique cada texto novo com brand_verify.";
    }
    return { brand: s.project.brandName, sector: s.project.sector, market: s.project.market, sources, stages, next, canon: { principles: s.canon.principles.length, sources: s.canon.sources.length, lexicon: s.lexicon.length } };
  }

  async nameCheck(names: readonly string[]) {
    const s = await this.load();
    const competitors = s.landscape.entities.filter((e) => e.role === "concorrente").map((e) => e.entity);
    return checkNames(names, { competitors, landscape: s.landscape, lexicon: s.lexicon, sector: s.project.sector, market: s.project.market });
  }

  /** Read a text target: raw text, a local file or a URL. */
  async readTarget(target: string): Promise<{ text: string; label: string }> {
    if (/^https?:\/\//i.test(target)) {
      const { readSite } = await import("./extractors/web.js");
      const r = await readSite(target, { maxPages: 1, idPrefix: "v" });
      return { text: r.pages.flatMap((p) => p.segments.filter((x) => x.kind !== "meta").map((x) => x.text)).join("\n"), label: target };
    }
    if (target.length < 400 && existsSync(target)) {
      const { readDocument } = await import("./extractors/document.js");
      const r = await readDocument({ uri: target, local: target, idPrefix: "v", label: target });
      return { text: r.segments.map((x) => x.text).join("\n"), label: target };
    }
    return { text: target, label: `${words(target).slice(0, 8).join(" ")}…` };
  }

  async saveJson(name: string, data: unknown): Promise<string> {
    const p = await this.project();
    const f = p.dir(name);
    await writeFile(f, JSON.stringify(data, null, 2));
    return f;
  }

  async readJson<T>(name: string): Promise<T | null> {
    const p = await this.project();
    const f = p.dir(name);
    return existsSync(f) ? (JSON.parse(await readFile(f, "utf8")) as T) : null;
  }
}
