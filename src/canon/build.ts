import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fold } from "../core/text.js";
import {
  antipatternSchema,
  batchSchema,
  canonSourceSchema,
  caseSchema,
  debateSchema,
  EVIDENCE_WEIGHT,
  frameworkSchema,
  lexiconSchema,
  principleSchema,
  type Antipattern,
  type Canon,
  type CanonSource,
  type Case,
  type Debate,
  type Framework,
  type LexiconEntry,
  type Principle,
  type SourceRef,
  type Support,
} from "./types.js";

/** The canon shipped with the app (canon/raw) plus what the user dissected (~/.brand-genome/canon). */
export const appCanonDir = (): string => resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "canon");
export const userHome = (): string => process.env.BRAND_GENOME_HOME ?? join(homedir(), ".brand-genome");
export const userCanonDir = (): string => join(userHome(), "canon");

const uniq = (items: readonly string[], cap = 40): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const t = i.trim();
    const k = fold(t).replace(/[^a-z0-9]+/g, " ").trim();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
};

const mergeRefs = (a: readonly SourceRef[], b: readonly SourceRef[]): SourceRef[] => {
  const out = new Map<string, SourceRef>();
  for (const r of [...a, ...b]) {
    const prev = out.get(r.id);
    out.set(r.id, prev ? { ...r, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v)) } as SourceRef : r);
  }
  return [...out.values()];
};

const longer = (a: string, b: string): string => (b.length > a.length ? b : a);

const normId = (id: string): string => fold(id).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

interface RawBatch { name: string; data: unknown }

export const readBatches = async (dirs: readonly string[]): Promise<RawBatch[]> => {
  const out: RawBatch[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json")).sort()) {
      try {
        out.push({ name: `${basename(dir) === "raw" ? "" : "usuario:"}${f.replace(/\.json$/, "")}`, data: JSON.parse(await readFile(join(dir, f), "utf8")) });
      } catch (e) {
        out.push({ name: f, data: { __error: e instanceof Error ? e.message : String(e) } });
      }
    }
  }
  return out;
};

/**
 * Merge batches into one canon. Cards with the same id are the same idea seen
 * by different sources: their evidence is pooled, and a principle backed by
 * two or more independent sources becomes "consolidado".
 */
