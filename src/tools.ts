import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { buildCanon, loadCanon, userCanonDir, userHome } from "./canon/build.js";
import { cardMarkdown, findCard, searchCanon } from "./canon/query.js";
import { SOURCE_ROLES, STAGES, type SourceRole, type Stage } from "./core/model.js";
import { listProjects, Project } from "./core/project.js";
import { slug, words } from "./core/text.js";
import { EXPORT_FILES, EXPORT_FORMATS, exportBrand, type ExportFormat } from "./export/index.js";
import { assessmentMarkdown, briefMarkdown, conflictsMarkdown, landscapeMarkdown, namesMarkdown, stageRequestMarkdown, stageResultMarkdown } from "./render.js";
import { BrandService } from "./service.js";

/**
 * Tool logic, run in a fresh worker process per call (see mcp.ts), so updates
 * apply without restarting Claude.
 */

type Content = { type: "text"; text: string };
export interface ToolResult { content: Content[]; isError?: boolean }
export interface ToolContext { readonly root: string; readonly log: (m: string) => void }
type Args = Record<string, unknown>;

const run = promisify(execFile);
const text = (value: unknown): ToolResult => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 1) }] });

const stateFile = (): string => join(userHome(), "state.json");
const readState = async (): Promise<{ lastProject?: string }> => (existsSync(stateFile()) ? (JSON.parse(await readFile(stateFile(), "utf8")) as { lastProject?: string }) : {});
const writeState = async (s: { lastProject?: string }): Promise<void> => {
  await mkdir(userHome(), { recursive: true });
  await writeFile(stateFile(), JSON.stringify(s));
};

/** Projects live side by side under the root: "<root>/<slug>". A path is used as is. */
export const projectDir = async (ctx: ToolContext, project?: string): Promise<string> => {
  const name = project ?? (await readState()).lastProject;
  if (!name) {
    const all = await listProjects(ctx.root);
    if (all.length === 1) return all[0]!.dir;
    throw new Error(all.length ? `Qual projeto? Passe project com um destes: ${all.map((p) => p.name).join(", ")}.` : 'Nenhum projeto de marca ainda. Crie um com brand_projects {action: "create", name, sector}.');
  }
  if (/[\\/]/.test(name) || /^[a-z]:/i.test(name)) return resolve(name);
  return join(ctx.root, slug(name));
};

const svc = async (ctx: ToolContext, args: Args): Promise<BrandService> => {
  const dir = await projectDir(ctx, args.project as string | undefined);
  await Project.open(dir);
  await writeState({ ...(await readState()), lastProject: dir });
  return new BrandService(dir, ctx.log);
};

const asStage = (v: unknown): Stage => {
  if (typeof v === "string" && (STAGES as readonly string[]).includes(v)) return v as Stage;
  throw new Error(`Etapa inválida. Use uma destas: ${STAGES.join(", ")}.`);
};

const asRole = (v: unknown, fallback?: SourceRole): SourceRole => {
  if (typeof v === "string" && (SOURCE_ROLES as readonly string[]).includes(v)) return v as SourceRole;
  if (fallback) return fallback;
  throw new Error(`Papel inválido. Use: ${SOURCE_ROLES.join(", ")}.`);
};

const DISSECT_GUIDE = `Disseque esta fonte para o cânone do Brand Genome. Responda com brand_canon_dissect_submit passando um lote JSON:
{ "batch": "<nome-curto>", "sources": [Source], "principles": [Principle], "frameworks": [Framework], "debates": [Debate], "cases": [Case], "antipatterns": [Antipattern], "lexicon": [LexiconEntry] }
Regras: tudo em português do Brasil e parafraseado (no máximo uma citação literal de menos de 15 palavras por fonte); cada card aponta para a fonte em "sources": [{"id": "src-...", "locator": "página/seção/minuto", "paraphrase": "..."}]; seja honesto com a evidência (empirica, caso, opiniao-especialista...); use ids existentes quando for o mesmo conceito (consulte brand_canon_search) para que a fonte corrobore o card; registre discordâncias entre escolas em "debates". O formato completo de cada card está em canon/SCHEMA.md (brand_canon_card com id "SCHEMA" devolve o texto).`;

