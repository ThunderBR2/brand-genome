import { STAGES, type Conflict, type Decision } from "../core/model.js";
import type { BrandState, Unknown } from "../service.js";
import { STAGE_INFO } from "../stages/info.js";
import type { StageOutput } from "../stages/schemas.js";

/** A single-file, printable brand book page. No scripts; the only external request is the Google Fonts stylesheet (system fonts are the fallback offline). */

const esc = (s: unknown): string => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LABEL: Record<string, string> = {
  negocio: "Negócio", situacao: "Situação", ambicao: "Ambição", problemaDeMarca: "Problema de marca", verdadesDoNegocio: "Verdades do negócio",
  ativosExistentes: "Ativos existentes", restricoes: "Restrições", metricasDeSucesso: "Métricas de sucesso", lacunas: "Lacunas", alternativas: "Alternativas do público",
  espacosLivres: "Espaços livres", barreiras: "Barreiras", pontosDeParidade: "Pontos de paridade", razoesParaAcreditar: "Razões para acreditar",
  sacrificio: "Do que abrimos mão", crencas: "Crenças", regras: "Regras", regrasDeConsistencia: "Regras de consistência", primeiros90dias: "Primeiros 90 dias",
  mantidos: "Ativos mantidos",
};

/** Human labels for enum values stored in the stages. */
const VAL: Record<string, string> = {
  "marca-nova": "Marca nova", reposicionamento: "Reposicionamento", rebrand: "Rebrand", evolucao: "Evolução",
  alta: "alta", media: "média", baixa: "baixa", desconhecida: "desconhecida", sim: "sim", nao: "não", avaliar: "avaliar",
  nos: "nós", voce: "você", eu: "eu", terceira: "terceira pessoa", misto: "misto", nunca: "nunca", raro: "raro", livre: "livre",
  disputado: "disputado", dominado: "dominado", seguir: "seguir", quebrar: "quebrar", curto: "curto prazo", longo: "longo prazo",
  "nao-feito": "não feito", "sem-conflito-aparente": "sem conflito aparente", conflito: "conflito", "em-analise": "em análise", ocupado: "ocupado", alternativa: "alternativa", ok: "ok", problema: "problema",
  "marca-unica": "Marca única", "branded-house": "Branded house", submarcas: "Submarcas", endossada: "Endossada", "house-of-brands": "House of brands", hibrido: "Híbrido",
  simbolo: "símbolo", padrao: "padrão", embalagem: "embalagem", metafora: "metáfora", acronimo: "acrônimo",
};
const lab = (x: unknown): string => esc(VAL[String(x)] ?? x);