export const buildCanon = (batches: readonly RawBatch[]): Canon => {
  const warnings: string[] = [];
  const sources = new Map<string, CanonSource>();
  const principles = new Map<string, Principle & { batches: string[] }>();
  const frameworks = new Map<string, Framework & { batches: string[] }>();
  const debates = new Map<string, Debate & { batches: string[] }>();
  const cases = new Map<string, Case & { batches: string[] }>();
  const antipatterns = new Map<string, Antipattern & { batches: string[] }>();
  const lexicon = new Map<string, LexiconEntry>();

  for (const { name, data } of batches) {
    if (data && typeof data === "object" && "__error" in data) {
      warnings.push(`${name}: JSON inválido (${String((data as { __error: unknown }).__error)})`);
      continue;
    }
    const parsed = batchSchema.safeParse(data);
    if (!parsed.success) {
      warnings.push(`${name}: formato de lote inválido`);
      continue;
    }
    const b = parsed.data;
    const each = <T extends { id: string }>(items: unknown[], schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, kind: string, fn: (item: T) => void): void => {
      items.forEach((raw, i) => {
        const r = schema.safeParse(raw);
        if (!r.success || !r.data.id) {
          warnings.push(`${name}: ${kind} #${i + 1} ignorado (formato inválido)`);
          return;
        }
        fn({ ...r.data, id: kind === "source" ? r.data.id : normId(r.data.id) });
      });
    };
    each(b.sources, canonSourceSchema, "source", (s) => {
      const prev = sources.get(s.id);
      sources.set(s.id, prev ? { ...prev, summary: longer(prev.summary, s.summary), notes: longer(prev.notes, s.notes), dissected: prev.dissected || s.dissected } : s);
    });
    each(b.principles, principleSchema, "principle", (p) => {
      const prev = principles.get(p.id);
      if (!prev) {
        principles.set(p.id, { ...p, batches: [name] });
        return;
      }
      const lead = p.strength > prev.strength || (p.strength === prev.strength && p.sources.length > prev.sources.length) ? p : prev;
      principles.set(p.id, {
        ...lead,
        why: longer(prev.why, p.why),
        how: uniq([...lead.how, ...prev.how, ...p.how], 10),
        tests: uniq([...lead.tests, ...prev.tests, ...p.tests], 10),
        domain: [...new Set([...prev.domain, ...p.domain])],
        stage: [...new Set([...prev.stage, ...p.stage])],
        school: prev.school === p.school ? p.school : lead.school,
        evidence: EVIDENCE_WEIGHT[p.evidence] > EVIDENCE_WEIGHT[prev.evidence] ? p.evidence : prev.evidence,
        strength: Math.max(prev.strength, p.strength),
        sources: mergeRefs(prev.sources, p.sources),
        conflictsWith: uniq([...prev.conflictsWith, ...p.conflictsWith].map(normId)),
        cases: uniq([...prev.cases, ...p.cases].map(normId)),
        contexts: [prev.contexts, p.contexts].filter(Boolean).join(" ").trim(),
        batches: [...new Set([...prev.batches, name])],
      });
    });
    each(b.frameworks, frameworkSchema, "framework", (f) => {
      const prev = frameworks.get(f.id);
      if (!prev) {
        frameworks.set(f.id, { ...f, batches: [name] });
        return;
      }
      const lead = f.steps.length + f.components.length > prev.steps.length + prev.components.length ? f : prev;
      const comps = new Map<string, { name: string; description: string }>();
      for (const c of [...lead.components, ...prev.components, ...f.components]) if (!comps.has(fold(c.name))) comps.set(fold(c.name), c);
      frameworks.set(f.id, {
        ...lead,
        purpose: longer(prev.purpose, f.purpose),
        components: [...comps.values()],
        pitfalls: uniq([...prev.pitfalls, ...f.pitfalls], 12),
        criticisms: uniq([...prev.criticisms, ...f.criticisms], 12),
        inputs: uniq([...prev.inputs, ...f.inputs], 12),
        outputs: uniq([...prev.outputs, ...f.outputs], 12),
        domain: [...new Set([...prev.domain, ...f.domain])],
        stage: [...new Set([...prev.stage, ...f.stage])],
        sources: mergeRefs(prev.sources, f.sources),
        batches: [...new Set([...prev.batches, name])],
      });
    });
    each(b.debates, debateSchema, "debate", (d) => {
      const prev = debates.get(d.id);
      if (!prev) {
        debates.set(d.id, { ...d, batches: [name] });
        return;
      }
      const positions = [...prev.positions];
      for (const pos of d.positions) {
        const same = positions.findIndex((x) => x.school === pos.school);
        if (same >= 0) {
          const cur = positions[same]!;
          positions[same] = { ...cur, claim: longer(cur.claim, pos.claim), evidence: [cur.evidence, pos.evidence].filter(Boolean).join(" ").trim(), sources: mergeRefs(cur.sources, pos.sources) };
        } else positions.push(pos);
      }
      debates.set(d.id, {
        ...prev,
        question: longer(prev.question, d.question),
        positions,
        synthesis: longer(prev.synthesis, d.synthesis),
        systemStance: longer(prev.systemStance, d.systemStance),
        stage: [...new Set([...prev.stage, ...d.stage])],
        domain: [...new Set([...prev.domain, ...d.domain])],
        batches: [...new Set([...prev.batches, name])],
      });
    });
    each(b.cases, caseSchema, "case", (c) => {
      const prev = cases.get(c.id);
      if (!prev) {
        cases.set(c.id, { ...c, batches: [name] });
        return;
      }
      cases.set(c.id, {
        ...prev,
        challenge: longer(prev.challenge, c.challenge),
        insight: longer(prev.insight, c.insight),
        strategy: longer(prev.strategy, c.strategy),
        execution: longer(prev.execution, c.execution),
        results: [...prev.results, ...c.results.filter((r) => !prev.results.some((x) => fold(x.metric) === fold(r.metric)))],
        lessons: uniq([...prev.lessons, ...c.lessons], 12),
        principles: uniq([...prev.principles, ...c.principles].map(normId)),
        sources: mergeRefs(prev.sources, c.sources),
        batches: [...new Set([...prev.batches, name])],
      });
    });
    each(b.antipatterns, antipatternSchema, "antipattern", (a) => {
      const prev = antipatterns.get(a.id);
      antipatterns.set(a.id, prev
        ? { ...prev, description: longer(prev.description, a.description), signals: uniq([...prev.signals, ...a.signals], 20), whyBad: longer(prev.whyBad, a.whyBad), fix: longer(prev.fix, a.fix), domain: [...new Set([...prev.domain, ...a.domain])], stage: [...new Set([...prev.stage, ...a.stage])], sources: mergeRefs(prev.sources, a.sources), batches: [...new Set([...prev.batches, name])] }
        : { ...a, batches: [name] });
    });
    b.lexicon.forEach((raw, i) => {
      const r = lexiconSchema.safeParse(raw);
      if (!r.success) {
        warnings.push(`${name}: termo de léxico #${i + 1} ignorado`);
        return;
      }
      const e = r.data;
      if (e.term.split(/\s+/).length > 8) return;
      const key = `${e.lang}:${fold(e.term)}:${e.kind === "categoria" ? fold(e.category) : ""}`;
      const prev = lexicon.get(key);
      lexicon.set(key, prev ? { ...prev, replacement: prev.replacement || e.replacement, sources: [...new Set([...prev.sources, ...e.sources])] } : e);
    });
  }

  const debateIds = new Set(debates.keys());
  // A principle is "in debate" when it names a conflicting card or debate, or another principle names it.
  const debated = new Map<string, Set<string>>();
  const mark = (id: string, by: string): void => {
    const set = debated.get(id) ?? new Set<string>();
    set.add(by);
    debated.set(id, set);
  };
  for (const p of principles.values()) for (const c of p.conflictsWith) {
    mark(p.id, c);
    if (principles.has(c)) mark(c, p.id);
  }
  // The same page registered under several ids counts once; unread sources don't count.
  const normUrl = (u: string): string => u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const canonicalId = new Map<string, string>();
  const byUrl = new Map<string, string>();
  for (const src of sources.values()) {
    const key = src.url ? normUrl(src.url) : `id:${src.id}`;
    const first = byUrl.get(key);
    if (first) canonicalId.set(src.id, first);
    else {
      byUrl.set(key, src.id);
      canonicalId.set(src.id, src.id);
    }
  }
  const normAuthor = (a: string): string =>
    fold(a)
      .replace(/\([^)]*\)/g, " ")
      .split(/,|;|\/|&| e | and | entrevistad[oa] | interviewed | via | com | with /)[0]!
      .replace(/[^a-z\s-]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(" ");
  const independent = (refs: readonly SourceRef[]): number => {
    const ids = new Set<string>();
    const authors = new Set<string>();
    for (const r of refs) {
      const id = canonicalId.get(r.id) ?? r.id;
      const src = sources.get(id);
      if (src && !src.dissected) continue;
      ids.add(id);
      authors.add(src?.author ? normAuthor(src.author) || id : id);
    }
    return Math.min(ids.size, authors.size);
  };
  // Cases about the same brand and year are one case seen by several sources.
  const caseKey = new Map<string, string>();
  for (const c of [...cases.values()]) {
    if (!c.year) continue;
    const key = `${fold(c.brand).split(/[^a-z0-9]+/).filter(Boolean)[0] ?? c.id}:${c.year}`;
    const first = caseKey.get(key);
    if (!first) {
      caseKey.set(key, c.id);
      continue;
    }
    const prev = cases.get(first)!;
    cases.set(first, {
      ...prev,
      challenge: longer(prev.challenge, c.challenge),
      insight: longer(prev.insight, c.insight),
      strategy: longer(prev.strategy, c.strategy),
      execution: longer(prev.execution, c.execution),
      results: [...prev.results, ...c.results.filter((r) => !prev.results.some((x) => fold(x.metric) === fold(r.metric)))],
      lessons: uniq([...prev.lessons, ...c.lessons], 14),
      principles: uniq([...prev.principles, ...c.principles]),
      sources: mergeRefs(prev.sources, c.sources),
      batches: [...new Set([...prev.batches, ...c.batches])],
    });
    cases.delete(c.id);
    for (const p of principles.values()) if (p.cases.includes(c.id)) p.cases = uniq(p.cases.map((x) => (x === c.id ? first : x)));
  }
  const finalPrinciples = [...principles.values()].map((p) => {
    const n = independent(p.sources);
    const support: Support = n >= 2 ? "consolidado" : "fonte-unica";
    const debatedIn = [...(debated.get(p.id) ?? [])].filter((d) => debateIds.has(d) || principles.has(d));
    return { ...p, support, sourceCount: n, debatedIn };
  });
  // References to sources nobody registered.
  const known = new Set(sources.keys());
  const missing = new Set<string>();
  for (const p of finalPrinciples) for (const r of p.sources) if (!known.has(r.id)) missing.add(r.id);
  if (missing.size) warnings.push(`${missing.size} fonte(s) citada(s) sem registro: ${[...missing].slice(0, 8).join(", ")}${missing.size > 8 ? "…" : ""}`);

  return {
    builtAt: new Date().toISOString(),
    batches: batches.map((b) => b.name),
    uniqueSources: byUrl.size,
    dissectedSources: [...byUrl.values()].filter((id) => sources.get(id)?.dissected).length,
    sources: [...sources.values()],
    principles: finalPrinciples.sort((a, b) => b.strength * (1 + b.sourceCount) - a.strength * (1 + a.sourceCount)),
    frameworks: [...frameworks.values()],
    debates: [...debates.values()],
    cases: [...cases.values()],
    antipatterns: [...antipatterns.values()],
    lexicon: [...lexicon.values()],
    warnings,
  };
};

let cached: { key: string; canon: Canon } | null = null;

/** Load the canon (app + user dissections). Cached per process. */
export const loadCanon = async (): Promise<Canon> => {
  const dirs = [join(appCanonDir(), "raw"), userCanonDir()];
  const stamp: string[] = [];
  for (const d of dirs) if (existsSync(d)) stamp.push(...(await readdir(d)).map((f) => `${d}/${f}`));
  const key = stamp.join("|");
  if (cached?.key === key) return cached.canon;
  const canon = buildCanon(await readBatches(dirs));
  cached = { key, canon };
  return canon;
};

/** Write the compiled canon next to the raw batches (for distribution and inspection). */
export const writeCompiledCanon = async (canon: Canon, dir = appCanonDir()): Promise<string> => {
  await mkdir(dir, { recursive: true });
  const file = join(dir, "canon.json");
  await writeFile(file, JSON.stringify(canon, null, 1));
  return file;
};
