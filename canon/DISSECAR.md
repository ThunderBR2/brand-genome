# Instruções para os agentes de dissecação

Você vai dissecar um lote de fontes de branding para o cânone do Brand Genome, um sistema
que ajuda a criar marcas fortes, autênticas e nada genéricas. Leia `canon/SCHEMA.md` (mesma
pasta) antes de começar: ele define o formato exato.

## Objetivo

Transformar fontes reais em conhecimento APLICÁVEL: princípios que mudam decisões, frameworks
com passos, debates entre escolas, cases com lições e antipadrões que denunciam marca genérica.
Um agente que criar uma marca vai ler esses cards para decidir posicionamento, voz, naming etc.
Prefira profundidade a volume: 1 princípio bem fundamentado vale mais que 5 rasos.

## Como trabalhar

1. Para cada fonte do seu lote: abra a URL (WebFetch; se falhar, `curl -sL -A "Mozilla/5.0" URL`
   e, para PDF, salve no seu diretório de trabalho e extraia com `pdftotext`). Leia de verdade.
2. Respeite bloqueios: se o site proíbe robôs ou exige login, não contorne. Registre a fonte
   com `dissected: false` e o motivo em `notes`. Nunca use cópias piratas.
3. Extraia o que tem valor. Para cada fonte, em média 3 a 8 cards (princípios, frameworks,
   antipadrões, cases, termos de léxico, posições de debate). Fontes ricas podem render mais.
4. Escreva tudo em português do Brasil, parafraseado. No máximo uma citação literal por fonte,
   com menos de 15 palavras. Nada de colar parágrafos.
5. Seja honesto com a evidência: números com fonte; opinião é `opiniao-especialista`; resultado
   publicado pela própria agência é `independent: false`.
6. Use os ids sugeridos no fim do SCHEMA quando o conceito for o mesmo, para que fontes
   diferentes corroborem o mesmo princípio. Se dois cards do seu lote são o mesmo conceito,
   funda em um com várias `sources`.
7. Quando uma fonte contradiz outra escola, registre no `debates` (posição da escola dela) e
   em `conflictsWith` do princípio.
8. Grave o arquivo final em `/home/claude/brand-genome/canon/raw/<lote>.json` e valide com
   `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" ARQUIVO`.
   Grave parcialmente ao longo do caminho (a cada ~5 fontes) para não perder trabalho.
9. Não leia nem escreva arquivos de outros lotes.

## Relatório final (sua resposta)

Curto: quantas fontes dissecadas e não dissecadas (e por quê), contagem de cards por tipo,
os 5 princípios mais fortes que você encontrou e qualquer conflito importante.
