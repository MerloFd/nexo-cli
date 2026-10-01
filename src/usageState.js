// Estado e render puros do dashboard interativo do "nexo usage" - mesma
// separacao do selector.js: nada aqui toca arquivo, terminal ou I/O, so
// transforma estado em texto. O loop de teclado de verdade fica em
// src/usage/interactive.js.
const { agrupar, tabela, resumo, human, bar, diaDe, semanaDe } = require('./usage/report');
const { emptyTotals, addTotals, totalOf } = require('./usage/collect');
const { ANSI } = require('./selector');
const { t } = require('./i18n');

function rowsFor(samples, periodo) {
  const porChave = periodo === 'semana' ? semanaDe : diaDe;
  return agrupar(samples, (s) => porChave(s.at)).sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function grandTotalOf(samples) {
  return totalOf(samples.reduce((acc, s) => addTotals(acc, s.totals), emptyTotals()));
}

function createState(samples, { periodo = 'dia', columns = 80, color = true, viewport = 10 } = {}) {
  return {
    samples,
    periodo,
    columns: Math.max(20, columns),
    color,
    index: 0,
    offset: 0,
    viewport: Math.max(1, viewport),
    drillKey: null,
  };
}

// Mesma logica do selector.js: mantem o item destacado sempre dentro da
// janela visivel, arrastando o offset so o minimo necessario. Sem isso, uma
// lista de dias mais longa que o terminal empurraria o resumo e o rodape
// pra fora da tela (confirmado ao vivo com ~5 meses de historico).
function syncOffset(state, totalRows) {
  let offset = state.offset;
  const maxOffset = Math.max(0, totalRows - state.viewport);

  if (state.index < offset) offset = state.index;
  if (state.index >= offset + state.viewport) offset = state.index - state.viewport + 1;

  return { ...state, offset: Math.min(Math.max(0, offset), maxOffset) };
}

function move(state, delta) {
  const rows = rowsFor(state.samples, state.periodo);
  if (rows.length === 0) return state;
  const index = Math.min(Math.max(0, state.index + delta), rows.length - 1);
  return syncOffset({ ...state, index }, rows.length);
}

// Troca dia<->semana zera o indice e o offset: uma linha destacada num
// agrupamento nao tem correspondente obvio no outro.
function togglePeriodo(state) {
  return { ...state, periodo: state.periodo === 'semana' ? 'dia' : 'semana', index: 0, offset: 0 };
}

// Enter sobre uma linha do dia/semana filtra tudo pra aquele recorte -
// Esc desfaz. So funciona destacando uma linha de verdade: lista vazia
// (sem uso registrado) nao tem o que detalhar.
function drillIn(state) {
  const rows = rowsFor(state.samples, state.periodo);
  const row = rows[state.index];
  if (!row) return state;
  return { ...state, drillKey: row.key };
}

function drillOut(state) {
  return { ...state, drillKey: null };
}

function applyKey(state, key = {}) {
  const name = key.name || '';

  if (key.ctrl && (name === 'c' || name === 'd')) return { state, action: 'cancel' };

  if (name === 'escape') {
    if (state.drillKey) return { state: drillOut(state), action: 'move' };
    return { state, action: 'cancel' };
  }

  if (name === 'return' || name === 'enter') {
    if (state.drillKey) return { state, action: 'none' };
    return { state: drillIn(state), action: 'move' };
  }

  if (name === 'tab') return { state: togglePeriodo(state), action: 'move' };
  if (name === 'up') return { state: move(state, -1), action: 'move' };
  if (name === 'down') return { state: move(state, 1), action: 'move' };

  return { state, action: 'none' };
}

function paint(state, code, text) {
  return state.color ? `${code}${text}${ANSI.reset}` : text;
}

// Cada linha do dia/semana vira uma barra navegavel, igual a lista principal:
// "> " (destacado, colorido) ou dois espacos, rotulo, total humanizado, a
// barra proporcional (comparando linhas ENTRE SI) e o percentual do total
// geral (comparando contra o TODO - sem isso, uma barra cheia so dizia "esse
// dia foi o maior", nunca "esse dia foi 8% do mes"). So a fatia dentro do
// viewport entra na tela - o resto vira indicador de rolagem.
function renderRows(state, rows, grandTotal) {
  const { offset, viewport } = state;
  const max = Math.max(1, ...rows.map((r) => r.total));
  const fim = Math.min(offset + viewport, rows.length);

  const linhas = [];
  if (offset > 0) linhas.push(paint(state, ANSI.dim, `  ↑ ${offset} above`));

  for (let i = offset; i < fim; i++) {
    const r = rows[i];
    const selecionado = i === state.index;
    const marcador = selecionado ? '> ' : '  ';
    const barra = bar(r.total, max).padEnd(25);
    const pct =
      grandTotal > 0 ? `  ${`${Math.round((r.total / grandTotal) * 100)}%`.padStart(4)} ${t('usage.ofTotal')}` : '';
    const linha = `${marcador}${String(r.key).padEnd(12)}  ${human(r.total).padStart(6)}  ${barra}${pct}`.trimEnd();
    linhas.push(selecionado ? paint(state, ANSI.bold + ANSI.cyan, linha) : linha);
    linhas.push(''); // respiro entre linhas - sem isso as barras ficavam coladas umas nas outras
  }

  const abaixo = rows.length - fim;
  if (abaixo > 0) linhas.push(paint(state, ANSI.dim, `  ↓ ${abaixo} below`));

  return linhas;
}

function renderDrill(state) {
  const { samples, periodo, drillKey } = state;
  const porChave = periodo === 'semana' ? semanaDe : diaDe;
  const escopo = samples.filter((s) => porChave(s.at) === drillKey);
  const grandTotal = grandTotalOf(escopo);

  const linhas = [
    paint(state, ANSI.bold, `  ${drillKey}`),
    '',
    ...resumo(escopo),
    ...tabela(agrupar(escopo, (s) => s.agent), { titulo: t('usage.byAgent'), grandTotal }),
    ...tabela(agrupar(escopo, (s) => s.model), { titulo: t('usage.byModel'), grandTotal }),
    ...tabela(agrupar(escopo, (s) => s.dir), { titulo: t('usage.byProject'), limite: 10, grandTotal }),
    paint(state, ANSI.dim, `  ${t('usage.dashboard.backToRange')}`),
  ];

  return linhas.join('\n');
}

// Tela principal: resumo global + a lista navegavel de dias/semanas. Enter
// numa linha entra no detalhe daquele recorte (renderDrill); fora disso, o
// dashboard e so essa lista - By agent/model/project globais continuam
// disponiveis no relatorio estatico (`--json` ou saida nao interativa).
function renderDashboard(state) {
  if (state.drillKey) return renderDrill(state);

  const { samples, periodo } = state;
  const rows = rowsFor(samples, periodo);

  const linhas = [
    ...resumo(samples),
    t(periodo === 'semana' ? 'usage.byWeek' : 'usage.byDay'),
    '',
  ];

  if (rows.length === 0) {
    linhas.push(paint(state, ANSI.dim, `  ${t('usage.empty')}`));
  } else {
    linhas.push(...renderRows(state, rows, grandTotalOf(samples)));
  }

  linhas.push('');
  linhas.push(paint(state, ANSI.dim, `  ${t('usage.dashboard.footer')}`));

  return linhas.join('\n');
}

module.exports = {
  createState,
  applyKey,
  move,
  syncOffset,
  togglePeriodo,
  drillIn,
  drillOut,
  rowsFor,
  renderDashboard,
};
