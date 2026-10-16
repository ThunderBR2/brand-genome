import type { Stage } from "../core/model.js";

export interface StageInfo {
  readonly title: string;
  readonly goal: string;
  readonly why: string;
  readonly dependsOn: readonly Stage[];
  /** Ask the user when the sources don't answer. */
  readonly questions: readonly string[];
  /** How to do it well (method + anti-generic discipline). */
  readonly guide: readonly string[];
  /** Words used to pull extra canon cards. */
  readonly canonFocus: string;
  readonly optional?: boolean;
}

export const STAGE_INFO: Record<Stage, StageInfo> = {
  diagnostico: {
    title: "Diagnóstico",
    goal: "Entender o negócio, a ambição e o problema que a marca precisa resolver, e levantar as verdades do negócio que vão sustentar tudo.",
    why: "Marca forte nasce de verdades do negócio, não de adjetivos. Sem fatos verificáveis aqui, todas as etapas seguintes viram opinião.",
    dependsOn: [],
    questions: [
      "O que a empresa faz, para quem, e como ganha dinheiro?",
      "É uma marca nova, um reposicionamento, um rebrand ou uma evolução?",
      "O que existe de verdade no negócio que outros não têm? (origem, processo, matéria-prima, pessoas, números, decisões difíceis que vocês tomaram)",
      "Que ativos de marca existem hoje (nome, cores, símbolo, frase, personagem, embalagem) e o que o público já reconhece?",
      "Onde vocês querem estar em 3 a 5 anos? Como vão saber que a marca funcionou?",
      "O que não pode mudar (restrições legais, sócios, orçamento, prazos)?",
    ],
    guide: [
      "Separe o problema de negócio do problema de marca: 'vender mais' é de negócio; 'ninguém lembra de nós na hora da compra' é de marca.",
      "Verdades do negócio são fatos: 'torramos em lotes de 12 kg toda terça' é verdade; 'temos paixão por café' não é.",
      "Em rebrand, liste o que o público já reconhece. Abandonar ativos com equity é o erro mais caro do branding (Tropicana 2009, Gap 2010).",
      "Pelo menos uma métrica de sucesso deve ser de marca (lembrança espontânea, consideração, associação com momentos de compra), não só vendas.",
      "O que você não sabe vai em lacunas. Não invente: o sistema marca o que é desconhecido.",
    ],
    canonFocus: "diagnóstico negócio problema de marca ativos existentes equity rebrand métricas",
  },
  paisagem: {
    title: "Paisagem da categoria",
    goal: "Mapear a categoria, os concorrentes e as convenções que todos repetem, e decidir quais convenções seguir e quais quebrar.",
    why: "Não dá para ser diferente sem saber do que. As convenções medidas nos textos dos concorrentes mostram o 'mar de mesmice'; quebrar as certas é o que dá identidade.",
    dependsOn: ["diagnostico"],
    questions: [
      "Quem são os 3 a 6 concorrentes que o público realmente compara com vocês? (inclua os indiretos)",
      "O que o público faria se vocês não existissem?",
      "Que marcas de fora da categoria vocês admiram, e por quê?",
    ],
    guide: [
      "Use as convenções MEDIDAS (brand_landscape): elas vêm do texto real dos concorrentes, com evidência.",
      "Decida cada convenção forte: seguir (é preciso para ser entendido como da categoria) ou quebrar (é só hábito). Uma marca que não quebra nenhuma nasce igual.",
      "Alternativas (Dunford) incluem 'não fazer nada', planilha, fazer em casa: muitas vezes o concorrente real é a inércia.",
      "Espaços livres precisam ser específicos: 'ninguém fala da manhã de quem trabalha de madrugada', não 'ninguém é inovador'.",
    ],
    canonFocus: "categoria convenções concorrentes alternativas competitivas mar de mesmice códigos da categoria quebrar",
  },
  publico: {
    title: "Público e pontos de entrada",
    goal: "Entender quem compra e por quê, em que situações a categoria vem à mente (category entry points), e encontrar insights com tensão real.",
    why: "Marcas crescem sendo lembradas em mais situações de compra, por mais gente. Insight bom é uma tensão verdadeira na vida do público, não um dado demográfico.",
    dependsOn: ["diagnostico", "paisagem"],
    questions: [
      "Em que momentos e situações as pessoas pensam em comprar algo dessa categoria? (quando, onde, com quem, por quê, com o quê)",
      "O que irrita, preocupa ou envergonha o público em relação à categoria?",
      "Vocês têm avaliações, entrevistas, comentários ou pesquisas? (adicione como fontes de papel 'publico')",
    ],
    guide: [
      "Use as palavras do próprio público (brand_landscape → audience). Nada de traduzir para marketês.",
      "Liste muitos pontos de entrada (CEPs): Romaniuk recomenda mapear amplo e escolher os que a marca pode possuir.",
      "Insight = observação + tensão + implicação. 'Mulheres de 25 a 34 anos' é dado; 'quer se cuidar, mas sente culpa de gastar tempo consigo' é insight.",
      "Toda evidência precisa apontar para uma fonte ou citação. Se não há fonte, o insight é hipótese: diga isso.",
      "Pense em alcance: a ciência de marketing mostra que crescer depende de conquistar compradores leves; não estreite o público à toa.",
    ],
    canonFocus: "público insight tensão category entry points disponibilidade mental compradores leves penetração",
  },
  posicionamento: {
    title: "Posicionamento",
    goal: "Definir o lugar da marca na cabeça do público: quadro de referência, diferenciais com prova, o que só ela pode dizer e o que ela sacrifica.",
    why: "Posicionamento forte é escolha. Se o oposto do seu posicionamento é absurdo, ele não diz nada; se qualquer concorrente poderia assiná-lo, ele não é seu.",
    dependsOn: ["diagnostico", "paisagem", "publico"],
    questions: [
      "Do que a marca está disposta a abrir mão para ser clara? (público, ocasião, atributo, canal)",
      "Que provas existem para cada diferencial?",
    ],
    guide: [
      "Comece pelo quadro de referência (em que categoria o público vai nos colocar), depois paridade (o mínimo para ser considerado), depois diferença.",
      "Diferencial bom é relevante para o público, verdadeiro (com prova) e difícil de copiar. Diferencial que aparece no site de um concorrente não é diferencial: o sistema confere.",
      "Teste do oposto plausível: escreva o posicionamento que um concorrente sério defenderia. Se ninguém defenderia o oposto ('não temos qualidade'), reescreva.",
      "Onliness (Neumeier): 'Somos a única ___ que ___'. Se a frase cabe em outro concorrente, ela falhou.",
      "Sacrifício é obrigatório: foco é dizer não.",
      "A ciência de marketing questiona quanto a diferenciação percebida pesa; por isso a etapa de ativos (distintividade) vem depois. As duas coisas somam: 'bothism' (Ritson).",
    ],
    canonFocus: "posicionamento diferenciação onliness quadro de referência pontos de paridade diferença sacrifício oposto plausível razões para acreditar",
  },
  plataforma: {
    title: "Plataforma de marca",
    goal: "Transformar o posicionamento em ideia de marca, crenças, valores como comportamento, personalidade, promessa e pilares.",
    why: "A plataforma guia decisões do dia a dia. Valores que não mudam nenhuma decisão são decoração; propósito sem prova operacional é o que o público mais desconfia.",
    dependsOn: ["posicionamento"],
    questions: [
      "Que decisão difícil a empresa já tomou que mostra o que ela valoriza?",
      "O que a marca acredita que a categoria faz de errado?",
    ],
    guide: [
      "Ideia de marca: 2 a 7 palavras que organizam tudo. Não é tagline; é o norte.",
      "Crenças dão ponto de vista: uma marca com opinião tem graça; uma marca que concorda com tudo é invisível.",
      "Valores como comportamento: 'Transparência' sozinho é vazio; 'mostramos o custo de cada item na nota' é valor.",
      "Personalidade com 'é / não é': o 'não é' é o que dá forma ('ousada, não arrogante').",
      "Propósito é opcional. Se entrar, precisa de provas operacionais (o que a empresa faz diferente por causa dele). O debate sobre propósito está no cânone; o sistema exige prova.",
    ],
    canonFocus: "plataforma ideia de marca propósito valores comportamento personalidade promessa pilares crenças ponto de vista",
  },
  arquitetura: {
    title: "Arquitetura de marca",
    goal: "Definir como a marca se relaciona com produtos, linhas e submarcas.",
    why: "Arquitetura decide onde o valor da marca se acumula. Marcas demais dividem a memória; uma marca só pode esticar até romper.",
    dependsOn: ["posicionamento"],
    questions: ["Existem (ou vão existir) produtos, linhas, unidades ou submarcas com públicos diferentes?"],
    guide: [
      "Para uma marca única sem portfólio, marque 'naoSeAplica' com o motivo.",
      "Use o espectro de Aaker & Joachimsthaler: branded house → submarcas → endossadas → house of brands. Prefira concentrar a memória numa marca, a não ser que públicos ou promessas conflitem.",
      "Escreva regras que um designer consiga aplicar: quando nasce uma submarca, como o nome se forma, como a marca-mãe aparece.",
    ],
    canonFocus: "arquitetura de marca branded house house of brands submarca endosso portfólio",
    optional: true,
  },
  naming: {
    title: "Naming",
    goal: "Criar e avaliar nomes com critérios explícitos, triagem mecânica e verificações legais e linguísticas.",
    why: "O nome é o ativo mais usado da marca. Nome descritivo é fácil de entender e impossível de possuir; nome da moda envelhece junto com a moda.",
    dependsOn: ["posicionamento", "plataforma"],
    questions: ["A marca já tem nome definitivo? Se sim, marque 'naoSeAplica'.", "Em que países e idiomas a marca vai operar?", "Em que classes de produto ou serviço a marca será registrada?"],
    guide: [
      "Defina critérios e pesos antes de gerar nomes (ex.: distintivo, memorável, pronunciável, extensível, alinhado à ideia de marca, registrável).",
      "Gere em várias rotas (sugestivo, metáfora, inventado, composto...) e corte muito. Agências geram centenas para escolher poucos.",
      "Rode brand_name_check em todos os finalistas: ele pega clichês, semelhança com concorrentes e palavras descritivas da categoria.",
      "Busca de marca (INPI, WIPO), domínio e checagem linguística com nativos são manuais. Enquanto não forem feitas, o nome é 'candidato', não 'escolhido'.",
    ],
    canonFocus: "naming nome critérios triagem registro de marca INPI checagem linguística tipos de nome",
    optional: true,
  },
  voz: {
    title: "Identidade verbal e tom de voz",
    goal: "Transformar a personalidade numa voz que qualquer pessoa (ou IA) consiga escrever e que o sistema consiga medir.",
    why: "Três adjetivos num slide não formam uma voz. Voz útil tem traços com 'faça/não faça', vocabulário próprio, regras de gramática e exemplos de antes e depois.",
    dependsOn: ["plataforma"],
    questions: ["Em que canais e situações a marca mais escreve? (site, redes, atendimento, embalagem, app)"],
    guide: [
      "Mesma voz, tons diferentes (Mailchimp): a personalidade não muda; o tom se ajusta à situação (erro, venda, luto, celebração).",
      "Cada traço precisa de 'significa / não significa' e de exemplos concretos de faça e não faça.",
      "Lista 'evitar' deve incluir as convenções da categoria e os clichês que os concorrentes usam (o sistema mostra quais).",
      "Palavras próprias: vocabulário que só a marca usa. É o que faz um texto ser reconhecido sem o logo.",
      "Gramática mensurável: pessoa, formalidade de 1 a 5, tamanho de frase, exclamação e emoji. O verificador usa esses números.",
      "Os exemplos 'depois' são testados contra a voz: precisam passar.",
    ],
    canonFocus: "tom de voz identidade verbal traços faça não faça mesma voz tom diferente linguagem simples palavras próprias",
  },
  ativos: {
    title: "Ativos distintivos e direção sensorial",
    goal: "Escolher os ativos que vão identificar a marca sem o nome (cor, forma, símbolo, personagem, som, frase, padrão, ritual) e traduzir a personalidade em direção visual.",
    why: "Marcas são encontradas por ativos distintivos. Só uma minoria dos ativos de mercado é realmente distintiva; os outros não identificam ninguém.",
    dependsOn: ["plataforma", "voz"],
    questions: ["Há ativos atuais com reconhecimento que devem ser mantidos?", "Em que pontos de contato a marca mais aparece (embalagem, loja, digital, áudio)?"],
    guide: [
      "Pense na grade Fama × Unicidade (Romaniuk): um ativo vale quando muita gente o liga à marca (fama) e não liga a nenhuma outra (unicidade).",
      "Para cada ativo, diga quem na categoria usa algo parecido. Cor da categoria não é ativo.",
      "Fama vem de consistência e frequência ao longo de anos. Descreva como o ativo vai aparecer sempre.",
      "Inclua pelo menos um ativo além de logo e cor (personagem, som, frase, forma, ritual).",
      "A direção visual sai da personalidade: cada traço vira uma decisão visual. Depois, o Design Genome mede e verifica as peças (exporte o design-brief).",
    ],
    canonFocus: "ativos distintivos fama unicidade consistência identidade visual som motion personagem cor da categoria",
  },
  narrativa: {
    title: "Narrativa, manifesto e mensagens",
    goal: "Escrever o manifesto, a história, a casa de mensagens, as assinaturas e o pitch — na voz da marca e sem nada genérico.",
    why: "É aqui que a marca vira texto público. O verificador mede cada frase contra o léxico genérico, as convenções da categoria, os concorrentes e a voz.",
    dependsOn: ["posicionamento", "plataforma", "voz"],
    questions: [],
    guide: [
      "Escreva primeiro, depois rode brand_verify em cada texto e corrija até passar. Não entregue texto com nota abaixo de 70.",
      "O cliente é o protagonista da história; a marca é a guia. Mas evite a fórmula pela fórmula: muitas marcas que seguem o mesmo roteiro soam iguais.",
      "Manifesto com ponto de vista, tensão e provas. Sem 'transformar vidas', 'fazer a diferença', 'paixão por'.",
      "Cada pilar da casa de mensagens precisa de provas concretas.",
      "Assinaturas: teste o oposto e o teste de troca. Se serve para o concorrente, não serve para nós.",
    ],
    canonFocus: "manifesto narrativa storytelling casa de mensagens tagline assinatura pitch provas",
  },
  ativacao: {
    title: "Ativação e governança",
    goal: "Planejar o lançamento, as regras de consistência, a medição de curto e longo prazo e quem cuida da marca.",
    why: "Marca se constrói ao longo do tempo, com alcance e consistência. Medir só o curto prazo empurra para ações táticas que não constroem memória.",
    dependsOn: ["posicionamento", "ativos", "narrativa"],
    questions: ["Qual o orçamento e os canais disponíveis?", "Quem aprova peças de marca hoje?"],
    guide: [
      "Equilibre construção de marca e ativação (Binet & Field) e meça os dois horizontes.",
      "Inclua métricas de marca: lembrança, associação com os pontos de entrada, reconhecimento dos ativos distintivos.",
      "Regras de consistência que um estagiário consiga seguir. Mudar ativos cedo demais destrói a fama que eles nem construíram.",
      "Defina um dono da marca e um checklist de aprovação (inclua brand_verify para textos e genome_verify para peças visuais).",
    ],
    canonFocus: "ativação lançamento consistência medição longo prazo curto prazo governança alcance",
  },
};
