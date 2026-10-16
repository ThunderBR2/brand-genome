# Arquitetura

## Princípios

1. **Evidência antes de opinião.** Fatos sobre a marca apontam para uma fonte (trecho e localizador). Fatos medidos (convenções, voz, similaridade) são calculados, não julgados.
2. **Precisão explícita.** `measured` (calculado do texto), `declared` (o cliente afirmou), `observed` (o público disse ou o concorrente mostra), `inferred` (julgamento do modelo).
3. **Desconhecido não é ausência.** Sem fontes do público, insight é hipótese. Sem busca no INPI, o nome é candidato. O brief lista o que não se sabe e diz para não inventar.
4. **Cada fonte vota uma vez.** No cânone, um princípio só fica "consolidado" com duas ou mais fontes independentes: páginas diferentes (a mesma URL registrada duas vezes conta uma), autores diferentes (nome normalizado, sem cargo nem "entrevistado por") e só fontes que foram de fato lidas.
5. **Escolas não se misturam em silêncio.** Debates registram as posições de cada escola e a posição padrão do sistema. Princípios em debate são marcados.
6. **O mesmo instrumento mede a referência e o resultado.** O verificador usa o mesmo léxico, as mesmas convenções e os mesmos vetores de vocabulário que construíram a paisagem.

## O cânone

`canon/raw/*.json` são lotes escritos por agentes de dissecação no formato de `canon/SCHEMA.md`. A consolidação (`src/canon/build.ts`):

- valida cada card com tolerância (campos ausentes viram vazios; cards inválidos viram avisos);
- funde cards de mesmo id: une fontes, passos, testes, etapas; mantém a maior força e a melhor evidência;
- conta fontes independentes por autor e marca `consolidado` ou `fonte-unica`;
- liga princípios a debates (`debatedIn`);
- junta o léxico por idioma, termo e categoria.

Lotes do usuário ficam em `~/.brand-genome/canon/` e entram na mesma fusão.

## Projeto em disco

```
<projeto>/
  brand.project.json        nome, marca, setor, mercado, fontes
  sources/                  cópias locais (arquivos e notas)
  extractions/<id>.json     trechos com localizador
  landscape.json            paisagem medida
  stages/<etapa>.json       entrega, portões, status, versão
  stages/history/           versões anteriores
  decisions.json            decisões de conflitos
  exports/                  brand book, brief, voz, prompt, design brief
```

## Análises

- **Texto** (`core/text.ts`): normalização sem acentos com offsets preservados, radicais leves PT/EN, termos por frase (palavras e pares vizinhos, nunca atravessando frases), formas escritas para exibição, TF-IDF e cosseno.
- **Voz** (`analysis/voice.ts`): tamanho de frase, pessoa (nós/você/terceira), marcadores formais e informais, exclamação, emoji, números e formalidade de 1 a 5.
- **Paisagem** (`analysis/landscape.ts`): perfil de cada marca (voz, abertura, palavras só dela, clichês), convenções presentes na maioria dos concorrentes com evidência, voz média da categoria, vocabulário do público (o que ninguém usa) e espaços livres.
- **Verificador** (`analysis/generic.ts`): cinco facetas com pesos (genérico 0,3; convenções 0,2; troca 0,2; especificidade 0,1; voz 0,2) e desvios com trecho e correção.
- **Nomes** (`analysis/names.ts`): tamanho, sílabas, clichês de naming, palavras descritivas da categoria, semelhança com concorrentes (Levenshtein + prefixo) e verificações manuais.

## Etapas

`stages/schemas.ts` define a entrega de cada etapa (zod). `stages/info.ts` traz objetivo, método, perguntas e foco no cânone. `stages/gates.ts` tem os portões: `bloqueia` (a etapa fica reprovada), `alerta` e `dica`. A aprovação exige o OK do usuário; aprovar com um portão bloqueando exige `force` e uma nota.

## MCP

`src/mcp.ts` declara as ferramentas. Cada chamada roda `cli.js worker` num processo novo, então uma atualização (`brand_update`) vale na hora, sem reiniciar o Claude.