const list = (items: readonly string[]): string => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
const field = (k: string, v: string): string => `<div class="field"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;
const card = (title: string, body: string, tag = ""): string => `<article class="card">${tag ? `<span class="tag">${esc(tag)}</span>` : ""}<h4>${esc(title)}</h4>${body}</article>`;
const grid = (cards: string[]): string => (cards.length ? `<div class="grid">${cards.join("")}</div>` : "");
const lists = (o: Record<string, unknown>, keys: string[]): string =>
  keys.filter((k) => Array.isArray(o[k]) && (o[k] as unknown[]).length && typeof (o[k] as unknown[])[0] === "string").map((k) => `<h3>${esc(LABEL[k] ?? k)}</h3>${list(o[k] as string[])}`).join("");

const section = (n: number, id: string, title: string, status: string, body: string): string =>
  `<section id="${id}"><header class="sh"><span class="num">${String(n).padStart(2, "0")}</span><div class="sh-row"><h2>${esc(title)}</h2><span class="status s-${esc(status)}">${esc(status)}</span></div></header>${body}</section>`;

const stageBody = (s: BrandState, st: (typeof STAGES)[number]): string => {
  const o = s.stages[st]!.output as Record<string, unknown>;
  switch (st) {
    case "diagnostico": {
      const d = o as StageOutput<"diagnostico">;
      return `<div class="fields">${field("Negócio", d.negocio)}${field("Situação", VAL[d.situacao] ?? d.situacao)}${field("Ambição", d.ambicao)}${field("Problema de marca", d.problemaDeMarca)}</div>${lists(o, ["verdadesDoNegocio", "metricasDeSucesso", "restricoes", "lacunas"])}${d.ativosExistentes.length ? `<h3>Ativos existentes</h3>${grid(d.ativosExistentes.map((a) => card(a.ativo, `<p>Equity ${lab(a.equity)} · manter: ${lab(a.manter)}</p>${a.evidencia ? `<p class="muted">${esc(a.evidencia)}</p>` : ""}`)))}` : ""}`;
    }
    case "paisagem": {
      const p = o as StageOutput<"paisagem">;
      return `<div class="fields">${field("Categoria", p.categoria.nome)}${field("Quadro de referência", p.categoria.quadroDeReferencia)}${p.categoria.comoOPublicoDescreve ? field("Como o público descreve", p.categoria.comoOPublicoDescreve) : ""}</div><h3>Concorrentes</h3>${grid(p.concorrentes.map((c) => card(c.nome, `<p>${esc(c.promessa)}</p>${c.forca ? `<p><b>Força:</b> ${esc(c.forca)}</p>` : ""}${c.fraqueza ? `<p><b>Fraqueza:</b> ${esc(c.fraqueza)}</p>` : ""}`)))}<h3>Convenções</h3><div class="conv">${p.convencoes.map((c) => `<div class="row"><span class="pill ${c.decisao === "quebrar" ? "break" : "follow"}">${lab(c.decisao)}</span><div><b>${esc(c.convencao)}</b> <span class="muted">(${esc(c.tipo)})</span><br>${esc(c.porque)}</div></div>`).join("")}</div>${lists(o, ["alternativas", "espacosLivres"])}`;
    }
    case "publico": {
      const p = o as StageOutput<"publico">;
      return `<div class="fields">${field("Quem", p.primario.quem)}${field("Contexto", p.primario.contexto)}</div><h3>Tarefas e tensões</h3><div class="two">${list(p.primario.tarefas)}${list(p.primario.tensoes)}</div><h3>Nas palavras do público</h3><p class="quotes">${p.primario.palavras.map((w) => `<q>${esc(w)}</q>`).join(" ")}</p><h3>Insights</h3>${grid(p.insights.map((i) => card(i.insight, `<p><b>Evidência:</b> ${esc(i.evidencia)}</p><p><b>Implicação:</b> ${esc(i.implicacao)}</p>`)))}<h3>Pontos de entrada da categoria</h3>${grid(p.pontosDeEntrada.map((c) => card(c.cep, `<p>${esc(c.situacao)}</p>${c.porqueImporta ? `<p class="muted">${esc(c.porqueImporta)}</p>` : ""}`, VAL[c.disputa] ?? c.disputa)))}${lists(o, ["barreiras"])}`;
    }
    case "posicionamento": {
      const p = o as StageOutput<"posicionamento">;
      return `<blockquote class="hero">${esc(p.onliness)}</blockquote><p class="lead">${esc(p.declaracao)}</p><div class="fields">${field("Quadro de referência", p.quadroDeReferencia)}${field("Alvo", p.alvo)}${field("O oposto que outro defenderia", p.opostoPlausivel)}${p.inimigo ? field("Inimigo", p.inimigo) : ""}${p.palavraParaPossuir ? field("Palavra para possuir", p.palavraParaPossuir) : ""}</div><h3>Diferenciais</h3>${grid(p.pontosDeDiferenca.map((d) => card(d.diferencial, `<p><b>Prova:</b> ${esc(d.prova)}</p><p><b>Relevância:</b> ${esc(d.relevancia)}</p><p><b>Difícil de copiar:</b> ${esc(d.sustentabilidade)}</p>`)))}${lists(o, ["pontosDeParidade", "razoesParaAcreditar", "sacrificio"])}`;
    }
    case "plataforma": {
      const p = o as StageOutput<"plataforma">;
      return `<blockquote class="hero">${esc(p.ideiaDeMarca)}</blockquote><div class="fields">${field("Promessa", p.promessa)}${p.visao ? field("Visão", p.visao) : ""}${p.proposito ? field("Propósito", p.proposito.frase) : ""}</div>${p.proposito?.provasOperacionais.length ? `<h3>Provas do propósito</h3>${list(p.proposito.provasOperacionais)}` : ""}${lists(o, ["crencas"])}<h3>Valores</h3>${grid(p.valores.map((v) => card(v.valor, `<p>${esc(v.comportamento)}</p><p class="muted">${esc(v.exemploDeDecisao)}</p>`)))}<h3>Personalidade</h3>${grid(p.personalidade.map((t) => card(t.traco, `<p><b>É</b> ${esc(t.e)}</p><p><b>Não é</b> ${esc(t.naoE)}</p>`)))}<h3>Pilares</h3>${grid(p.pilares.map((x) => card(x.pilar, `<p>${esc(x.prova)}</p>`)))}`;
    }
    case "arquitetura": {
      const a = o as StageOutput<"arquitetura">;
      return `<div class="fields">${a.modelo ? field("Modelo", VAL[a.modelo] ?? a.modelo) : ""}${a.justificativa ? field("Justificativa", a.justificativa) : ""}</div>${grid(a.marcas.map((m) => card(m.nome, `<p>${esc(m.papel)}</p><p class="muted">${esc(m.relacao)}</p>`)))}${lists(o, ["regras"])}`;
    }
    case "naming": {
      const n = o as StageOutput<"naming">;
      return `${n.estrategia ? `<p class="lead">${esc(n.estrategia)}</p>` : ""}${n.recomendacao ? `<div class="fields">${field("Recomendação", n.recomendacao)}</div>` : ""}${grid(n.candidatos.map((c) => card(c.nome, `<p>${esc(c.racional)}</p><p class="muted">INPI: ${lab(c.verificacoes.marcaINPI)} · domínio: ${lab(c.verificacoes.dominio)} · linguística: ${lab(c.verificacoes.linguistica)}</p>`, VAL[c.tipo] ?? c.tipo)))}`;
    }
    case "voz": {
      const v = o as StageOutput<"voz">;
      const g = v.gramatica;
      return `<h3>Traços</h3>${grid(v.tracos.map((t) => card(t.traco, `<p>${esc(t.significa)}</p><p class="muted">Não significa: ${esc(t.naoSignifica)}</p><div class="two"><div><b>Faça</b>${list(t.faca)}</div><div><b>Não faça</b>${list(t.naoFaca)}</div></div><p class="ex">${esc(t.exemplo)}</p>`)))}<h3>Regras mensuráveis</h3><div class="stats"><div><b>${esc(g.formalidade)}/5</b><span>formalidade</span></div><div><b>${esc(g.frasesMedia)}</b><span>palavras por frase</span></div><div><b>${esc(g.frasesMax)}</b><span>máximo por frase</span></div><div><b>${lab(g.pessoa)}</b><span>pessoa</span></div><div><b>${lab(g.exclamacao)}</b><span>exclamação</span></div><div><b>${lab(g.emoji)}</b><span>emoji</span></div></div>${g.outras.length ? list(g.outras) : ""}<h3>Léxico</h3><div class="three"><div><b>Palavras próprias</b>${list(v.lexico.palavrasProprias)}</div><div><b>Usar</b>${list(v.lexico.usar)}</div><div><b>Evitar</b>${list(v.lexico.evitar)}</div></div><h3>Mapa de tom</h3>${grid(v.mapaDeTom.map((m) => card(m.situacao, `<p>${esc(m.ajuste)}</p><p class="ex">${esc(m.exemplo)}</p>`)))}<h3>Antes e depois</h3>${v.exemplos.map((e) => `<div class="ba"><div class="ctx">${esc(e.contexto)}</div><div class="before">${esc(e.antes)}</div><div class="after">${esc(e.depois)}</div></div>`).join("")}`;
    }
    case "ativos": {
      const a = o as StageOutput<"ativos">;
      return `${grid(a.ativos.map((x) => card(x.descricao, `<p>${esc(x.papel)}</p><p><b>Só nosso:</b> ${esc(x.exclusividade)}</p><p><b>Na categoria:</b> ${esc(x.usoNaCategoria)}</p><p><b>Como fica famoso:</b> ${esc(x.estrategiaDeFama)}</p>`, VAL[x.tipo] ?? x.tipo)))}<h3>Direção visual</h3><div class="conv trans">${a.direcaoVisual.traducoes.map((t) => `<div class="row"><b class="lbl">${esc(t.traco)}</b><div>${esc(t.traducaoVisual)}</div></div>`).join("")}</div><h3>Evitar</h3>${list(a.direcaoVisual.evitar)}${a.sonoro ? `<h3>Som</h3><p>${esc(a.sonoro.papel)}: ${esc(a.sonoro.descricao)}</p>` : ""}${a.movimento ? `<h3>Movimento</h3>${list(a.movimento.principios)}` : ""}${lists(o, ["mantidos"])}`;
    }
    case "narrativa": {
      const n = o as StageOutput<"narrativa">;
      return `<div class="manifesto">${n.manifesto.split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join("")}</div><h3>História</h3><div class="fields">${field("Protagonista", n.historia.protagonista)}${field("Conflito", n.historia.conflito)}${field("Virada", n.historia.virada)}${field("Transformação", n.historia.transformacao)}</div><h3>Casa de mensagens</h3><p class="lead">${esc(n.casaDeMensagens.guardaChuva)}</p>${grid(n.casaDeMensagens.pilares.map((p) => card(p.pilar, `${list(p.mensagens)}<p class="muted">Provas: ${esc(p.provas.join("; "))}</p>`)))}<h3>Assinaturas</h3>${grid(n.assinaturas.map((a) => card(a.frase, `<p class="muted">${esc(a.racional)}</p>`)))}<h3>Pitch</h3><div class="fields">${field("Curto", n.pitch.curto)}${field("Longo", n.pitch.longo)}</div>`;
    }
    case "ativacao": {
      const a = o as StageOutput<"ativacao">;
      return `<h3>Lançamento</h3>${grid(a.lancamento.map((l) => card(l.acao, `<p>${esc(l.canal)} · ${esc(l.quando)}</p>${l.publico ? `<p class="muted">${esc(l.publico)}</p>` : ""}`)))}<h3>Medição</h3>${grid(a.medicao.map((m) => card(m.metrica, `<p>${esc(m.metodo)} · ${esc(m.cadencia)}</p>`, VAL[m.horizonte] ?? m.horizonte)))}${lists(o, ["regrasDeConsistencia", "primeiros90dias"])}<h3>Governança</h3><div class="fields">${field("Dono", a.governanca.dono)}${field("Aprovações", a.governanca.aprovacoes)}</div>${list(a.governanca.checklist)}`;
    }
  }
};

export const brandbookHtml = (s: BrandState, conflicts: readonly (Conflict & { decision?: Decision })[], unknowns: readonly Unknown[]): string => {
  const done = STAGES.filter((st) => s.stages[st] && !(s.stages[st]!.output as { naoSeAplica?: boolean }).naoSeAplica);
  const name = s.project.brandName;
  const pos = s.stages.posicionamento?.output as StageOutput<"posicionamento"> | undefined;
  const plat = s.stages.plataforma?.output as StageOutput<"plataforma"> | undefined;
  const nav = done.map((st) => `<a href="#${st}">${esc(STAGE_INFO[st].title)}</a>`).join("");
  const sections = done.map((st) => section(STAGES.indexOf(st) + 1, st, STAGE_INFO[st].title, s.stages[st]!.status, stageBody(s, st))).join("");
  const open = conflicts.filter((c) => !c.decision);
  const pend = open.length || unknowns.length ? `<section id="pendencias"><header class="sh"><div class="sh-row"><h2>Pendências</h2></div></header>${open.length ? `<h3>Conflitos abertos</h3>${list(open.map((c) => c.title))}` : ""}${unknowns.length ? `<h3>Ainda desconhecido</h3>${list(unknowns.map((u) => `${u.what}: ${u.why}`))}` : ""}</section>` : "";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} — Brand book</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#f6f4ef;--paper:#fffdf8;--ink:#17150f;--muted:#6b665b;--line:#e2ddd1;--accent:#c2410c;--accent-soft:#fbe9df;--follow:#e7e4dc;--on-accent:#fff;--radius:14px;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121110;--paper:#1b1a18;--ink:#f1ede4;--muted:#a59f92;--line:#2f2c27;--accent:#fb923c;--accent-soft:#3a2416;--follow:#2a2824;--on-accent:#1b1a18;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121110;--paper:#1b1a18;--ink:#f1ede4;--muted:#a59f92;--line:#2f2c27;--accent:#fb923c;--accent-soft:#3a2416;--follow:#2a2824;--on-accent:#1b1a18;color-scheme:dark}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow-wrap:anywhere}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}
.cover{padding:96px 0 64px;border-bottom:1px solid var(--line)}
.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 20px}
.cover h1{font:600 clamp(44px,9vw,104px)/1 Fraunces,Georgia,serif;margin:0 0 28px;letter-spacing:-.02em}
.cover .idea{font:400 clamp(20px,3vw,30px)/1.3 Fraunces,Georgia,serif;max-width:760px;margin:0 0 16px}
.cover .onl{color:var(--muted);max-width:720px;margin:0}
nav.toc{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
nav.toc .wrap{display:flex;gap:18px;overflow-x:auto;padding-top:12px;padding-bottom:12px;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 48px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 48px),transparent)}
nav.toc a:last-child{padding-right:40px}
nav.toc a{color:var(--muted);text-decoration:none;font-size:14px;white-space:nowrap}nav.toc a:hover{color:var(--ink)}
section{padding:72px 0;border-bottom:1px solid var(--line)}
section{scroll-margin-top:56px}
.sh{margin-bottom:28px}
.sh-row{display:flex;align-items:center;gap:12px 16px;flex-wrap:wrap}
.num{display:block;font:600 13px Inter,sans-serif;letter-spacing:.08em;color:var(--accent);margin-bottom:8px}
h2{font:600 clamp(28px,4vw,40px)/1.15 Fraunces,Georgia,serif;margin:0;flex:0 1 auto}
h3{font:600 13px/1.4 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:40px 0 14px}
h4{font:600 18px/1.35 Inter,sans-serif;margin:0 0 8px}
.status{font-size:12px;padding:4px 10px;border-radius:99px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.s-aprovada{background:var(--accent-soft);color:var(--accent);border-color:transparent}
.s-reprovada{border-color:var(--accent);color:var(--accent)}
p{margin:0 0 10px}.muted{color:var(--muted);font-size:14px}.lead{font-size:19px;max-width:760px}
blockquote.hero{font:400 clamp(24px,3.6vw,36px)/1.25 Fraunces,Georgia,serif;margin:0 0 24px;padding:0 0 0 22px;border-left:3px solid var(--accent);max-width:860px}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px 28px;margin:8px 0}
.field{padding:14px 0;border-top:1px solid var(--line)}.field .k{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);padding:20px;min-width:0}
.card ul{margin:6px 0 10px;padding-left:18px}.card p:last-child{margin-bottom:0}
.tag{display:inline-block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:8px}
ul{padding-left:20px;margin:0 0 8px}li{margin:4px 0}
.two,.three{display:grid;gap:16px}.two{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.three{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.conv{display:grid;gap:10px}.conv .row{display:grid;grid-template-columns:110px 1fr;gap:14px;align-items:start;padding:12px 0;border-top:1px solid var(--line)}
.pill{display:inline-block;text-align:center;font-size:12px;padding:3px 10px;border-radius:99px;background:var(--follow);overflow-wrap:normal}
.pill.break{background:var(--accent);color:var(--on-accent)}
.conv.trans .row{grid-template-columns:220px 1fr}.lbl{font-weight:600}
.quotes q{display:inline-block;margin:0 8px 8px 0;padding:6px 12px;border-radius:99px;background:var(--paper);border:1px solid var(--line);font-size:14px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.stats div{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);padding:16px}.stats b{display:block;font:600 22px Fraunces,Georgia,serif}.stats span{font-size:13px;color:var(--muted)}
.ex{font-style:italic;color:var(--muted);border-left:2px solid var(--line);padding-left:10px}
.ba{display:grid;grid-template-columns:160px 1fr 1fr;gap:14px;padding:16px 0;border-top:1px solid var(--line)}
.ba .ctx{font-size:13px;color:var(--muted)}.ba .before{color:var(--muted);text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--muted) 60%,transparent)}
.ba .after{font-weight:500}
.manifesto{font:400 clamp(19px,2.4vw,23px)/1.55 Fraunces,Georgia,serif;max-width:760px}
footer{padding:48px 0 72px;color:var(--muted);font-size:13px}
@media (max-width:640px){.wrap{padding:0 16px}.cover{padding:64px 0 44px}section{padding:52px 0}.ba{grid-template-columns:1fr}.conv .row,.conv.trans .row{grid-template-columns:1fr;gap:6px}.conv .pill{justify-self:start}}
@media print{nav.toc{display:none}section{break-inside:avoid-page;padding:32px 0}body{background:#fff}}
</style></head><body>
<header class="cover"><div class="wrap"><p class="eyebrow">Brand book · ${esc(s.project.sector || "marca")} · ${esc(s.project.market)}</p><h1>${esc(name)}</h1>${plat ? `<p class="idea">${esc(plat.ideiaDeMarca)}</p>` : ""}${pos ? `<p class="onl">${esc(pos.onliness)}</p>` : ""}</div></header>
${done.length ? `<nav class="toc" aria-label="Seções"><div class="wrap">${nav}</div></nav>` : ""}
<main class="wrap">${sections || `<section><p class="lead">Nenhuma etapa entregue ainda.</p></section>`}${pend}</main>
<footer class="wrap">Gerado pelo Brand Genome em ${esc(new Date().toLocaleDateString("pt-BR"))}. Cada afirmação estratégica passou pelos portões de qualidade do sistema; o status de cada etapa mostra se o cliente aprovou.</footer>
</body></html>`;
};
