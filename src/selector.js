const { t } = require('./i18n');
const { normalizeDir } = require('./paths');

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  white: '\x1b[97m',
};

function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Tudo que aparece na tela precisa ser buscavel, inclusive agente e branch.
function matches(item, terms) {
  const haystack = normalize(
    [item.agent, item.dir, item.sessionId, item.branch, item.title, item.summary]
      .filter(Boolean)
      .join(' ')
  );
  return terms.every((term) => haystack.includes(term));
}

function filterItems(items, query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items;
  return items.filter((item) => matches(item, terms));
}

// O escopo 'local' so mostra sessoes do diretorio onde o comando rodou; o
// 'global' mostra a maquina inteira. Ctrl+A alterna, como no /resume.
function inScope(items, scope, cwd) {
  if (scope !== 'local' || !cwd) return items;
  const alvo = normalizeDir(cwd).toLowerCase();
  return items.filter((item) => normalizeDir(item.dir).toLowerCase() === alvo);
}

function createState(
  items,
  { viewport = 10, columns = 80, color = true, cwd = null, scope = 'global', sendPrompt = null } = {}
) {
  const base = inScope(items, scope, cwd);

  return {
    allItems: items,
    items: base,
    index: 0,
    offset: 0,
    viewport: Math.max(1, viewport),
    columns: Math.max(20, columns),
    color,
    query: '',
    cwd,
    scope,
    marked: new Set(),
    agentFilter: null,
    previewOn: true,
    sendPrompt,
    confirmSend: null,
  };
}

// Ordem de aparicao na lista geral (ja ordenada por recencia), nao alfabetica
// - assim o agente usado mais recentemente tende a vir primeiro nas abas.
function uniqueAgents(items) {
  const vistos = new Set();
  const ordem = [];
  for (const item of items) {
    if (!vistos.has(item.agent)) {
      vistos.add(item.agent);
      ordem.push(item.agent);
    }
  }
  return ordem;
}

// Ctrl+Seta (nao Tab) porque Tab ja marca sessao para o lote do Enter -
// reaproveitar Tab para isso, como o fast-resume faz, colidiria com essa
// outra feature.
function cycleAgentFilter(state, delta) {
  const opcoes = [null, ...uniqueAgents(state.allItems)];
  const atual = opcoes.indexOf(state.agentFilter);
  const base = atual === -1 ? 0 : atual;
  const proximo = ((base + delta) % opcoes.length + opcoes.length) % opcoes.length;
  return refine(state, { agentFilter: opcoes[proximo] });
}

// Tab so marca ou desmarca - nada abre ate o Enter. Guardar por sessionId (nao
// por indice) faz a marca sobreviver a busca e a troca de escopo, que reduzem
// `items` mas nunca mudam quem uma sessao e.
function toggleMark(state, sessionId) {
  const marked = new Set(state.marked);
  if (marked.has(sessionId)) marked.delete(sessionId);
  else marked.add(sessionId);
  return { ...state, marked };
}

// Marca o item destacado e avanca pro proximo, para marcar varios em sequencia
// sem soltar a tecla. Usado pelo Tab e pelo Ctrl+Enter (quando o terminal
// manda essa combinacao) - os dois so marcam, nunca abrem.
function markAndAdvance(state) {
  const current = state.items[state.index];
  if (!current) return state;
  return move(toggleMark(state, current.sessionId), 1, { wrap: true });
}

// As sessoes marcadas vem de allItems, nao de items: uma busca que escondeu
// o item da tela nao pode fazer a marca sumir do lote final.
function markedRefs(state) {
  return state.allItems.filter((item) => state.marked.has(item.sessionId)).map((item) => item.ref);
}

function syncOffset(state) {
  const { index, viewport, items } = state;
  let offset = state.offset;
  const maxOffset = Math.max(0, items.length - viewport);

  if (index < offset) offset = index;
  if (index >= offset + viewport) offset = index - viewport + 1;

  return { ...state, offset: Math.min(Math.max(0, offset), maxOffset) };
}

