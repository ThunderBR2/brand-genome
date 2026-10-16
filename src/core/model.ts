import { z } from "zod";

/**
 * The evidence model of a brand project. Every fact the system uses about the
 * brand points back to a source (a briefing, an interview, a competitor's
 * page, a customer review) or is marked as inferred by the model.
 */

export const SOURCE_KINDS = ["web", "document", "note"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * What a source is to the brand. Roles decide how the analysis uses it:
 * competitors define the category conventions, the audience's own words feed
 * insight, the client's material is the brand as it is declared today.
 */
export const SOURCE_ROLES = ["cliente", "concorrente", "publico", "categoria", "referencia", "pesquisa"] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

export const ROLE_LABEL: Record<SourceRole, string> = {
  cliente: "material da própria marca",
  concorrente: "concorrente",
  publico: "voz do público (entrevistas, avaliações, comentários)",
  categoria: "contexto da categoria",
  referencia: "marca de referência (admirada, de outra categoria)",
  pesquisa: "pesquisa e dados",
};

export const sourceSchema = z.object({
  id: z.string(),
  kind: z.enum(SOURCE_KINDS),
  role: z.enum(SOURCE_ROLES),
  uri: z.string(),
  label: z.string(),
  /** For competitors and references: the brand the source speaks for. */
  entity: z.string().optional(),
  addedAt: z.string(),
  sha256: z.string().optional(),
  local: z.string().optional(),
  options: z.record(z.unknown()).default({}),
});
export type Source = z.infer<typeof sourceSchema>;

/**
 * Precision of a fact, from strongest to weakest:
 * measured  - computed from the sources' text (term counts, sentence length…)
 * declared  - stated by the client, a briefing or a document
 * observed  - said by the audience or seen in a competitor's material
 * inferred  - a judgement by the model (always citing what it read)
 */
export const PRECISIONS = ["measured", "declared", "observed", "inferred"] as const;
export type Precision = (typeof PRECISIONS)[number];

export const segmentSchema = z.object({
  id: z.string(),
  kind: z.enum(["title", "meta", "heading", "paragraph", "list", "cta", "quote"]),
  text: z.string(),
  /** Where it was read: a URL, a page of a PDF, a paragraph number. */
  locator: z.string(),
});
export type Segment = z.infer<typeof segmentSchema>;

export const extractionSchema = z.object({
  sourceId: z.string(),
  extractedAt: z.string(),
  title: z.string(),
  lang: z.enum(["pt", "en"]),
  pages: z.array(z.string()),
  segments: z.array(segmentSchema),
  wordCount: z.number(),
  limitations: z.array(z.string()),
});
export type Extraction = z.infer<typeof extractionSchema>;

export interface EvidenceRef {
  readonly sourceId: string;
  readonly locator: string;
  readonly excerpt: string;
}

export const STAGES = [
  "diagnostico",
  "paisagem",
  "publico",
  "posicionamento",
  "plataforma",
  "arquitetura",
  "naming",
  "voz",
  "ativos",
  "narrativa",
  "ativacao",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_STATUS = ["vazia", "rascunho", "reprovada", "aprovada"] as const;
export type StageStatus = (typeof STAGE_STATUS)[number];

export interface GateResult {
  readonly id: string;
  readonly title: string;
  readonly severity: "bloqueia" | "alerta" | "dica";
  readonly pass: boolean;
  readonly detail: string;
  readonly fix?: string;
  readonly evidence?: readonly EvidenceRef[];
}

export interface SelfCheck {
  readonly test: string;
  readonly pass: boolean;
  readonly note?: string;
}

export interface StageRecord {
  readonly stage: Stage;
  readonly version: number;
  readonly status: StageStatus;
  readonly submittedAt: string;
  readonly output: Record<string, unknown>;
  readonly gates: readonly GateResult[];
  readonly selfChecks: readonly SelfCheck[];
  readonly approvedAt?: string;
  readonly approvalNote?: string;
}

export interface Conflict {
  readonly id: string;
  readonly kind: "declarado-vs-observado" | "diferencial-na-categoria" | "debate-de-escolas" | "etapas-incoerentes";
  readonly title: string;
  readonly sides: readonly { readonly label: string; readonly detail: string; readonly evidence?: readonly EvidenceRef[] }[];
  readonly canonRef?: string;
  readonly stage?: Stage;
}

export interface Decision {
  readonly conflictId: string;
  readonly choice: string;
  readonly note?: string;
  readonly decidedAt: string;
}
