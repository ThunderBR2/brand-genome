import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import {
  extractionSchema,
  sourceSchema,
  type Decision,
  type Extraction,
  type Source,
  type SourceKind,
  type SourceRole,
  type Stage,
  type StageRecord,
} from "./model.js";

const PROJECT_FILE = "brand.project.json";

export interface ProjectMeta {
  readonly schema: "brand-genome-project/1";
  name: string;
  /** The brand being built (may be a working name until naming is approved). */
  brandName: string;
  sector: string;
  market: string;
  lang: "pt" | "en";
  createdAt: string;
  sources: Source[];
}

export interface AddSourceInput {
  readonly uri: string;
  readonly role: SourceRole;
  readonly kind?: SourceKind;
  readonly label?: string;
  readonly entity?: string;
  readonly text?: string;
  readonly options?: Record<string, unknown>;
}

export const randomId = (prefix: string): string => `${prefix}_${randomBytes(4).toString("hex")}`;

const DOC_EXT = new Set([".pdf", ".md", ".markdown", ".txt", ".html", ".htm", ".docx", ".csv", ".json", ".srt", ".vtt"]);

export const detectKind = (uri: string): SourceKind => {
  if (/^https?:\/\//i.test(uri)) {
    const ext = extname(new URL(uri).pathname).toLowerCase();
    return ext === ".pdf" || ext === ".docx" || ext === ".txt" || ext === ".md" ? "document" : "web";
  }
  if (DOC_EXT.has(extname(uri).toLowerCase())) return "document";
  throw new Error(`Não sei que tipo de fonte é esta: ${uri}. Use um link, um arquivo (PDF, DOCX, MD, TXT, HTML, CSV, SRT) ou uma nota de texto.`);
};

const sha256 = async (path: string): Promise<string> => createHash("sha256").update(await readFile(path)).digest("hex");

/** A brand project on disk: sources, extractions, stage records and decisions. */
export class Project {
  private constructor(
    readonly root: string,
    private meta: ProjectMeta,
  ) {}

  static async create(root: string, init: { name: string; brandName?: string; sector?: string; market?: string; lang?: "pt" | "en" }): Promise<Project> {
    const abs = resolve(root);
    const existing = await Project.tryOpen(abs);
    if (existing) return existing;
    await mkdir(abs, { recursive: true });
    const project = new Project(abs, {
      schema: "brand-genome-project/1",
      name: init.name,
      brandName: init.brandName ?? init.name,
      sector: init.sector ?? "",
      market: init.market ?? "Brasil",
      lang: init.lang ?? "pt",
      createdAt: new Date().toISOString(),
      sources: [],
    });
    await project.save();
    return project;
  }

  static async tryOpen(root: string): Promise<Project | null> {
    const file = join(resolve(root), PROJECT_FILE);
    if (!existsSync(file)) return null;
    const raw = JSON.parse(await readFile(file, "utf8")) as ProjectMeta;
    raw.sources = (raw.sources ?? []).map((s) => sourceSchema.parse(s));
    return new Project(resolve(root), raw);
  }

  static async open(root: string): Promise<Project> {
    const p = await Project.tryOpen(root);
    if (!p) throw new Error(`Nenhum projeto de marca em ${resolve(root)}. Crie um com brand_projects (action "create") ou "brand init".`);
    return p;
  }

  get name(): string { return this.meta.name; }
  get brandName(): string { return this.meta.brandName; }
  get sector(): string { return this.meta.sector; }
  get market(): string { return this.meta.market; }
  get lang(): "pt" | "en" { return this.meta.lang; }
  get createdAt(): string { return this.meta.createdAt; }
  get sources(): readonly Source[] { return this.meta.sources; }

