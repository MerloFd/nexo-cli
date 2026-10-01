// Estado e render puros da tela interativa do "nexo scan" - mesma separacao
// do selector.js: nada aqui toca arquivo, terminal ou I/O. O loop de teclado
// e a redacao de verdade ficam em src/scan/interactive.js.
const { ANSI, MARKER_SELECTED, padVisible } = require('./selector');
const { t } = require('./i18n');

// So achado de alta confianca numa sessao do Claude entra na lista
// selecionavel - mesma fronteira de seguranca que "--redact" ja respeita
// (ver src/commands/scan.js: redactCandidates). O resto (media/baixa
// confianca, ou alta confianca num agente que o redact ainda nao cobre)
// aparece so pra revisar, nunca selecionavel.
function flattenFindings(results) {
  const rows = [];

  for (const r of results) {
    for (const f of r.findings) {
      rows.push({
        key: `${r.sessionId}|${f.rule}|${f.masked}`,
        sessionId: r.sessionId,
        title: r.title || r.sessionId.slice(0, 8),
        agent: r.agent,
        dir: r.dir,
        mtime: r.mtime,
        filePath: r.filePath,
        rule: f.rule,
        label: f.label,
        confidence: f.confidence,
        masked: f.masked,
        occurrences: f.occurrences,
        firstLine: f.firstLine,
        redactable: r.agent === 'claude' && f.confidence === 'alta',
      });
    }
  }

  const peso = { alta: 0, media: 1, baixa: 2 };
  return rows.sort((a, b) => peso[a.confidence] - peso[b.confidence] || b.mtime - a.mtime);
}

function createState(rows, { columns = 80, viewport = 10, color = true } = {}) {
  return {
    rows,
    index: 0,
    offset: 0,
    viewport: Math.max(1, viewport),
    columns: Math.max(20, columns),
    color,
    marked: new Set(),
    confirmRedact: null,
  };
}

function syncOffset(state) {
  const { index, viewport, rows } = state;
  let offset = state.offset;
  const maxOffset = Math.max(0, rows.length - viewport);

  if (index < offset) offset = index;
  if (index >= offset + viewport) offset = index - viewport + 1;

  return { ...state, offset: Math.min(Math.max(0, offset), maxOffset) };
}

function move(state, delta) {
  const total = state.rows.length;
  if (total === 0) return state;
  const index = Math.min(Math.max(0, state.index + delta), total - 1);
  return syncOffset({ ...state, index });
}

function toggleMark(state, key) {
  const row = state.rows.find((r) => r.key === key);
  if (!row || !row.redactable) return state;

  const marked = new Set(state.marked);
  if (marked.has(key)) marked.delete(key);
  else marked.add(key);
  return { ...state, marked };
}

// Tab marca (se der) e avanca sempre - deixa passar direto por linha que nao
// e selecionavel em vez de travar a navegacao nela.
function markAndAdvance(state) {
  const atual = state.rows[state.index];
  const marcado = atual ? toggleMark(state, atual.key) : state;
  return move(marcado, 1);
}

function targetKeys(state) {
  if (state.marked.size > 0) return [...state.marked];
  const atual = state.rows[state.index];
  return atual && atual.redactable ? [atual.key] : [];
}

function applyKeyDuringConfirm(state, key) {
  const name = key.name || '';
  const seq = key.sequence || '';
  const limpo = { ...state, confirmRedact: null };

  if (name === 'escape') return { state: limpo, action: 'move' };
  if (seq === 's' || seq === 'S') return { state: limpo, action: 'redact', keys: state.confirmRedact.keys };
  if (name === 'return' || name === 'enter' || seq === '\r' || seq === '\n' || seq === 'n' || seq === 'N') {
    return { state: limpo, action: 'move' };
  }
  return { state, action: 'none' };
}

