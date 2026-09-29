const readline = require('readline');
const { createState, applyKey, renderDashboard, syncOffset, rowsFor } = require('../usageState');

const ALT_SCREEN_ON = '\x1b[?1049h';
const ALT_SCREEN_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';
const CLEAR = '\x1b[H\x1b[2J';

// Resumo (~7 linhas) + titulo do bloco de dias (2) + espacos e rodape (3) -
// linhas fixas fora da lista navegavel. Cada linha de dia/semana ocupa DUAS
// linhas de tela agora (a propria linha + um respiro em branco), daí o /2 -
// sem ele o viewport calculado estoura a altura real do terminal (mesmo bug
// corrigido em src/scan/interactive.js).
function viewportFor(rows) {
  return Math.max(1, Math.floor(((rows || 24) - 12) / 2));
}

// Mesmo loop de tela alternativa + raw mode do seletor de sessoes
// (src/pick.js) - dashboard diferente, mecanismo de teclado igual.
function runDashboard(samples, { periodo = 'dia' } = {}) {
  const out = process.stdout;
  let state = createState(samples, {
    periodo,
    columns: out.columns || 80,
    viewport: viewportFor(out.rows),
    color: !process.env.NO_COLOR,
  });

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);

    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    out.write(ALT_SCREEN_ON + CURSOR_HIDE);

    const draw = () => out.write(CLEAR + renderDashboard(state));
    draw();

    const onResize = () => {
      state = syncOffset(
        { ...state, columns: Math.max(20, out.columns || 80), viewport: viewportFor(out.rows) },
        rowsFor(state.samples, state.periodo).length
      );
      draw();
    };

    const finish = () => {
      process.stdin.removeListener('keypress', onKeypress);
      out.removeListener('resize', onResize);
      out.write(CURSOR_SHOW + ALT_SCREEN_OFF);
      if (process.stdin.isTTY) process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      resolve();
    };

    function onKeypress(_str, key) {
      const { state: next, action } = applyKey(state, key || {});
      state = next;

      if (action === 'cancel') return finish();
      if (action === 'move') draw();
    }

    process.stdin.on('keypress', onKeypress);
    out.on('resize', onResize);
  });
}

module.exports = { runDashboard, viewportFor };
