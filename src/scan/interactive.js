const readline = require('readline');
const { flattenFindings, createState, applyKey, render } = require('../scanState');
const { redactFile, isPossiblyActive } = require('./redact');

const ALT_SCREEN_ON = '\x1b[?1049h';
const ALT_SCREEN_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';
const CLEAR = '\x1b[H\x1b[2J';

// Cabecalho (3) + rodape (3) fixos fora da lista navegavel, e cada achado
// ocupa DUAS linhas de tela (texto + meta), igual a lista de sessoes - sem
// dividir por 2, o viewport calculado sempre estourava a altura real do
// terminal com mais de uma duzia de achados, empurrando o cabecalho pra fora
// da tela e dando a impressao de que as setas nao faziam nada (confirmado
// ao vivo: com 101 achados reais, a tela so mostrava o rodape, sempre).
function viewportFor(rows) {
  return Math.max(1, Math.floor(((rows || 24) - 6) / 2));
}

// Agrupa as chaves selecionadas por arquivo - uma sessao pode ter varios
// achados marcados, e cada arquivo so deve ser reescrito uma vez. Sessao
// possivelmente ativa (mexida ha pouco) fica de fora, mesma protecao que
// "--redact" ja aplica.
function porArquivo(rows, keys) {
  const grupos = new Map();
  const puladas = [];

  for (const key of keys) {
    const row = rows.find((r) => r.key === key);
    if (!row) continue;

    if (!grupos.has(row.filePath)) grupos.set(row.filePath, { row, only: new Set() });
    grupos.get(row.filePath).only.add(`${row.rule}|${row.masked}`);
  }

  const alvo = [];
  for (const grupo of grupos.values()) {
    if (isPossiblyActive(grupo.row.mtime)) puladas.push(grupo.row);
    else alvo.push(grupo);
  }

  return { alvo, puladas };
}

// Campo "result" (nao "row") de proposito: mesmo formato que
// applyRedactions() ja produz em commands/scan.js, pra reusar
// printRedactReport sem duplicar a logica de impressao.
function applyRedaction(rows, keys) {
  const { alvo, puladas } = porArquivo(rows, keys);
  const feitas = alvo.map(({ row, only }) => ({ result: row, outcome: redactFile(row.filePath, { only }) }));
  return { feitas, puladas };
}

// Mesmo loop de tela alternativa + raw mode do seletor de sessoes e do
// dashboard de usage - so a tela e a acao final (redact) mudam.
function runInteractiveScan(results) {
  const rows = flattenFindings(results);
  const out = process.stdout;
  let state = createState(rows, {
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

    const draw = () => out.write(CLEAR + render(state));
    draw();

    const onResize = () => {
      state = { ...state, columns: Math.max(20, out.columns || 80), viewport: viewportFor(out.rows) };
      draw();
    };

    const finish = (redacted) => {
      process.stdin.removeListener('keypress', onKeypress);
      out.removeListener('resize', onResize);
      out.write(CURSOR_SHOW + ALT_SCREEN_OFF);
      if (process.stdin.isTTY) process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      resolve(redacted);
    };

    function onKeypress(_str, key) {
      const { state: next, action, keys } = applyKey(state, key || {});
      state = next;

      if (action === 'cancel') return finish(null);
      if (action === 'redact') return finish(applyRedaction(rows, keys));
      if (action === 'move') draw();
    }

    process.stdin.on('keypress', onKeypress);
    out.on('resize', onResize);
  });
}

module.exports = { runInteractiveScan, applyRedaction, viewportFor };