export const TOOLS: Record<string, (args: Args, ctx: ToolContext) => Promise<ToolResult>> = {
  async brand_projects(args, ctx) {
    const action = (args.action as string | undefined) ?? "list";
    if (action === "create") {
      const name = String(args.name ?? "").trim();
      if (!name) throw new Error("Passe name.");
      const dir = join(ctx.root, slug(name));
      const p = await Project.create(dir, { name, brandName: (args.brandName as string) || name, sector: (args.sector as string) ?? "", market: (args.market as string) ?? "Brasil", lang: args.lang === "en" ? "en" : "pt" });
      await writeState({ lastProject: dir });
      return text({ created: p.name, brandName: p.brandName, dir: p.root, next: "Adicione fontes com brand_add_sources: o site e materiais da marca (role cliente), 3 a 6 concorrentes (role concorrente, entity com o nome), e a voz do público (role publico: avaliações, entrevistas, comentários). Depois rode brand_landscape e brand_stage_request com stage diagnostico." });
    }
    if (action === "update") {
      const s = await svc(ctx, args);
      const p = await s.project();
      await p.update({ brandName: args.brandName as string, sector: args.sector as string, market: args.market as string, lang: args.lang as "pt" | "en" });
      return text({ updated: p.name, brandName: p.brandName, sector: p.sector, market: p.market });
    }
    const all = await listProjects(ctx.root);
    const last = (await readState()).lastProject;
    return text({ root: ctx.root, projects: all.map((p) => ({ name: p.name, brand: p.brandName, current: p.dir === last })) });
  },

  async brand_status(args, ctx) {
    return text(await (await svc(ctx, args)).status());
  },

  async brand_brief(args, ctx) {
    const s = await svc(ctx, args);
    return text(briefMarkdown(await s.load(), await s.conflicts(), await s.unknowns()));
  },

  async brand_add_sources(args, ctx) {
    const s = await svc(ctx, args);
    type In = { uri: string; role?: string; entity?: string; label?: string; maxPages?: number };
    const list: In[] = [...((args.sources as In[] | undefined) ?? []), ...((args.links as string[] | undefined) ?? []).map((uri) => ({ uri }))];
    if (!list.length) throw new Error("Passe links ou sources.");
    const defRole = args.role ? asRole(args.role) : undefined;
    const inputs = [];
    for (const i of list) {
      const uri = i.uri.trim();
      if (!/^https?:\/\//i.test(uri) && existsSync(uri) && (await import("node:fs")).statSync(uri).isDirectory()) {
        for (const f of await readdir(uri)) if (/\.(pdf|docx|md|txt|html?|csv|srt|vtt|json)$/i.test(f)) inputs.push({ uri: join(uri, f), role: asRole(i.role, defRole ?? "categoria"), ...(i.entity ? { entity: i.entity } : {}) });
        continue;
      }
      inputs.push({ uri, role: asRole(i.role ?? defRole, "categoria"), ...(i.entity ? { entity: i.entity } : {}), ...(i.label ? { label: i.label } : {}), ...(i.maxPages ? { options: { maxPages: i.maxPages } } : {}) });
    }
    const res = await s.addSources(inputs);
    return text({ added: res.map((r) => ({ id: r.source.id, role: r.source.role, entity: r.source.entity, label: r.source.label, ok: r.ok, words: r.words, limitations: r.limitations, error: r.error })), next: "Rode brand_landscape para ver as convenções da categoria e a voz do público." });
  },

  async brand_add_note(args, ctx) {
    const s = await svc(ctx, args);
    const body = String(args.text ?? "").trim();
    if (words(body).length < 3) throw new Error("A nota está vazia.");
    const res = await s.addSources([{ uri: "note", text: body, role: asRole(args.role, "cliente"), label: (args.label as string) || "Nota", ...(args.entity ? { entity: args.entity as string } : {}) }]);
    return text({ added: res[0]!.source.id, role: res[0]!.source.role, words: res[0]!.words });
  },

  async brand_sources(args, ctx) {
    const s = await svc(ctx, args);
    const st = await s.load();
    const ex = new Map(st.extractions.map((e) => [e.sourceId, e]));
    return text(st.project.sources.map((x) => ({ id: x.id, role: x.role, entity: x.entity, label: x.label, uri: x.kind === "note" ? undefined : x.uri, words: ex.get(x.id)?.wordCount ?? 0, pages: ex.get(x.id)?.pages.length ?? 0, limitations: ex.get(x.id)?.limitations ?? ["não extraída"] })));
  },

  async brand_remove_source(args, ctx) {
    const s = await svc(ctx, args);
    return text({ removed: await s.removeSources((args.sourceIds as string[]) ?? []) });
  },

  async brand_reextract(args, ctx) {
    const s = await svc(ctx, args);
    return text(await s.reextract(args.sourceIds as string[] | undefined));
  },

  async brand_landscape(args, ctx) {
    const s = await svc(ctx, args);
    return text(landscapeMarkdown((await s.load()).landscape, args.detail === "full" ? "full" : "summary"));
  },

  async brand_stage_request(args, ctx) {
    const s = await svc(ctx, args);
    return text(stageRequestMarkdown(await s.load(), asStage(args.stage)));
  },

  async brand_stage_submit(args, ctx) {
    const s = await svc(ctx, args);
    let output = args.output;
    if (typeof output === "string") output = JSON.parse(output);
    const rec = await s.submitStage(asStage(args.stage), output, (args.selfChecks as never[]) ?? []);
    return text(stageResultMarkdown(rec));
  },

  async brand_stage_approve(args, ctx) {
    const s = await svc(ctx, args);
    const rec = await s.approveStage(asStage(args.stage), args.note as string | undefined, args.force === true);
    return text({ approved: rec.stage, version: rec.version, next: (await s.status()).next });
  },

  async brand_conflicts(args, ctx) {
    const s = await svc(ctx, args);
    return text(conflictsMarkdown(await s.conflicts()));
  },

  async brand_resolve_conflict(args, ctx) {
    const s = await svc(ctx, args);
    await s.resolveConflict(String(args.conflictId), String(args.choice), args.note as string | undefined);
    return text({ recorded: args.conflictId });
  },

  async brand_verify(args, ctx) {
    const s = await svc(ctx, args);
    const target = String(args.target ?? args.text ?? "").trim();
    if (!target) throw new Error("Passe target: o texto, um arquivo ou uma URL.");
    const { text: body, label } = await s.readTarget(target);
    const a = await s.assess(body, { useVoice: args.useVoice !== false });
    return text(assessmentMarkdown(a, label));
  },

  async brand_name_check(args, ctx) {
    const s = await svc(ctx, args);
    const names = ((args.names as string[]) ?? []).map((n) => n.trim()).filter(Boolean);
    if (!names.length) throw new Error("Passe names.");
    return text(namesMarkdown(await s.nameCheck(names)));
  },

  async brand_canon_search(args) {
    const canon = await loadCanon();
    const res = searchCanon(canon, {
      ...(args.query ? { text: String(args.query) } : {}),
      ...(args.kind ? { kind: args.kind as never } : {}),
      ...(args.stage ? { stage: String(args.stage) } : {}),
      ...(args.domain ? { domain: String(args.domain) } : {}),
      ...(args.school ? { school: String(args.school) } : {}),
      limit: Math.min(30, Number(args.limit) || 10),
    });
    if (!res.length) return text("Nada encontrado no cânone. Tente outras palavras, ou sem filtros.");
    return text(res.map((r) => cardMarkdown(canon, r.kind, r.card, args.detail === "full")).join("\n\n---\n\n"));
  },

  async brand_canon_card(args) {
    const id = String(args.id ?? "");
    if (id === "SCHEMA") {
      const { appCanonDir } = await import("./canon/build.js");
      return text(await readFile(join(appCanonDir(), "SCHEMA.md"), "utf8"));
    }
    const canon = await loadCanon();
    const f = findCard(canon, id);
    if (!f) return text(`Nenhum card com id "${id}". Use brand_canon_search.`);
    return text(cardMarkdown(canon, f.kind, f.card, true));
  },

  async brand_canon_stats() {
    const c = await loadCanon();
    const bySupport = { consolidado: 0, "fonte-unica": 0, emDebate: 0 };
    for (const p of c.principles) { bySupport[p.support]++; if (p.debatedIn.length) bySupport.emDebate++; }
    return text({ batches: c.batches, sources: c.sources.length, dissected: c.sources.filter((s) => s.dissected).length, principles: c.principles.length, bySupport, frameworks: c.frameworks.length, debates: c.debates.length, cases: c.cases.length, antipatterns: c.antipatterns.length, lexicon: c.lexicon.length, warnings: c.warnings.slice(0, 20) });
  },

  async brand_canon_dissect_request(args) {
    const target = String(args.target ?? "").trim();
    if (!target) throw new Error("Passe target: um link, um arquivo ou o texto colado.");
    const s = new BrandService(".", () => {});
    const { text: body, label } = await s.readTarget(target);
    const page = Math.max(1, Number(args.page) || 1);
    const size = 12_000;
    const parts = Math.max(1, Math.ceil(body.length / size));
    const chunk = body.slice((page - 1) * size, page * size);
    return text(`${DISSECT_GUIDE}\n\nFonte: ${label}\nParte ${page} de ${parts}${page < parts ? ` (peça page ${page + 1} para continuar)` : ""}\n\n---\n${chunk}`);
  },

  async brand_canon_dissect_submit(args) {
    let batch = args.batch;
    if (typeof batch === "string") batch = JSON.parse(batch);
    const b = batch as { batch?: string };
    const name = slug(b.batch || "lote");
    const check = buildCanon([{ name, data: batch }]);
    const count = check.principles.length + check.frameworks.length + check.debates.length + check.cases.length + check.antipatterns.length + check.lexicon.length;
    if (!count && !check.sources.length) throw new Error(`Lote vazio ou inválido. ${check.warnings.join("; ")}`);
    await mkdir(userCanonDir(), { recursive: true });
    const file = join(userCanonDir(), `${name}-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}.json`);
    await writeFile(file, JSON.stringify(batch, null, 1));
    return text({ saved: file, sources: check.sources.length, principles: check.principles.length, frameworks: check.frameworks.length, debates: check.debates.length, cases: check.cases.length, antipatterns: check.antipatterns.length, lexicon: check.lexicon.length, warnings: check.warnings });
  },

  async brand_export(args, ctx) {
    const s = await svc(ctx, args);
    const format = (args.format as ExportFormat) ?? "brandbook-md";
    if (!(EXPORT_FORMATS as readonly string[]).includes(format)) throw new Error(`Formato inválido: ${EXPORT_FORMATS.join(", ")}.`);
    const st = await s.load();
    const out = exportBrand(st, format, await s.conflicts(), await s.unknowns());
    await mkdir(st.project.dir("exports"), { recursive: true });
    const file = st.project.dir("exports", EXPORT_FILES[format]);
    await writeFile(file, out);
    return text(args.includeContent === false || format === "brandbook-html" ? { saved: file, chars: out.length } : `Salvo em ${file}\n\n${out}`);
  },

  async brand_update(_args, ctx) {
    const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const tmp = await mkdtemp(join(tmpdir(), "brand-update-"));
    const win = process.platform === "win32";
    try {
      ctx.log("update: baixando a versão mais nova");
      const res = await fetch("https://github.com/ThunderBR2/brand-genome/archive/refs/heads/main.zip");
      if (!res.ok) throw new Error(`Falha ao baixar do GitHub (${res.status})`);
      const zip = join(tmp, "src.zip");
      await writeFile(zip, Buffer.from(await res.arrayBuffer()));
      await run("tar", ["-xf", zip, "-C", tmp]);
      const folder = (await readdir(tmp, { withFileTypes: true })).find((d) => d.isDirectory())!;
      const src = join(tmp, folder.name);
      for (const entry of await readdir(src)) {
        if (entry === "node_modules") continue;
        await cp(join(src, entry), join(appRoot, entry), { recursive: true, force: true });
      }
      const npm = win ? "npm.cmd" : "npm";
      ctx.log("update: instalando dependências");
      await run(npm, ["install", "--no-audit", "--no-fund"], { cwd: appRoot, shell: win, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60_000 });
      ctx.log("update: compilando");
      await run(npm, ["run", "build"], { cwd: appRoot, shell: win, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60_000 });
      const pkg = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8")) as { version: string };
      return text({ updated: true, version: pkg.version, note: "A lógica nova já vale. Ferramentas novas aparecem depois de reiniciar o Claude." });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  },
};

/** Worker entry: read {tool, args, root} from stdin, write a ToolResult to stdout. */
export const runWorker = async (): Promise<void> => {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const req = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { tool: string; args: Args; root: string };
  const ctx: ToolContext = { root: req.root, log: (m) => process.stderr.write(`[brand] ${m}\n`) };
  let result: ToolResult;
  try {
    const handler = TOOLS[req.tool];
    if (!handler) throw new Error(`Ferramenta desconhecida: ${req.tool}`);
    result = await handler(req.args ?? {}, ctx);
  } catch (e) {
    result = { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] };
  }
  process.stdout.write(JSON.stringify(result));
};
