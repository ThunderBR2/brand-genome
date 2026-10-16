# Cânone do Brand Genome — formato dos cards

O cânone é o conhecimento destilado das fontes de branding. Cada fonte dissecada vira
**cards** curtos, em português do Brasil, com evidência apontando para a fonte. Nada de
texto copiado: tudo parafraseado. No máximo UMA citação literal por fonte, com menos de 15
palavras, no campo `quote` de um card.

Cada agente de dissecação grava UM arquivo JSON em `canon/raw/<lote>.json` com este formato:

```json
{
  "batch": "<lote>",
  "sources": [ Source, ... ],
  "principles": [ Principle, ... ],
  "frameworks": [ Framework, ... ],
  "debates": [ Debate, ... ],
  "cases": [ Case, ... ],
  "antipatterns": [ Antipattern, ... ],
  "lexicon": [ LexiconEntry, ... ]
}
```

Todos os arrays são obrigatórios (podem ser vazios). Ids são slugs em minúsculas, sem
acento, com hífen: `distinctive-assets-fame-uniqueness`. Use ids estáveis e descritivos:
outros lotes vão citar os mesmos conceitos, e ids iguais se fundem na consolidação (é assim
que um princípio ganha corroboração de várias fontes). Antes de inventar um id, confira a
lista de ids sugeridos no fim deste arquivo.

## Vocabulários fixos

- `domain`: `estrategia`, `posicionamento`, `publico`, `ciencia-crescimento`, `equity-medicao`,
  `arquitetura`, `naming`, `identidade-verbal`, `narrativa-proposito`, `identidade-visual`,
  `ativos-distintivos`, `sonoro-motion`, `experiencia`, `ativacao-eficacia`, `gestao-governanca`,
  `b2b`, `cultura-interna`
- `stage` (etapa do processo de criar uma marca): `diagnostico`, `paisagem`, `publico`,
  `posicionamento`, `plataforma`, `arquitetura`, `naming`, `voz`, `ativos`, `narrativa`, `ativacao`
- `school` (escola de pensamento): `ehrenberg-bass` (ciência de marketing, distintividade, alcance),
  `posicionamento-diferenciacao` (Ries & Trout, Aaker, Keller, Neumeier, Ritson na parte de diferenciação),
  `eficacia` (Binet & Field, IPA, System1), `comportamental` (Sutherland, Shotton, Barden),
  `identidade-design` (Wheeler, Pentagram, Wolff Olins, Olins), `cultural` (Holt, cultural branding),
  `proposito` (Stengel, Sinek, Couto, Troiano), `verbal` (Simmons, Parker, The Writer, guias de voz),
  `naming` (Catchword, Igor, Watkins, Meyerson), `pratica` (estrategistas praticantes), `academica`
  (papers de equity, Fournier etc.), `misto`
- `evidence`: `empirica` (dados, estudos com amostra), `meta-analise`, `caso` (um ou poucos casos),
  `opiniao-especialista`, `framework` (modelo conceitual), `guia-oficial` (guia de uma marca real)
- `access`: `livre`, `cadastro`, `pago`
- `format`: `artigo`, `pdf`, `guia-web`, `video`, `podcast`, `paper`, `relatorio`, `livro-resumo`, `case`
- `polarity` (antipadrões e princípios normativos): `sempre`, `nunca`, `prefira`, `evite`, `fato`

## Source

```json
{
  "id": "src-ebi-how-b2b-brands-grow-2023",
  "title": "How B2B Brands Grow",
  "url": "https://...",
  "author": "Ehrenberg-Bass Institute / LinkedIn B2B Institute",
  "year": 2023,
  "format": "pdf",
  "language": "en",
  "access": "livre",
  "license": "copyright",            // ou "CC BY 4.0", "OGL v3", "dominio-publico"...
  "school": "ehrenberg-bass",
  "evidence": "empirica",
  "sponsored": false,                 // conteúdo patrocinado/publicitário
  "dissected": true,                  // false se não deu para abrir (diga o motivo em notes)
  "summary": "2 a 4 frases, parafraseadas, do que a fonte defende e com que base.",
  "notes": "limitações, o que não foi lido, paywall parcial etc."
}
```
Ids de fonte começam com `src-`.

## Principle (o card mais importante)

Uma ideia aplicável, que muda uma decisão de marca.

```json
{
  "id": "mental-availability-category-entry-points",
  "title": "Construa disponibilidade mental pelos pontos de entrada da categoria",
  "statement": "Uma frase clara, aplicável, em PT-BR.",
  "why": "Por que funciona / qual evidência sustenta (parafraseado, com números quando houver).",
  "how": ["passo concreto 1", "passo concreto 2"],
  "tests": ["Pergunta de verificação que um agente consegue responder sobre uma marca: sim/não"],
  "polarity": "prefira",
  "domain": ["ciencia-crescimento", "publico"],
  "stage": ["publico", "ativacao"],
  "school": "ehrenberg-bass",
  "evidence": "empirica",
  "strength": 3,                       // 1 fraco, 2 médio, 3 forte (pela qualidade da evidência)
  "sources": [{ "id": "src-...", "locator": "p. 12 / seção 'CEPs' / 14:32", "paraphrase": "o que a fonte diz, em uma frase" , "quote": "opcional, < 15 palavras" }],
  "conflictsWith": ["id de outro princípio ou debate"],
  "cases": ["id de case que ilustra"],
  "contexts": "quando vale e quando não vale (B2B, luxo, startup, pequena empresa, Brasil...)"
}
```