function move(state, delta, { wrap = false } = {}) {
  const total = state.items.length;
  if (total === 0) return state;

  let index = state.index + delta;
  if (wrap) {
    index = ((index % total) + total) % total;
  } else {
    index = Math.min(Math.max(0, index), total - 1);
  }

  return syncOffset({ ...state, index });
}

function refine(state, { query = state.query, scope = state.scope, agentFilter = state.agentFilter }) {
  let items = inScope(state.allItems, scope, state.cwd);
  if (agentFilter) items = items.filter((item) => item.agent === agentFilter);
  items = filterItems(items, query);
  return { ...state, query, scope, agentFilter, items, index: 0, offset: 0 };
}

function setQuery(state, query) {
  return refine(state, { query });
}

function toggleScope(state) {
  return refine(state, { scope: state.scope === 'global' ? 'local' : 'global' });
}

function isPrintable(key) {
  const seq = key.sequence || '';
  if (key.ctrl || key.meta) return false;
  if (seq.length !== 1) return false;
  const code = seq.charCodeAt(0);
  return code >= 32 && code !== 127;
}

function navigationFor(state, key) {
  const name = key.name || '';

  if (key.ctrl && name === 'n') return { state: move(state, 1, { wrap: true }), action: 'move' };
  if (key.ctrl && name === 'p') return { state: move(state, -1, { wrap: true }), action: 'move' };

  switch (name) {
    case 'up':
      return { state: move(state, -1, { wrap: true }), action: 'move' };
    case 'down':
      return { state: move(state, 1, { wrap: true }), action: 'move' };
    case 'pageup':
      return { state: move(state, -state.viewport), action: 'move' };
    case 'pagedown':
      return { state: move(state, state.viewport), action: 'move' };
    case 'home':
      return { state: move(state, -state.items.length), action: 'move' };
    case 'end':
      return { state: move(state, state.items.length), action: 'move' };
    default:
      return null;
  }
}

// Enter so vira lote quando algo foi marcado com Tab antes. Sem marca
// nenhuma, comporta-se exatamente como sempre: abre o item destacado e fecha.
function selectOrNothing(state) {
  if (state.marked.size > 0) return { state, action: 'open-batch', items: markedRefs(state) };
  if (state.items.length === 0) return { state, action: 'none' };
  return { state, action: 'select' };
}

// A busca esta sempre ativa: qualquer caractere imprimivel vai para o termo,
// como no /resume do Claude Code. Por isso a navegacao fica nas setas - letra
// nenhuma pode ser atalho, ou seria impossivel buscar por ela.
// Com --send configurado, o Enter que abriria de vez fica suspenso num
// modal de confirmacao primeiro - nada de mandar mensagem sem perguntar.
// Enquanto o modal esta na tela, so essas teclas existem: nada de busca,
// navegacao ou outro atalho vaza pro que fica por baixo.
function applyKeyDuringConfirm(state, key) {
  const name = key.name || '';
  const seq = key.sequence || '';
  const { pending } = state.confirmSend;
  const limpo = { ...state, confirmSend: null };

  if (name === 'escape') return { state: limpo, action: 'move' };
  if (seq === 's' || seq === 'S') return { state: limpo, action: pending.type, items: pending.items, send: true };
  if (name === 'return' || name === 'enter' || seq === '\r' || seq === '\n' || seq === 'n' || seq === 'N') {
    return { state: limpo, action: pending.type, items: pending.items, send: false };
  }
  return { state, action: 'none' };
}

