#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { Command } from "commander";

import { buildCanon, loadCanon, readBatches, appCanonDir, userCanonDir, writeCompiledCanon } from "./canon/build.js";
import { cardMarkdown, searchCanon } from "./canon/query.js";
import { SOURCE_ROLES, STAGES, type SourceRole, type Stage } from "./core/model.js";
import { defaultRoot, doctor, installClaudeDesktop, mcpServerEntry } from "./setup.js";
import { TOOLS } from "./tools.js";

const program = new Command();
program.name("brand").description("Brand Genome: engenharia de marca com evidência").option("-r, --root <dir>", "pasta dos projetos de marca", defaultRoot()).option("-p, --project <name>", "projeto");

const ctx = () => ({ root: program.opts<{ root: string }>().root, log: (m: string) => process.stderr.write(`${m}\n`) });
const proj = (): Record<string, unknown> => {
  const p = program.opts<{ project?: string }>().project;
  return p ? { project: p } : {};
};
const show = async (tool: string, args: Record<string, unknown>): Promise<void> => {
  const r = await TOOLS[tool]!({ ...proj(), ...args }, ctx());
  const out = r.content.map((c) => c.text).join("\n");
  if (r.isError) {
    process.stderr.write(`${out}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`${out}\n`);
};

program.command("init <name>").description("criar um projeto de marca").option("--sector <s>", "setor").option("--market <m>", "mercado", "Brasil").option("--brand <b>", "nome da marca (se diferente)").action((name: string, o: { sector?: string; market?: string; brand?: string }) => show("brand_projects", { action: "create", name, sector: o.sector, market: o.market, brandName: o.brand }));
program.command("projects").description("listar projetos").action(() => show("brand_projects", {}));
program.command("status").description("situação do projeto e próximo passo").action(() => show("brand_status", {}));
program.command("add <items...>").description("adicionar fontes (links, arquivos, pastas)").requiredOption("--role <role>", SOURCE_ROLES.join("|")).option("--entity <name>", "nome do concorrente/marca").option("--pages <n>", "páginas por site", Number).action((items: string[], o: { role: SourceRole; entity?: string; pages?: number }) => show("brand_add_sources", { sources: items.map((uri) => ({ uri, role: o.role, ...(o.entity ? { entity: o.entity } : {}), ...(o.pages ? { maxPages: o.pages } : {}) })) }));
program.command("note <file>").description("adicionar uma nota a partir de um arquivo de texto").option("--role <role>", "papel", "cliente").option("--label <l>", "rótulo").action(async (file: string, o: { role: string; label?: string }) => show("brand_add_note", { text: await readFile(file, "utf8"), role: o.role, label: o.label ?? file }));
program.command("sources").description("listar fontes").action(() => show("brand_sources", {}));
program.command("landscape").description("paisagem da categoria").option("--full").action((o: { full?: boolean }) => show("brand_landscape", { detail: o.full ? "full" : "summary" }));
program.command("stage <stage>").description(`brief de uma etapa (${STAGES.join(", ")})`).action((stage: Stage) => show("brand_stage_request", { stage }));
program.command("submit <stage> <json>").description("enviar a entrega de uma etapa (arquivo JSON)").action(async (stage: Stage, json: string) => show("brand_stage_submit", { stage, output: JSON.parse(await readFile(json, "utf8")) }));
program.command("approve <stage>").description("aprovar uma etapa (com o OK do cliente)").option("--note <n>").option("--force").action((stage: Stage, o: { note?: string; force?: boolean }) => show("brand_stage_approve", { stage, note: o.note, force: o.force }));
program.command("conflicts").description("conflitos").action(() => show("brand_conflicts", {}));
program.command("verify <target>").description("verificar um texto, arquivo ou URL").option("--no-voice", "ignorar a voz da marca").action((target: string, o: { voice: boolean }) => show("brand_verify", { target, useVoice: o.voice }));
program.command("names <names...>").description("triagem de nomes").action((names: string[]) => show("brand_name_check", { names }));
program.command("brief").description("brief compacto da marca").action(() => show("brand_brief", {}));
program.command("export [format]").description("exportar (brandbook-md, brandbook-html, brief, voice-json, agent-prompt, design-brief, landscape, json)").action((format?: string) => show("brand_export", { format: format ?? "brandbook-md", includeContent: false }));

const canon = program.command("canon").description("cânone de branding");
canon.command("build").description("consolidar os lotes e gravar canon/canon.json").action(async () => {
  const c = buildCanon(await readBatches([`${appCanonDir()}/raw`, userCanonDir()]));
  const f = await writeCompiledCanon(c);
  process.stdout.write(`${JSON.stringify({ file: f, batches: c.batches.length, sources: c.sources.length, principles: c.principles.length, consolidated: c.principles.filter((p) => p.support === "consolidado").length, frameworks: c.frameworks.length, debates: c.debates.length, cases: c.cases.length, antipatterns: c.antipatterns.length, lexicon: c.lexicon.length, warnings: c.warnings }, null, 1)}\n`);
});
canon.command("search <query...>").description("buscar no cânone").option("--stage <s>").action(async (q: string[], o: { stage?: string }) => {
  const c = await loadCanon();
  for (const r of searchCanon(c, { text: q.join(" "), ...(o.stage ? { stage: o.stage } : {}), limit: 8 })) process.stdout.write(`${cardMarkdown(c, r.kind, r.card)}\n\n`);
});
canon.command("stats").description("tamanho e saúde do cânone").action(() => show("brand_canon_stats", {}));

program.command("mcp").description("servidor MCP (stdio)").action(async () => {
  const { startMcp } = await import("./mcp.js");
  await startMcp(program.opts<{ root: string }>().root);
});
program.command("mcp-config").description("mostrar ou instalar a configuração do Claude Desktop").option("--install", "adicionar ao Claude Desktop (com backup)").action(async (o: { install?: boolean }) => {
  const root = program.opts<{ root: string }>().root;
  if (o.install) {
    const r = await installClaudeDesktop(root);
    process.stdout.write(`Instalado em ${r.path}${r.backup ? ` (backup: ${r.backup})` : ""}. Feche e abra o Claude Desktop.\n`);
  } else process.stdout.write(`${JSON.stringify({ mcpServers: { "brand-genome": mcpServerEntry(root) } }, null, 2)}\n`);
});
program.command("doctor").description("conferir dependências").action(async () => {
  for (const c of await doctor()) process.stdout.write(`${c.ok ? "ok " : c.required ? "ERRO" : "--  "} ${c.name}: ${c.detail}${!c.ok && c.fix ? ` → ${c.fix}` : ""}\n`);
});
program.command("worker", { hidden: true }).action(async () => {
  const { runWorker } = await import("./tools.js");
  await runWorker();
});

await program.parseAsync();