function applyKey(state, key = {}) {
  const name = key.name || '';

  if (key.ctrl && (name === 'c' || name === 'd')) return { state, action: 'cancel' };
  if (state.confirmRedact) return applyKeyDuringConfirm(state, key);

  if (name === 'escape') return { state, action: 'cancel' };
  if (name === 'up') return { state: move(state, -1), action: 'move' };
  if (name === 'down') return { state: move(state, 1), action: 'move' };
  if (name === 'tab') return { state: markAndAdvance(state), action: 'move' };

  if (name === 'return' || name === 'enter') {
    const keys = targetKeys(state);
    if (keys.length === 0) return { state, action: 'none' };
    return { state: { ...state, confirmRedact: { keys } }, action: 'move' };
  }

  return { state, action: 'none' };
}

function paint(state, code, text) {
  return state.color ? `${code}${text}${ANSI.reset}` : text;
}

const CONFIDENCE_COLOR = { alta: ANSI.red, media: ANSI.yellow, baixa: ANSI.dim };
const CONFIDENCE_TAG = { alta: 'scan.tag.alta', media: 'scan.tag.media', baixa: 'scan.tag.baixa' };

function renderRow(state, row, selecionado) {
  const marcador = state.marked.has(row.key) ? '✓ ' : selecionado ? MARKER_SELECTED : '  ';
  const tagPlano = t(CONFIDENCE_TAG[row.confidence]).padEnd(5);
  const vezes = row.occurrences > 1 ? ` (${row.occurrences}x)` : '';
  const metaPlano = `      ${row.agent} · ${row.title} · ${t('scan.lineLabel', { n: row.firstLine })}`;

  if (!selecionado) {
    const tag = paint(state, CONFIDENCE_COLOR[row.confidence], tagPlano);
    const texto = `${marcador}${tag}  ${row.label.padEnd(28)}  ${row.masked.padEnd(14)}${vezes}`.trimEnd();
    return [texto, paint(state, ANSI.dim, metaPlano)];
  }

  // Linha selecionada vira barra inteira (reverse video) - precisa montar o
  // texto PLANO primeiro (tag sem cor propria ainda) pra padEnd ir ate a
  // borda antes de pintar, senao a barra para onde o texto acaba.
  const textoPlano = `${marcador}${tagPlano}  ${row.label.padEnd(28)}  ${row.masked.padEnd(14)}${vezes}`.trimEnd();
  const texto = paint(state, ANSI.reverse + ANSI.bold + ANSI.cyan, padVisible(state, textoPlano, state.columns));
  const meta = paint(state, ANSI.reverse + ANSI.cyan, padVisible(state, metaPlano, state.columns));
  return [texto, meta];
}

function renderConfirm(state) {
  const n = state.confirmRedact.keys.length;
  const linhas = [t('scan.interactive.confirmQuestion', { n }), '', t('ui.confirm.options')];
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

function render(state) {
  if (state.confirmRedact) return renderConfirm(state);

  const { rows, index, offset, viewport, marked } = state;
  const lines = ['', paint(state, ANSI.bold, `  ${t('scan.interactive.header', { n: marked.size })}`), ''];

  if (rows.length === 0) {
    lines.push(paint(state, ANSI.dim, `  ${t('scan.clean')}`));
  } else {
    if (offset > 0) lines.push(paint(state, ANSI.dim, '  ' + t('ui.scroll.up', { n: offset })));
    const end = Math.min(offset + viewport, rows.length);
    for (let i = offset; i < end; i++) lines.push(...renderRow(state, rows[i], i === index));
    const abaixo = rows.length - end;
    if (abaixo > 0) lines.push(paint(state, ANSI.dim, '  ' + t('ui.scroll.down', { n: abaixo })));
  }

  lines.push('');
  lines.push(paint(state, ANSI.dim, `  ${t('scan.interactive.footer')}`));

  return lines.join('\n');
}

module.exports = {
  flattenFindings,
  createState,
  applyKey,
  move,
  toggleMark,
  markAndAdvance,
  render,
};
