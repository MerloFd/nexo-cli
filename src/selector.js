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

function matches(item, terms) {
  const haystack = normalize(`${item.dir} ${item.sessionId} ${item.summary}`);
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
    mode: 'nav',
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

function applyKey(state, key = {}) {
  const name = key.name || '';
  const seq = key.sequence || '';

  if (key.ctrl && (name === 'c' || name === 'd')) return { state, action: 'cancel' };
  if (name === 'return' || name === 'enter' || seq === '\r' || seq === '\n') {
    return selectOrNothing(state);
  }

  const navigated = navigationFor(state, key);
  if (navigated) return navigated;

  if (state.mode === 'filter') {
    if (name === 'escape') {
      return { state: { ...setQuery(state, ''), mode: 'nav' }, action: 'move' };
    }
    if (key.ctrl && name === 'u') {
      return { state: setQuery(state, ''), action: 'move' };
    }
    if (name === 'backspace') {
      if (state.query.length === 0) return { state: { ...state, mode: 'nav' }, action: 'move' };
      return { state: setQuery(state, state.query.slice(0, -1)), action: 'move' };
    }
    if (isPrintable(key)) {
      return { state: setQuery(state, state.query + seq), action: 'move' };
    }
    return { state, action: 'none' };
  }

  if (seq === '/') return { state: { ...state, mode: 'filter' }, action: 'move' };

  switch (name) {
    case 'k':
    case 'w':
      return { state: move(state, -1, { wrap: true }), action: 'move' };
    case 'j':
    case 's':
      return { state: move(state, 1, { wrap: true }), action: 'move' };
    case 'escape':
    case 'q':
      return { state, action: 'cancel' };
    default:
      return { state, action: 'none' };
  }
}

function truncate(text, columns) {
  if (text.length <= columns) return text;
  return `${text.slice(0, Math.max(1, columns - 1))}…`;
}

function paint(state, code, text) {
  if (!state.color) return text;
  return `${code}${text}${ANSI.reset}`;
}

function hintFor(state) {
  if (state.mode === 'filter') {
    return 'digite para filtrar   setas mover   Enter abrir   Esc limpar';
  }
  return 'W/S ou setas mover   / filtrar   Enter abrir   Esc sair';
}

function filterLine(state) {
  if (state.mode !== 'filter' && !state.query) return '';

  const cursor = state.mode === 'filter' ? '█' : '';
  const label = `  / ${state.query}${cursor}`;
  const count = `${state.items.length} de ${state.allItems.length}`;
  const gap = Math.max(1, state.columns - label.length - count.length - 2);

  return paint(state, ANSI.yellow, truncate(`${label}${' '.repeat(gap)}${count}`, state.columns));
}

function render(state) {
  const { items, index, offset, viewport, columns, allItems } = state;
  const lines = [];

  lines.push(paint(state, ANSI.dim, truncate(`  ${allItems.length} sessao(oes)   ${hintFor(state)}`, columns)));
  lines.push(filterLine(state));
  lines.push('');

  if (items.length === 0) {
    lines.push(paint(state, ANSI.dim, '  nenhuma sessao corresponde ao filtro'));
    return lines.join('\n');
  }

  lines.push(offset > 0 ? paint(state, ANSI.dim, `  ^ mais ${offset} acima`) : '');

  const end = Math.min(offset + viewport, items.length);
  for (let i = offset; i < end; i++) {
    const item = items[i];
    const selected = i === index;
    const marker = selected ? '> ' : '  ';
    const head = `${marker}${item.dir}   ${item.sessionId.slice(0, 8)}   ${item.age}`;
    const body = `      ${item.summary}`;

    lines.push(
      selected
        ? paint(state, ANSI.bold + ANSI.cyan, truncate(head, columns))
        : truncate(head, columns)
    );
    lines.push(paint(state, ANSI.dim, truncate(body, columns)));
  }

  const below = items.length - end;
  lines.push(below > 0 ? paint(state, ANSI.dim, `  v mais ${below} abaixo`) : '');

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
