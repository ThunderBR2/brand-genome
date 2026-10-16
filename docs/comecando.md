# Começando: da primeira fonte ao brand book

## 1. Instalar

Você precisa do Node.js 22 ou mais novo ([nodejs.org](https://nodejs.org)).

```bash
git clone https://github.com/ThunderBR2/brand-genome
cd brand-genome
npm install
npm run build
npm link
brand doctor
```

Opcional, para ler sites montados por JavaScript:

```bash
npx playwright install chromium
```

Conecte ao Claude Desktop:

```bash
brand mcp-config --install
```

Feche e abra o Claude Desktop. Os projetos ficam em `~/.brand-genome/projects` (mude com `-r`).

## 2. Criar a marca e juntar as fontes

Peça ao Claude, por exemplo:

> Crie um projeto de marca "Grão Alto", setor café especial. Os concorrentes são estes 4 sites: … O briefing está em C:\clientes\grao-alto\briefing.docx e as avaliações dos clientes em avaliacoes.csv.

| Papel | O que colocar | Por que importa |
|---|---|---|
| `cliente` | site atual, briefing, apresentações, transcrição de conversa com o dono | as verdades do negócio e como a marca soa hoje |
| `concorrente` | 3 a 6 sites (cada um com `entity`) | as convenções da categoria e o teste de troca |
| `publico` | avaliações (Google, Reclame Aqui, loja de apps), entrevistas, comentários, pesquisas em CSV | insights com as palavras do público |
| `categoria` | matérias e relatórios do setor | contexto |
| `referencia` | marcas admiradas de outras categorias | inspiração (não entram nas convenções) |
| `pesquisa` | dados e estudos | evidência |

Depois: **"mostre a paisagem da categoria"**. Você vê o que todos os concorrentes repetem, com a frase de cada um, e onde está o espaço livre.

## 3. Percorrer as etapas

Peça: **"vamos fazer o diagnóstico"**, depois **"agora a paisagem"**, e assim por diante. Em cada etapa o Claude:

1. lê o brief da etapa (método, o que já foi decidido, fatos medidos, cânone);
2. pergunta só o que as fontes não respondem;
3. escreve a entrega e envia;
4. corrige o que os portões barrarem;
5. mostra para você aprovar.

Nada é aprovado sem o seu OK.

## 4. Usar a marca

- **"verifique este texto"**: nota e desvios de qualquer post, página ou roteiro.
- **"exporte o brand book em HTML"**: página completa e pronta para apresentar.
- **"exporte o prompt de agente"**: cole em qualquer IA para ela escrever na voz da marca.
- **"exporte o brief de design"** e leve ao Design Genome para criar as peças visuais.

## 5. Crescer o cânone

Achou um artigo, um PDF ou uma transcrição de palestra muito boa? Peça: **"disseque esta fonte para o cânone: <link>"**. O conteúdo vira cards resumidos, ligados à fonte, que se somam aos que já existem.