## Framework

```json
{
  "id": "kapferer-identity-prism",
  "name": "Prisma de identidade de Kapferer",
  "author": "Jean-Noël Kapferer",
  "purpose": "para que serve",
  "components": [{ "name": "Físico", "description": "..." }],
  "steps": ["como aplicar, passo a passo"],
  "inputs": ["o que precisa saber antes"],
  "outputs": ["o que entrega"],
  "pitfalls": ["como costuma dar errado"],
  "criticisms": ["críticas conhecidas, com a escola que critica"],
  "domain": ["posicionamento"],
  "stage": ["plataforma"],
  "school": "posicionamento-diferenciacao",
  "sources": [{ "id": "src-...", "locator": "...", "paraphrase": "..." }]
}
```

## Debate (conflito entre escolas — o sistema NÃO mistura escolas, ele explicita)

```json
{
  "id": "differentiation-vs-distinctiveness",
  "question": "A marca precisa ser percebida como diferente ou basta ser distinta e lembrada?",
  "positions": [
    { "school": "ehrenberg-bass", "claim": "...", "evidence": "...", "sources": [{ "id": "src-...", "paraphrase": "..." }] },
    { "school": "posicionamento-diferenciacao", "claim": "...", "evidence": "...", "sources": [...] }
  ],
  "synthesis": "onde as escolas concordam",
  "systemStance": "posição padrão do sistema e quando trocar (ex.: categoria nova → diferenciação pesa mais)",
  "stage": ["posicionamento"],
  "domain": ["posicionamento", "ciencia-crescimento"]
}
```

## Case

```json
{
  "id": "case-dropbox-2017-collins",
  "brand": "Dropbox",
  "year": 2017,
  "agency": "COLLINS",
  "sector": "tecnologia",
  "market": "global",
  "type": "rebrand",                   // rebrand | lancamento | reposicionamento | naming | fracasso | arquitetura
  "challenge": "...",
  "insight": "...",
  "strategy": "...",
  "execution": "identidade visual, verbal, ativos",
  "results": [{ "metric": "...", "value": "...", "independent": false, "source": "src-..." }],
  "lessons": ["lição aplicável"],
  "principles": ["ids de princípios que o case ilustra ou contradiz"],
  "sources": [{ "id": "src-...", "paraphrase": "..." }]
}
```
Resultados declarados pela própria agência ou marca: `independent: false`.

## Antipattern (o que deixa uma marca genérica, fraca ou sem graça)

```json
{
  "id": "empty-adjective-values",
  "name": "Valores de adjetivos vazios",
  "description": "...",
  "signals": ["sinal observável no texto ou na estratégia"],
  "whyBad": "...",
  "fix": "...",
  "domain": ["identidade-verbal"],
  "stage": ["plataforma", "voz"],
  "sources": [{ "id": "src-...", "paraphrase": "..." }]
}
```

## LexiconEntry (alimenta o verificador anti-genérico)

```json
{ "term": "soluções inovadoras", "lang": "pt", "kind": "cliche", "category": "geral", "replacement": "diga o que a coisa faz, com um número ou exemplo", "sources": ["src-..."] }
```
`kind`: `cliche` (frase batida), `jargao` (jargão corporativo), `adjetivo-vazio`, `promessa-vaga`,
`categoria` (convenção de uma categoria: use `category` = setor, ex. `banco`, `beleza`, `tech`),
`proposito-generico`. Termos em minúsculas.

## Ids sugeridos (use quando o conceito for o mesmo)

Princípios: `mental-availability`, `physical-availability`, `category-entry-points`,
`distinctive-assets-fame-uniqueness`, `consistency-over-time`, `reach-over-targeting`,
`double-jeopardy`, `brand-salience`, `long-short-60-40`, `emotional-over-rational`,
`share-of-voice-excess`, `fame-effects`, `creative-effectiveness-dull-cost`, `95-5-rule-b2b`,
`relative-differentiation`, `onliness-statement`, `frame-of-reference`, `points-of-parity-difference`,
`sacrifice-focus`, `own-a-word`, `tension-insight`, `reasons-to-believe`, `brand-as-behaviour`,
`values-as-behaviours`, `voice-traits-with-dos-donts`, `same-voice-different-tone`,
`plain-language`, `specificity-over-adjectives`, `naming-criteria-scoring`, `naming-trademark-screening`,
`naming-linguistic-check`, `brand-architecture-spectrum`, `purpose-must-be-operational`,
`purpose-skepticism`, `codes-of-category-break-or-follow`, `brand-promise-delivery`,
`messaging-hierarchy`, `story-protagonist-customer`, `sonic-identity-consistency`,
`motion-principles-from-brand`, `rebrand-keep-equity`, `rebrand-test-before-launch`,
`internal-adoption`, `b2b-brand-matters`, `pricing-power-brand`.

Debates: `differentiation-vs-distinctiveness`, `targeting-vs-mass-reach`, `purpose-value`,
`loyalty-vs-penetration`, `brand-is-not-logo`, `funnel-metrics-validity`, `long-vs-short-term`,
`laws-vs-heuristics`, `storybrand-formula-value`, `archetypes-value`, `rebrand-vs-evolve`.