function applyKey(state, key = {}) {
  const name = key.name || '';
  const seq = key.sequence || '';

  if (key.ctrl && (name === 'c' || name === 'd')) return { state, action: 'cancel' };
  if (state.confirmSend) return applyKeyDuringConfirm(state, key);
  if (key.ctrl && name === 'a') return { state: toggleScope(state), action: 'move' };
  if (key.ctrl && name === 'right') return { state: cycleAgentFilter(state, 1), action: 'move' };
  if (key.ctrl && name === 'left') return { state: cycleAgentFilter(state, -1), action: 'move' };
  if (key.ctrl && name === 't') return { state: { ...state, previewOn: !state.previewOn }, action: 'move' };
  if (name === 'return' || name === 'enter' || seq === '\r' || seq === '\n') {
    const resultado = selectOrNothing(state);
    if (state.sendPrompt && (resultado.action === 'select' || resultado.action === 'open-batch')) {
      const items = resultado.action === 'open-batch' ? resultado.items : [state.items[state.index].ref];
      return { state: { ...state, confirmSend: { pending: { type: resultado.action, items } } }, action: 'move' };
    }
    return resultado;
  }

  // Tab so marca (ou desmarca) o item destacado e avanca - nada abre ainda.
  // O lote inteiro so abre quando o Enter vier com alguma marca pendente.
  if (name === 'tab') {
    return { state: markAndAdvance(state), action: 'move' };
  }

  const navigated = navigationFor(state, key);
  if (navigated) return navigated;

  if (name === 'escape') {
    if (state.query) return { state: setQuery(state, ''), action: 'move' };
    return { state, action: 'cancel' };
  }

  if (key.ctrl && name === 'u') return { state: setQuery(state, ''), action: 'move' };

  if (name === 'backspace') {
    if (!state.query) return { state, action: 'none' };
    return { state: setQuery(state, state.query.slice(0, -1)), action: 'move' };
  }

  if (isPrintable(key)) return { state: setQuery(state, state.query + seq), action: 'move' };

  return { state, action: 'none' };
}

function truncate(text, columns) {
  if (text.length <= columns) return text;
  return `${text.slice(0, Math.max(1, columns - 1))}…`;
}

