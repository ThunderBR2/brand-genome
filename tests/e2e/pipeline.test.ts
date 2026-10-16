import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The whole method on a fictional brand: a specialty coffee roaster with four
 * cliché-heavy competitors, customer reviews and a briefing. Sources are
 * served from a local HTTP server; the real canon in canon/raw is used.
 */

const FIX = resolve(__dirname, "../fixtures");
let server: Server;
let base = "";
let root = "";
let TOOLS: typeof import("../../src/tools.js").TOOLS;

const call = async (tool: string, args: Record<string, unknown> = {}): Promise<string> => {
  const r = await TOOLS[tool]!({ project: "Grão Alto", ...args }, { root, log: () => {} });
  const out = r.content.map((c) => c.text).join("\n");
  if (r.isError) throw new Error(out);
  return out;
};
const stage = async (name: string) => JSON.parse(await readFile(join(FIX, "etapas", `${name}.json`), "utf8")) as Record<string, unknown>;

beforeAll(async () => {
  const home = await mkdtemp(join(tmpdir(), "brand-genome-"));
  process.env.BRAND_GENOME_HOME = home;
  root = join(home, "projects");
  ({ TOOLS } = await import("../../src/tools.js"));
  server = createServer(async (req, res) => {
    try {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await readFile(join(FIX, "concorrentes", (req.url ?? "/").replace(/^\//, ""))));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  server?.close();
  if (process.env.BRAND_GENOME_HOME) await rm(process.env.BRAND_GENOME_HOME, { recursive: true, force: true });
});

describe("Brand Genome end to end", () => {
  it("creates a project and reads every kind of source", async () => {
    await call("brand_projects", { action: "create", name: "Grão Alto", sector: "cafe especial torrefacao" });
    const comps: [string, string][] = [["cafe-aurora", "Café Aurora"], ["santo-grao", "Santo Grão"], ["bom-dia", "Bom Dia Café"], ["terra-roxa", "Terra Roxa"]];
    const res = JSON.parse(await call("brand_add_sources", { sources: [
      ...comps.map(([f, n]) => ({ uri: `${base}/${f}.html`, role: "concorrente", entity: n, maxPages: 1 })),
      { uri: join(FIX, "cliente", "briefing.md"), role: "cliente" },
      { uri: join(FIX, "publico", "avaliacoes.csv"), role: "publico" },
    ] })) as { added: { ok: boolean; words: number }[] };
    expect(res.added.every((a) => a.ok && a.words > 30)).toBe(true);
  });

  it("measures the category conventions and the audience's own words", async () => {
    const l = await call("brand_landscape");
    expect(l).toContain("**cafés especiais** — 100%");
    expect(l).toContain("**grãos selecionados** — 100%");
    expect(l).toContain("**grão à xícara**");
    expect(l).toMatch(/data da torra.*nenhum concorrente usa/);
  });

  it("stage briefs bring the canon, the measured facts and the format", async () => {
    const r = await call("brand_stage_request", { stage: "posicionamento" });
    expect(r).toContain("O que o cânone diz");
    expect(r).toContain("onliness");
    expect(r).toContain("Convenções");
  });

  it("blocks a generic positioning with evidence from competitors", async () => {
    const bad = { quadroDeReferencia: "Cafés especiais", alvo: "Amantes de café", pontosDeParidade: ["Atendimento"], pontosDeDiferenca: [{ diferencial: "Grãos selecionados com torra artesanal", prova: "Qualidade superior", relevancia: "Clientes querem qualidade", sustentabilidade: "Nossa paixão" }], onliness: "Somos a única marca de cafés especiais com paixão por café e grãos selecionados do grão à xícara.", declaracao: "Oferecemos uma experiência única com cafés especiais de qualidade, grãos selecionados e excelência do grão à xícara, com paixão por café.", razoesParaAcreditar: ["Qualidade e excelência", "Compromisso com o cliente"], sacrificio: ["Nada"], opostoPlausivel: "Uma marca sem qualidade que não se importa com o cliente" };
    const r = await call("brand_stage_submit", { stage: "posicionamento", output: bad });
    expect(r).toContain("reprovada");
    expect(r).toContain("já aparece em");
    expect(r).toContain("evidência (");
    await expect(call("brand_stage_approve", { stage: "posicionamento" })).rejects.toThrow(/bloqueiam/);
  });

  it("runs all eleven stages of a specific brand without blocking gates", async () => {
    for (const s of ["diagnostico", "paisagem", "publico", "posicionamento", "plataforma", "arquitetura", "naming", "voz", "ativos", "narrativa", "ativacao"]) {
      const r = await call("brand_stage_submit", { stage: s, output: await stage(s) });
      expect(r, `${s}: ${r}`).not.toContain("reprovada");
    }
    await call("brand_stage_approve", { stage: "posicionamento", note: "OK do cliente" });
    const status = JSON.parse(await call("brand_status")) as { stages: { stage: string; status: string }[] };
    expect(status.stages.find((s) => s.stage === "posicionamento")!.status).toBe("aprovada");
  });

  it("verifies texts against the brand's voice and the category", async () => {
    const bad = await call("brand_verify", { target: "Somos apaixonados por café e oferecemos uma experiência única com grãos selecionados e qualidade do grão à xícara! Compromisso com a excelência." });
    const good = await call("brand_verify", { target: "Torramos às terças e quintas, em lotes de 12 kg. Seu café sai com a data da torra no pacote e o nome do sítio. Café com mais de 5 dias de torra a gente não manda." });
    const score = (s: string) => Number(/Nota (\d+)\/100/.exec(s)![1]);
    expect(score(bad)).toBeLessThan(40);
    expect(score(good)).toBeGreaterThanOrEqual(85);
    expect(bad).toContain("lista de palavras que a marca não usa");
  });

  it("checks names and exports every format", async () => {
    const n = await call("brand_name_check", { names: ["Grão Alto", "Santo Grãos", "CafeHub"] });
    expect(n).toContain("Parecido com Santo Grão");
    for (const f of ["brandbook-md", "brandbook-html", "brief", "voice-json", "agent-prompt", "design-brief", "landscape", "json"]) {
      const r = await call("brand_export", { format: f, includeContent: false });
      expect(r).toContain("saved");
    }
    const brief = await call("brand_brief");
    expect(brief).toContain("Café com data");
    expect(brief).toContain("Somos a única torrefação da Mantiqueira");
  });

  it("searches the canon and grows it with a user dissection", async () => {
    const s = await call("brand_canon_search", { query: "ativos distintivos fama unicidade" });
    expect(s).toContain("distinctive-assets-fame-uniqueness");
    const saved = JSON.parse(await call("brand_canon_dissect_submit", { batch: { batch: "teste", sources: [{ id: "src-teste", title: "Teste" }], principles: [{ id: "consistency-over-time", title: "Consistência", statement: "Mantenha os ativos.", sources: [{ id: "src-teste" }] }] } })) as { principles: number };
    expect(saved.principles).toBe(1);
    const card = await call("brand_canon_card", { id: "consistency-over-time" });
    expect(card).toContain("Teste");
  });
});
