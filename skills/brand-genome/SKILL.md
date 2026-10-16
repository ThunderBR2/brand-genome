---
name: brand-genome
description: Build or rebuild a brand with evidence (strategy, positioning, platform, naming, tone of voice, distinctive assets, narrative, activation) and check any brand text for generic language. Use when the user wants to create a brand, reposition or rebrand one, define tone of voice or messaging, name something, or write as a brand that has a Brand Genome project. Requires the brand-genome MCP server.
---

# Brand Genome

The goal is a brand that is specific, ownable and ready for the market: never
generic, weak or bland. The system gives you three things and you bring the
judgement.

1. **The canon**: principles, frameworks, debates, cases and antipatterns
   distilled from hundreds of branding sources, each with its evidence.
2. **The measured category**: what competitors actually say (conventions),
   how they sound, what the audience says in its own words, where the white
   space is.
3. **Gates**: every stage you submit is checked; a differentiator that a
   competitor already claims, a manifesto full of clichés or a positioning
   without sacrifice is blocked with the evidence.

## Start

1. `brand_projects` (create one with name and sector) and `brand_status`.
2. Feed it with `brand_add_sources`: the brand's own site and documents
   (role `cliente`), 3 to 6 competitor sites (role `concorrente`, `entity` =
   name), the audience's own words (role `publico`: reviews, interview
   transcripts, comments, survey CSVs), category context and admired brands.
   Links, PDF, DOCX, MD, TXT, CSV, SRT and folders work. Put what the user
   tells you in the chat in with `brand_add_note`.
3. `brand_landscape`: read the conventions and the audience language before
   any strategy.

## The eleven stages

`diagnostico → paisagem → publico → posicionamento → plataforma →
arquitetura (optional) → naming (optional) → voz → ativos → narrativa →
ativacao`

For each stage:

1. `brand_stage_request` — method, decisions so far, measured facts, the
   canon cards ranked by evidence, questions, output format.
2. Ask the user only what the sources don't answer. Mark hypotheses as such.
3. Think like the best strategist in the category: start from business
   truths (facts, numbers, names), use the audience's words, choose what to
   sacrifice, break the conventions that are only habit.
4. `brand_stage_submit`. Fix every blocking gate and resubmit. Read the
   alerts; fix what is fixable.
5. Show the result to the user. `brand_stage_approve` only after they agree.

## Discipline against the generic

- A claim is only a differentiator if no competitor already makes it. The
  gates check competitor text; trust them.
- If nobody would defend the opposite of a statement, it says nothing.
- Values are behaviours, voice traits have "is / is not" and examples,
  purpose needs operational proof or stays out.
- Every public text goes through `brand_verify` before you show it. Do not
  deliver below 70 or with high-severity deviations.
- Prefer numbers, names, places, dates and processes over adjectives.

## Schools disagree

The canon marks debates (differentiation vs distinctiveness, purpose, reach
vs targeting, rebrand vs evolve…). Don't blend schools silently: follow the
debate's system stance, say which school a recommendation comes from, and
ask the user when the choice matters. Conflicts in the project
(`brand_conflicts`) are decided by the user (`brand_resolve_conflict`).

## Writing as the brand

Read `brand_brief`, write, run `brand_verify`, fix, repeat. For long work,
export `agent-prompt` and use it as the system prompt.

## Visual identity

Export `design-brief`. Use the Design Genome to learn references
(`genome_add_sources`), plan pieces (`genome_blueprint`) and verify them
(`genome_verify`).

## Growing the canon

When the user brings a valuable branding source: `brand_canon_dissect_request`
(the text in parts), dissect it into cards, `brand_canon_dissect_submit`.
Paraphrase; at most one quote under 15 words per source; reuse existing ids
(`brand_canon_search`) so evidence accumulates.
