import { describe, expect, it } from "vitest";

import { assessText } from "../../src/analysis/generic.js";
import { findLexicon, lexiconFrom } from "../../src/analysis/lexicon.js";
import { checkNames } from "../../src/analysis/names.js";
import { measureVoice } from "../../src/analysis/voice.js";
import { buildCanon } from "../../src/canon/build.js";
import { findPhrase, surfaceForms, bestForm, terms } from "../../src/core/text.js";

const lexicon = lexiconFrom(null);

describe("text", () => {
  it("finds phrases regardless of accents but keeps offsets aligned", () => {
    const t = "Nossa inovação é única. Inovacao de novo.";
    const hits = findPhrase(t, "inovação");
    expect(hits.length).toBe(2);
    expect(t.slice(hits[0]!, hits[0]! + 8)).toBe("inovação");
  });

  it("with accents on, 'é só' does not match 'e só'", () => {
    expect(findPhrase("torramos e só enviamos", "é só", { accents: true })).toEqual([]);
    expect(findPhrase("é só clicar", "é só", { accents: true }).length).toBe(1);
  });

  it("never pairs words across sentences and shows the written form", () => {
    expect(terms("Experiência única. Grãos novos.").some((x) => x === "unica grao")).toBe(false);
    const forms = surfaceForms(["O que me ganhou foi a data da torra no pacote."]);
    expect(bestForm(forms, terms("data torra").find((x) => x.includes(" "))!)).toBe("data da torra");
  });
});

describe("voice", () => {
  it("measures sentence length, person and formality", () => {
    const casual = measureVoice("A gente torra toda terça! Bora tomar um café? Tá fresquinho pra você!", "pt");
    const formal = measureVoice("Prezado cliente, informamos que, conforme estabelecido em contrato, a companhia procederá à atualização cadastral mediante solicitação formal.", "pt");
    expect(casual.formality).toBeLessThan(formal.formality);
    expect(casual.exclamationsPer100Sentences).toBeGreaterThan(0);
    expect(formal.avgSentence).toBeGreaterThan(casual.avgSentence);
  });
});

describe("generic-language check", () => {
  it("scores clichés low and specifics high", () => {
    const generic = assessText("Somos apaixonados por café e oferecemos uma experiência única com qualidade, excelência e soluções inovadoras para transformar vidas.", { lexicon, sector: "cafe", lang: "pt" });
    const specific = assessText("Toda terça a Marina torra 12 kg de café de seis sítios da Mantiqueira. Na sexta ele chega na sua casa com a data da torra no pacote.", { lexicon, sector: "cafe", lang: "pt" });
    expect(generic.score).toBeLessThan(50);
    expect(specific.score).toBeGreaterThan(80);
    expect(generic.deviations.some((d) => d.facet === "generico")).toBe(true);
  });

  it("applies the brand's voice rules", () => {
    const a = assessText("Compre agora! Qualidade garantida! Não perca!", { lexicon, sector: "", lang: "pt", voice: { avoid: ["compre agora"], use: [], ownWords: [], exclamation: "nunca", formality: 3 } });
    expect(a.deviations.some((d) => d.facet === "voz" && d.severity === "alta")).toBe(true);
    expect(a.deviations.some((d) => d.message.includes("exclamação"))).toBe(true);
  });

  it("only counts category terms for the project's sector", () => {
    const lex = [...lexicon, { term: "sabor inigualável", lang: "pt" as const, kind: "categoria" as const, category: "alimentacao", replacement: "", sources: [] }];
    expect(findLexicon("um sabor inigualável", lex, { sector: "cafeteria" }).some((h) => h.term === "sabor inigualável")).toBe(true);
    expect(findLexicon("um sabor inigualável", lex, { sector: "software" }).some((h) => h.term === "sabor inigualável")).toBe(false);
  });
});

describe("names", () => {
  it("flags clichés, descriptive words and closeness to competitors", () => {
    const [cliche, close, ok] = checkNames(["Cafeify Hub", "Santo Graos", "Lumara"], { competitors: ["Santo Grão"], lexicon, sector: "cafe", market: "Brasil", landscape: null });
    expect(cliche!.flags.length).toBeGreaterThan(0);
    expect(close!.closestCompetitor!.similarity).toBeGreaterThan(0.75);
    expect(ok!.score).toBeGreaterThan(cliche!.score);
    expect(ok!.manualChecks.some((m) => m.where.includes("inpi"))).toBe(true);
  });
});