  async update(patch: Partial<Pick<ProjectMeta, "brandName" | "sector" | "market" | "lang" | "name">>): Promise<void> {
    Object.assign(this.meta, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== "")));
    await this.save();
  }

  private async save(): Promise<void> {
    await writeFile(join(this.root, PROJECT_FILE), `${JSON.stringify(this.meta, null, 2)}\n`);
  }

  dir(...parts: string[]): string { return join(this.root, ...parts); }

  /** Register a source. Local files are copied into the project so it is self-contained. */
  async addSource(input: AddSourceInput): Promise<Source> {
    const kind = input.text !== undefined ? "note" : (input.kind ?? detectKind(input.uri));
    const dup = this.meta.sources.find((s) => s.uri === input.uri && s.role === input.role && kind !== "note");
    if (dup) return dup;
    const id = randomId("src");
    let local: string | undefined;
    let hash: string | undefined;
    await mkdir(this.dir("sources"), { recursive: true });
    if (kind === "note") {
      local = join("sources", `${id}.md`);
      await writeFile(this.dir(local), input.text ?? "");
      hash = await sha256(this.dir(local));
    } else if (!/^https?:\/\//i.test(input.uri)) {
      const abs = resolve(input.uri);
      if (!existsSync(abs)) throw new Error(`Arquivo não encontrado: ${abs}`);
      local = join("sources", `${id}${extname(abs).toLowerCase()}`);
      await copyFile(abs, this.dir(local));
      hash = await sha256(this.dir(local));
    }
    const source: Source = sourceSchema.parse({
      id,
      kind,
      role: input.role,
      uri: kind === "note" ? `note:${id}` : input.uri,
      label: input.label ?? (kind === "note" ? "Nota" : /^https?:\/\//i.test(input.uri) ? new URL(input.uri).hostname.replace(/^www\./, "") : basename(input.uri)),
      ...(input.entity ? { entity: input.entity } : {}),
      addedAt: new Date().toISOString(),
      ...(hash ? { sha256: hash } : {}),
      ...(local ? { local } : {}),
      options: input.options ?? {},
    });
    this.meta.sources.push(source);
    await this.save();
    return source;
  }

  async removeSources(ids: readonly string[]): Promise<number> {
    const before = this.meta.sources.length;
    const drop = new Set(ids);
    for (const s of this.meta.sources.filter((x) => drop.has(x.id))) {
      if (s.local) await rm(this.dir(s.local), { force: true });
      await rm(this.dir("extractions", `${s.id}.json`), { force: true });
    }
    this.meta.sources = this.meta.sources.filter((s) => !drop.has(s.id));
    await this.save();
    return before - this.meta.sources.length;
  }

  source(id: string): Source {
    const s = this.meta.sources.find((x) => x.id === id);
    if (!s) throw new Error(`Fonte ${id} não existe neste projeto.`);
    return s;
  }

  async saveExtraction(e: Extraction): Promise<void> {
    await mkdir(this.dir("extractions"), { recursive: true });
    await writeFile(this.dir("extractions", `${e.sourceId}.json`), JSON.stringify(e));
  }

  async extraction(sourceId: string): Promise<Extraction | null> {
    const f = this.dir("extractions", `${sourceId}.json`);
    if (!existsSync(f)) return null;
    return extractionSchema.parse(JSON.parse(await readFile(f, "utf8")));
  }

  async extractions(): Promise<Extraction[]> {
    const out: Extraction[] = [];
    for (const s of this.meta.sources) {
      const e = await this.extraction(s.id);
      if (e) out.push(e);
    }
    return out;
  }

  async stage(stage: Stage): Promise<StageRecord | null> {
    const f = this.dir("stages", `${stage}.json`);
    if (!existsSync(f)) return null;
    return JSON.parse(await readFile(f, "utf8")) as StageRecord;
  }

  async saveStage(record: StageRecord): Promise<void> {
    await mkdir(this.dir("stages", "history"), { recursive: true });
    const prev = await this.stage(record.stage);
    if (prev) await writeFile(this.dir("stages", "history", `${record.stage}.v${prev.version}.json`), JSON.stringify(prev, null, 2));
    await writeFile(this.dir("stages", `${record.stage}.json`), JSON.stringify(record, null, 2));
  }

  async stages(): Promise<Partial<Record<Stage, StageRecord>>> {
    const out: Partial<Record<Stage, StageRecord>> = {};
    if (!existsSync(this.dir("stages"))) return out;
    for (const f of await readdir(this.dir("stages"))) {
      if (!f.endsWith(".json")) continue;
      const rec = JSON.parse(await readFile(this.dir("stages", f), "utf8")) as StageRecord;
      out[rec.stage] = rec;
    }
    return out;
  }

  async decisions(): Promise<Decision[]> {
    const f = this.dir("decisions.json");
    if (!existsSync(f)) return [];
    return JSON.parse(await readFile(f, "utf8")) as Decision[];
  }

  async addDecision(d: Decision): Promise<void> {
    const all = (await this.decisions()).filter((x) => x.conflictId !== d.conflictId);
    all.push(d);
    await writeFile(this.dir("decisions.json"), JSON.stringify(all, null, 2));
  }

  async localSize(s: Source): Promise<number> {
    return s.local ? (await stat(this.dir(s.local))).size : 0;
  }
}

/** Projects live side by side under one root: "<root>/<name>". */
export const listProjects = async (root: string): Promise<{ name: string; dir: string; brandName: string }[]> => {
  if (!existsSync(root)) return [];
  const out: { name: string; dir: string; brandName: string }[] = [];
  for (const d of await readdir(root, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const p = await Project.tryOpen(join(root, d.name));
    if (p) out.push({ name: d.name, dir: p.root, brandName: p.brandName });
  }
  return out;
};
