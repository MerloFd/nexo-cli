const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
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

function createState(items, { viewport = 10, columns = 80, color = true } = {}) {
  return {
    allItems: items,
    items,
    index: 0,
    offset: 0,
    viewport: Math.max(1, viewport),
    columns: Math.max(20, columns),
    color,
    query: '',
  };
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

function setQuery(state, query) {
  const items = filterItems(state.allItems, query);
  return { ...state, query, items, index: 0, offset: 0 };
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

function selectOrNothing(state) {
  if (state.items.length === 0) return { state, action: 'none' };
  return { state, action: 'select' };
}

// A busca esta sempre ativa: qualquer caractere imprimivel vai para o termo,
// como no /resume do Claude Code. Por isso a navegacao fica nas setas - letra
// nenhuma pode ser atalho, ou seria impossivel buscar por ela.
function applyKey(state, key = {}) {
  const name = key.name || '';
  const seq = key.sequence || '';

  if (key.ctrl && (name === 'c' || name === 'd')) return { state, action: 'cancel' };
  if (name === 'return' || name === 'enter' || seq === '\r' || seq === '\n') {
    return selectOrNothing(state);
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

function metaLine(item) {
  return [
    item.agent,
    item.age,
    item.branch,
    formatBytes(item.bytes),
    formatTokens(item.tokens, item.tokensKind),
  ]
    .filter(Boolean)
    .join(' · ');
}

function renderItem(state, item, selected) {
  const marker = selected ? '> ' : '  ';
  const label = item.title || item.summary;
  const head = truncate(`${marker}${label}`, state.columns);
  const meta = truncate(`    ${metaLine(item)}`, state.columns);

  return [
    selected ? paint(state, ANSI.bold + ANSI.cyan, head) : head,
    paint(state, ANSI.dim, meta),
  ];
}

function paint(state, code, text) {
  if (!state.color) return text;
  return `${code}${text}${ANSI.reset}`;
}

function header(state) {
  const posicao = state.items.length ? state.index + 1 : 0;
  return paint(
    state,
    ANSI.bold,
    truncate(`  Sessoes (${posicao} de ${state.items.length})`, state.columns)
  );
}

// Caixa de busca sempre visivel, como no /resume: o usuario digita direto,
// sem prefixo, e ve o termo enquanto a lista encolhe embaixo.
function searchBox(state) {
  const width = Math.max(24, Math.min(state.columns - 4, 100));
  const inner = width - 2;
  const conteudo = state.query ? `${state.query}█` : 'Search…';
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
  const dica = state.query
    ? 'setas mover   Enter abrir   Esc limpa a busca'
    : 'digite para buscar   setas mover   Enter abrir   Esc sair';
  return paint(state, ANSI.dim, truncate(`  ${dica}`, state.columns));
}

function render(state) {
  const { items, index, offset, viewport, columns } = state;
  const lines = [header(state), ...searchBox(state)];

  if (items.length === 0) {
    lines.push('', paint(state, ANSI.dim, '  nenhuma sessao corresponde a busca'), '', footer(state));
    return lines.join('\n');
  }

  lines.push(offset > 0 ? paint(state, ANSI.dim, `  ↑ mais ${offset} acima`) : '');

  const end = Math.min(offset + viewport, items.length);
  for (let i = offset; i < end; i++) {
    lines.push(...renderItem(state, items[i], i === index));
  }

  const abaixo = items.length - end;
  lines.push(abaixo > 0 ? paint(state, ANSI.dim, `  ↓ mais ${abaixo} abaixo`) : '');
  lines.push(footer(state));

  return lines.join('\n');
}

module.exports = {
  createState,
  applyKey,
  render,
  move,
  syncOffset,
  setQuery,
  filterItems,
  normalize,
  ANSI,
};