describe("canon", () => {
  it("merges cards with the same id and counts independent sources", () => {
    const a = { batch: "a", sources: [{ id: "src-a", title: "A", author: "Autora A" }], principles: [{ id: "consistency-over-time", title: "Consistência", statement: "Mantenha.", strength: 2, sources: [{ id: "src-a" }], stage: ["ativacao"] }], frameworks: [], debates: [], cases: [], antipatterns: [], lexicon: [] };
    const b = { batch: "b", sources: [{ id: "src-b", title: "B", author: "Autor B" }], principles: [{ id: "consistency-over-time", title: "Consistência", statement: "Mantenha por anos.", strength: 3, sources: [{ id: "src-b" }], conflictsWith: ["rebrand-vs-evolve"] }], frameworks: [], debates: [{ id: "rebrand-vs-evolve", question: "Evoluir ou romper?", positions: [] }], cases: [], antipatterns: [], lexicon: [{ term: "Paixão por", lang: "pt", kind: "cliche" }] };
    const c = buildCanon([{ name: "a", data: a }, { name: "b", data: b }]);
    const p = c.principles.find((x) => x.id === "consistency-over-time")!;
    expect(p.sourceCount).toBe(2);
    expect(p.support).toBe("consolidado");
    expect(p.strength).toBe(3);
    expect(p.stage).toContain("ativacao");
    expect(p.debatedIn).toContain("rebrand-vs-evolve");
    expect(c.lexicon[0]!.term).toBe("paixão por");
    expect(c.warnings).toEqual([]);
  });

  it("reports invalid batches instead of failing", () => {
    const c = buildCanon([{ name: "x", data: { __error: "boom" } }, { name: "y", data: { batch: "y", principles: [{ nope: 1 }] } }]);
    expect(c.warnings.length).toBe(2);
  });
});

describe("review fixes", () => {
  it("stems singular and plural to the same term", async () => {
    const { stem } = await import("../../src/core/text.js");
    for (const [a, b] of [["inovacao", "inovacoes"], ["especial", "especiais"], ["cor", "cores"], ["solucao", "solucoes"], ["papel", "papeis"], ["jovem", "jovens"]]) expect(stem(a!)).toBe(stem(b!));
  });

  it("keeps naming clichés out of running text", () => {
    const lex = [...lexicon, { term: "pro", lang: "pt" as const, kind: "cliche" as const, category: "naming", replacement: "", sources: ["x"] }];
    expect(findLexicon("Leva pro trabalho numa garrafa térmica", lex, { sector: "cafe" }).some((h) => h.term === "pro")).toBe(false);
    expect(findLexicon("Leva pro trabalho", lex, { sector: "cafe", includeNaming: true }).some((h) => h.term === "pro")).toBe(true);
  });

  it("does not let short or vague texts score as strong", () => {
    const tiny = assessText("a", { lexicon, sector: "", lang: "pt" });
    expect(tiny.verdict).toContain("curto");
    const vague = assessText("Somos a única marca de café bom para quem gosta de café bom de verdade.", { lexicon, sector: "cafe", lang: "pt" });
    expect(vague.score).toBeLessThan(60);
    const english = assessText("Our seamless platform helps you leverage synergy and empower teams. Innovation and excellence.", { lexicon, sector: "", lang: "pt" });
    expect(english.score).toBeLessThan(60);
  });

  it("measures neutral Portuguese and English as neutral", () => {
    expect(measureVoice("Nos dias de semana, a bolsa cara e a massa fresca vendem demais. A beleza do produto é que ele sabe durar.", "pt").formality).toBeGreaterThanOrEqual(2.5);
    expect(measureVoice("We want to help you to get to know how to talk to your customers. Our team answers within two hours.", "en").formality).toBeGreaterThanOrEqual(2.5);
  });

  it("does not flag Portuguese names for sounding normal", () => {
    const res = checkNames(["Amor", "Elo", "Ipê", "Prosa", "Amigo", "Spotify", "CafeHub"], { competitors: [], lexicon, sector: "", market: "Brasil", landscape: null });
    const flagged = (n: string) => res.find((r) => r.name === n)!.flags.some((f) => f.severity !== "baixa");
    for (const n of ["Amor", "Elo", "Ipê", "Prosa", "Amigo"]) expect(flagged(n), n).toBe(false);
    expect(flagged("Spotify")).toBe(true);
    expect(flagged("CafeHub")).toBe(true);
  });

  it("parses CSV with decimal commas and line breaks in quotes", async () => {
    const { parseCsv } = await import("../../src/extractors/document.js");
    const rows = parseCsv('nota;comentario\n4,5;"Café ótimo, chegou rápido.\nVoltarei"\n');
    expect(rows[1]).toEqual(["4,5", "Café ótimo, chegou rápido.\nVoltarei"]);
  });

  it("counts a page registered twice as one source", () => {
    const batch = { batch: "a", sources: [{ id: "src-1", url: "https://x.com/a", author: "Rory Sutherland", dissected: true }, { id: "src-2", url: "http://www.x.com/a/", author: "Rory Sutherland (Ogilvy), entrevistado por Fulano", dissected: true }], principles: [{ id: "p", title: "P", statement: "S", sources: [{ id: "src-1" }, { id: "src-2" }] }] };
    const c = buildCanon([{ name: "a", data: batch }]);
    expect(c.principles[0]!.sourceCount).toBe(1);
    expect(c.uniqueSources).toBe(1);
  });
});