function formatBytes(bytes) {
  if (!bytes) return null;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

// Claude reporta o contexto ocupado agora; Codex reporta o consumo acumulado
// da sessao. O sufixo impede que dois numeros incomparaveis leiam como iguais.
function formatTokens(tokens, kind) {
  if (!tokens) return null;
  const value =
    tokens >= 1000000 ? `${(tokens / 1000000).toFixed(1)}M` : `${Math.round(tokens / 1000)}k`;

  if (kind === 'context') return `${value} ctx`;
  if (kind === 'cumulative') return `${value} usados`;
  return value;
}

function formatTurns(turns) {
  return turns == null ? null : t('meta.turns', { n: turns });
}

// Cor fixa por agente, usando a cor real de cada marca (nao uma escolhida por
// nos) - terracota do Claude e verde do OpenAI/Codex, ambas em truecolor pra
// bater com a marca de verdade. Fora da paleta do age (verde/ciano/amarelo/
// dim) de proposito, senao os dois significados se confundiriam na mesma cor.
const AGENT_COLOR = { claude: '\x1b[38;2;217;119;87m', codex: '\x1b[38;2;16;163;127m' };
const DIR_COLUMN_MAX = 36;

// Path inteiro na tabela faria a coluna variar demais de sessao pra sessao,
// destruindo o alinhamento das colunas seguintes - um teto fixo mantem a
// tabela estavel, ao custo de cortar caminhos muito longos.
function truncateDir(dir) {
  if (!dir) return dir;
  return dir.length > DIR_COLUMN_MAX ? `${dir.slice(0, DIR_COLUMN_MAX - 1)}…` : dir;
}

// Sessao mexida ha pouco fica verde, hoje fica ciano, essa semana fica
// amarela, mais antiga que isso usa o dim padrao - sinaliza de relance o que
// vale revisitar sem precisar ler o texto do age.
function ageColor(mtimeMs) {
  if (mtimeMs == null) return ANSI.dim;
  const horas = (Date.now() - mtimeMs) / 3600000;
  if (horas < 1) return ANSI.green;
  if (horas < 24) return ANSI.cyan;
  if (horas < 24 * 7) return ANSI.yellow;
  return ANSI.dim;
}

// Cada coluna sabe extrair seu proprio valor e, quando faz sentido, sua
// propria cor (agente e idade carregam identidade/urgencia; o resto usa o
// tom padrao da linha). Uma unica lista de colunas alimenta tanto a versao
// plana (cabe checar largura) quanto a colorida - sem duplicar a ordem dos
// campos nos dois lugares.
const COLUMNS = [
  { key: 'agent', valor: (item) => item.agent, cor: (item) => AGENT_COLOR[item.agent] },
  { key: 'dir', valor: (item) => truncateDir(item.dir), cor: () => null },
  { key: 'turns', valor: (item) => formatTurns(item.turns), cor: () => null },
  { key: 'age', valor: (item) => item.age, cor: (item) => ageColor(item.mtime) },
  { key: 'branch', valor: (item) => item.branch, cor: () => null },
  { key: 'bytes', valor: (item) => formatBytes(item.bytes), cor: () => null },
  { key: 'tokens', valor: (item) => formatTokens(item.tokens, item.tokensKind), cor: () => null },
];

// Largura por coluna calculada na pagina visivel (nao na lista inteira) -
// alinha as linhas que aparecem juntas na tela sem pagar o custo de escanear
// milhares de sessoes so pra descobrir a coluna mais larga.
function columnWidths(pageItems) {
  const widths = {};
  for (const col of COLUMNS) {
    widths[col.key] = Math.max(0, ...pageItems.map((item) => (col.valor(item) || '').length));
  }
  return widths;
}

// So entram na tabela as colunas que alguem na pagina de fato preenche -
// senao uma coluna vazia (ex: sem branch) viraria um buraco de espacos em
// todas as linhas em vez de simplesmente sumir, como sempre se comportou.
function activeColumns(widths) {
  return COLUMNS.filter((col) => widths[col.key] > 0);
}

function metaLine(item, widths) {
  return activeColumns(widths)
    .map((col) => (col.valor(item) || '').padEnd(widths[col.key]))
    .join(' · ')
    .trimEnd();
}

// So colore por segmento quando a linha cabe inteira sem cortar - cortar uma
// string ja colorida no meio de um codigo ANSI corrompe o restante da linha.
// Sem espaco, cai de volta no dim uniforme de sempre.
// Na linha selecionada, os campos que normalmente ficam apagados (dim) viram
// branco - continuam legiveis mesmo sob o realce da selecao, em vez de somar
// dim com o fundo/negrito da linha e ficar dificil de ler.
function renderColoredMeta(state, item, selected, widths) {
  const corBase = selected ? ANSI.white : ANSI.dim;
  const cols = activeColumns(widths);
  const separador = paint(state, corBase, ' · ');

  const texto = cols
    .map((col) => {
      const valor = (col.valor(item) || '').padEnd(widths[col.key]);
      return paint(state, col.cor(item) || corBase, valor);
    })
    .join(separador);

  return `    ${texto}`;
}

// O path saiu do titulo e foi pra linha de metadados, logo depois do agente -
// "claude · C:\DEV\App · ..." em vez de disputar espaco com o nome da
// sessao na primeira linha.
function renderItem(state, item, selected, widths) {
  const marker = selected ? '> ' : state.marked.has(item.sessionId) ? '✓ ' : '  ';
  const label = item.title || item.summary;
  const headTexto = truncate(`${marker}${label}`, state.columns);

  const head = selected ? paint(state, ANSI.bold + ANSI.cyan, headTexto) : headTexto;

  const metaPlano = `    ${metaLine(item, widths)}`;
  const cabeMeta = metaPlano.length <= state.columns;
  const meta = cabeMeta
    ? renderColoredMeta(state, item, selected, widths)
    : paint(state, selected ? ANSI.white : ANSI.dim, truncate(metaPlano, state.columns));

  return [head, meta];
}

function paint(state, code, text) {
  if (!state.color) return text;
  return `${code}${text}${ANSI.reset}`;
}

function header(state) {
  const posicao = state.items.length ? state.index + 1 : 0;
  const params = { shown: posicao, total: state.items.length };

  const texto =
    state.scope === 'local' && state.cwd
      ? t('ui.header.scoped', { ...params, path: normalizeDir(state.cwd) })
      : t('ui.header.global', params);

  return paint(state, ANSI.bold, truncate(`  ${texto}`, state.columns));
}

// Caixa de busca sempre visivel, como no /resume: o usuario digita direto,
// sem prefixo, e ve o termo enquanto a lista encolhe embaixo.
function searchBox(state) {
  const width = Math.max(24, Math.min(state.columns - 4, 100));
  const inner = width - 2;
  const conteudo = state.query ? `${state.query}█` : t('ui.search.placeholder');
  const texto = ` ⌕ ${conteudo}`;
  const preenchido = texto.length > inner ? truncate(texto, inner) : texto.padEnd(inner);

  const linha = state.query ? ANSI.cyan : ANSI.dim;

  return [
    paint(state, linha, `  ┌${'─'.repeat(inner)}┐`),
    `  ${paint(state, linha, '│')}${state.query ? preenchido : paint(state, ANSI.dim, preenchido)}${paint(state, linha, '│')}`,
    paint(state, linha, `  └${'─'.repeat(inner)}┘`),
  ];
}

function footer(state) {
  const previewHint = t(state.previewOn ? 'ui.footer.previewOn' : 'ui.footer.previewOff');
  const dica = t(state.query ? 'ui.footer.searching' : 'ui.footer.idle', { previewHint });
  return paint(state, ANSI.dim, truncate(`  ${dica}`, state.columns));
}

// Uma linha em branco no topo (antes da caixa de busca) e outra no rodape
// (antes dos atalhos) dao respiro entre o cabecalho/lista e as bordas - e uma
// terceira, antes de tudo, afasta o cabecalho do topo do terminal. Sem essas
// tres o texto encostava direto na borda de cima e os atalhos ficavam
// grudados na ultima linha da lista.
//
// A linha de abas por agente sempre ocupa espaco no layout, mesmo vazia com
// um agente so - senao a altura da tela mudaria conforme os dados, e o
// calculo do viewport (feito em pick.js, sem acesso a essa lista ainda)
// deixaria de bater com o que de fato aparece.
function filterBar(state) {
  const agentes = uniqueAgents(state.allItems);
  if (agentes.length < 2) return '';

  const opcoes = [{ id: null, rotulo: 'all' }, ...agentes.map((id) => ({ id, rotulo: id }))];
  const plano = `  ${opcoes.map((o) => (state.agentFilter === o.id ? `[${o.rotulo}]` : ` ${o.rotulo} `)).join(' ')}`;

  if (plano.length > state.columns) return truncate(plano, state.columns);

  const colorido = opcoes
    .map((o) =>
      state.agentFilter === o.id
        ? paint(state, ANSI.bold + ANSI.cyan, `[${o.rotulo}]`)
        : paint(state, ANSI.dim, ` ${o.rotulo} `)
    )
    .join(' ');

  return `  ${colorido}`;
}

// Abaixo disso nao ha coluna sobrando pro painel - so lado a lado por
// enquanto, sem o modo empilhado que o fast-resume usa em tela estreita (v1
// deliberadamente mais simples: um layout so, ligado ou desligado).
const PREVIEW_BREAKPOINT = 116;
const PREVIEW_RATIO = 0.62;

function previewActive(state) {
  return state.previewOn && state.columns >= PREVIEW_BREAKPOINT;
}

// Codigo ANSI nao ocupa coluna visivel - contar o comprimento da string crua
// preencheria de menos toda linha colorida, desalinhando o painel a direita.
function visibleLength(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

// Corta pelo comprimento VISIVEL, preservando os codigos ANSI que vierem
// antes do corte, e fecha com reset - sem isso, cortar no meio de um trecho
// colorido deixaria a cor vazar pro divisor e pro painel da direita.
function truncateVisible(state, str, width) {
  let visCount = 0;
  let out = '';
  let i = 0;

  while (i < str.length && visCount < Math.max(0, width - 1)) {
    if (str[i] === '\x1b') {
      const resto = str.slice(i);
      const m = /^\x1b\[[0-9;]*m/.exec(resto);
      if (m) {
        out += m[0];
        i += m[0].length;
        continue;
      }
    }
    out += str[i];
    visCount++;
    i++;
  }

  return out + '…' + (state.color ? ANSI.reset : '');
}

// A lista renderiza pensando na largura TOTAL do terminal - com o painel
// ativo, cada linha precisa caber so na fatia esquerda, nao na tela inteira.
// Sem cortar aqui, um titulo comprido estoura a coluna e desalinha tudo que
// vem depois dele (confirmado ao vivo: titulo longo do Codex quebrava a
// linha e empurrava o divisor para fora de posicao).
function padVisible(state, str, width) {
  const vis = visibleLength(str);
  if (vis > width) return truncateVisible(state, str, width);
  return vis >= width ? str : str + ' '.repeat(width - vis);
}

function previewHeader(state, item) {
  if (!item) return [];
  return [
    paint(state, ANSI.bold + ANSI.cyan, `${item.agent} · ${item.title || item.summary}`),
    paint(state, ANSI.dim, `${item.dir} · ${item.age}`),
    '',
  ];
}

// previewLines: undefined = ainda carregando; null = agente sem previa
// disponivel; array vazio = sessao sem mensagem nenhuma; array = conteudo.
function previewBody(state, previewLines) {
  if (previewLines === undefined) return [paint(state, ANSI.dim, t('preview.loading'))];
  if (previewLines === null) return [paint(state, ANSI.dim, t('preview.unavailable'))];
  if (previewLines.length === 0) return [paint(state, ANSI.dim, t('preview.empty'))];
  return previewLines;
}

// A altura do bloco combinado segue SEMPRE a lista (leftLines), nunca o
// preview - do contrario uma previa longa esticaria o quadro pra alem do
// que o terminal comporta. Sem scroll no v1: o que nao coube so nao aparece.
function composeSideBySide(state, leftLines, rightLines, leftWidth, rightWidth) {
  const divisor = paint(state, ANSI.dim, '│');
  return leftLines.map((esquerda, i) => {
    const direitaBruta = rightLines[i] || '';
    const direita =
      direitaBruta.length > rightWidth ? `${direitaBruta.slice(0, Math.max(1, rightWidth - 1))}…` : direitaBruta;
    return `${padVisible(state, esquerda, leftWidth)} ${divisor} ${direita}`;
  });
}

// O corpo (lista + preview) ganha uma moldura propria, separada da caixa de
// busca - mesma conta de largura que a caixa de busca ja usa (borda inclusa
// cabe em columns-4). Sem essa moldura, o divisor do preview ficava
// "flutuando" sem nada delimitando onde a lista termina.
function bodyBorder(bodyWidth, meio) {
  const preenchido =
    meio == null ? '─'.repeat(bodyWidth) : `${'─'.repeat(meio)}┬${'─'.repeat(bodyWidth - meio - 1)}`;
  return { topo: `  ┌${preenchido}┐`, fundo: `  └${preenchido.replace('┬', '┴')}┘` };
}

// Sobrepoe a tela inteira (nada de lista, preview ou busca por baixo) pra
// deixar claro que nenhuma outra tecla funciona ate essa pergunta ser
// respondida - evita mandar mensagem sem querer so porque a lista continuou
// visivel e o dedo escorregou numa tecla qualquer.
function renderConfirmSend(state) {
  const n = state.confirmSend.pending.items.length;
  const alvo = n === 1 ? 'essa sessao que vai abrir' : `essas ${n} sessoes que vao abrir`;
  const linhas = [
    `Mandar essa mensagem pra ${alvo}?`,
    '',
    `"${state.sendPrompt}"`,
    '',
    '[Enter] Nao (padrao)    [S] Sim    [Esc] cancelar',
  ];
  const largura = Math.min(Math.max(...linhas.map((l) => l.length)) + 4, Math.max(20, state.columns - 4));
  const corpo = linhas.map((l) => `  │ ${l.padEnd(largura - 2)} │`);

  return [
    '',
    paint(state, ANSI.dim, `  ┌${'─'.repeat(largura)}┐`),
    ...corpo,
    paint(state, ANSI.dim, `  └${'─'.repeat(largura)}┘`),
    '',
  ].join('\n');
}

function render(state, previewLines) {
  if (state.confirmSend) return renderConfirmSend(state);

  const { items, index, offset, viewport, columns } = state;
  const width = Math.max(24, columns - 4); // moldura inteira (bordas inclusas), como a caixa de busca
  const bodyWidth = width - 2; // area util dentro das bordas
  const bodyState = { ...state, columns: bodyWidth };
  const lines = ['', header(state), '', ...searchBox(state), filterBar(state), ''];

  const corpo = [];
  if (items.length === 0) {
    corpo.push(paint(bodyState, ANSI.dim, '  ' + t(state.query ? 'ui.empty.search' : 'ui.empty.scope')));
  } else {
    corpo.push(offset > 0 ? paint(bodyState, ANSI.dim, '  ' + t('ui.scroll.up', { n: offset })) : '');

    const end = Math.min(offset + viewport, items.length);
    const widths = columnWidths(items.slice(offset, end));
    for (let i = offset; i < end; i++) corpo.push(...renderItem(bodyState, items[i], i === index, widths));

    const abaixo = items.length - end;
    corpo.push(abaixo > 0 ? paint(bodyState, ANSI.dim, '  ' + t('ui.scroll.down', { n: abaixo })) : '');
  }

  let miolo = corpo;
  let meio = null;
  if (previewActive(state) && items.length > 0) {
    const largura = bodyWidth - 3; // 3 = " │ "
    const leftWidth = Math.floor(largura * PREVIEW_RATIO);
    const rightWidth = largura - leftWidth;
    const painel = [...previewHeader(bodyState, items[index]), ...previewBody(bodyState, previewLines)];

    miolo = composeSideBySide(bodyState, corpo, painel, leftWidth, rightWidth);
    meio = leftWidth + 1; // posicao do divisor "│" dentro da linha, pro topo/fundo alinharem com "┬"/"┴"
  }

  const borda = bodyBorder(bodyWidth, meio);
  // O "│" de cada linha fica sem cor propria (diferente do topo/fundo, que
  // saem inteiros em dim) - colori-lo aqui contaminaria qualquer checagem de
  // "esse campo nao devia ter dim" na linha, ja que o pipe compartilha a
  // mesma string do conteudo.
  const moldura = '│';
  lines.push(
    paint(state, ANSI.dim, borda.topo),
    ...miolo.map((linha) => `  ${moldura}${padVisible(bodyState, linha, bodyWidth)}${moldura}`),
    paint(state, ANSI.dim, borda.fundo)
  );

  lines.push('', footer(state));
  return lines.join('\n');
}

module.exports = {
  createState,
  applyKey,
  render,
  move,
  syncOffset,
  setQuery,
  toggleScope,
  inScope,
  toggleMark,
  markAndAdvance,
  markedRefs,
  uniqueAgents,
  cycleAgentFilter,
  filterItems,
  normalize,
  ANSI,
  PREVIEW_BREAKPOINT,
  previewActive,
  visibleLength,
};
