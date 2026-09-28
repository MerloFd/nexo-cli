const readline = require('readline');
const { PassThrough } = require('stream');
const { daysAgo } = require('./scanSessions');
const { createState, applyKey, render, syncOffset, markAndAdvance } = require('./selector');
const { extractCtrlEnter } = require('./ctrlEnter');
const { openSession } = require('./backends');

const ALT_SCREEN_ON = '\x1b[?1049h';
const ALT_SCREEN_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';
const CLEAR = '\x1b[H\x1b[2J';

function toRows(sessions) {
  return sessions.map((s) => ({
    dir: s.dir,
    sessionId: s.sessionId,
    agent: s.agent,
    age: daysAgo(s.mtime),
    mtime: s.mtime,
    branch: s.branch || null,
    bytes: s.bytes || null,
    tokens: s.tokens || null,
    tokensKind: s.tokensKind || null,
    title: s.title || null,
    summary: s.summary,
    ref: s,
  }));
}

// linha em branco + cabecalho + linha em branco + caixa de busca (3) + abas
// de agente + indicadores de rolagem (2) + linha em branco + rodape = 12
// linhas fixas fora da lista (a linha de abas sempre ocupa espaco, mesmo
// vazia com um agente so - ver comentario em selector.js/filterBar)
function viewportFor(rows) {
  return Math.max(1, Math.floor(((rows || 24) - 12) / 2));
}

// Abre uma sessao marcada como parte do lote final, disparado pelo Enter.
function openInBatch(session) {
  try {
    const { backend, failures } = openSession(session);
    return { session, backend, failures };
  } catch (err) {
    return { session, backend: null, failures: [err.message] };
  }
}

function pickInteractive(sessions) {
  const rows = toRows(sessions);
  const out = process.stdout;
  const batch = [];

  let state = createState(rows, {
    viewport: viewportFor(out.rows),
    columns: out.columns || 80,
    color: !process.env.NO_COLOR,
    cwd: process.cwd(),
  });

  return new Promise((resolve) => {
    // O Windows Terminal manda Ctrl+Enter como sequencia de escape que o
    // decodificador padrao do readline nao entende (ver src/ctrlEnter.js).
    // Por isso os bytes crus passam primeiro por um filtro proprio, e so o
    // que sobra chega ao decodificador de teclas, via este stream intermediario.
    const decoded = new PassThrough();
    readline.emitKeypressEvents(decoded);

    let carry = '';
    function onRawData(chunk) {
      const found = extractCtrlEnter(chunk.toString('latin1'), carry);
      carry = found.carry;
      for (let i = 0; i < found.hits; i++) {
        state = markAndAdvance(state);
        draw();
      }
      if (found.remainder) decoded.write(Buffer.from(found.remainder, 'latin1'));
    }

    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    out.write(ALT_SCREEN_ON + CURSOR_HIDE);

    const draw = () => out.write(CLEAR + render(state));
    draw();

    const onResize = () => {
      state = syncOffset({
        ...state,
        viewport: Math.max(1, viewportFor(out.rows)),
        columns: Math.max(20, out.columns || 80),
      });
      draw();
    };

    const finish = (result) => {
      process.stdin.removeListener('data', onRawData);
      decoded.removeListener('keypress', onKeypress);
      out.removeListener('resize', onResize);
      out.write(CURSOR_SHOW + ALT_SCREEN_OFF);
      if (process.stdin.isTTY) process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      resolve({ chosen: result, batch });
    };

    function onKeypress(_str, key) {
      const { state: next, action, items } = applyKey(state, key || {});
      state = next;

      if (action === 'cancel') return finish(null);
      if (action === 'select') return finish(state.items[state.index].ref);
      if (action === 'open-batch') {
        for (const session of items) batch.push(openInBatch(session));
        return finish(null);
      }
      if (action === 'move') draw();
    }

    process.stdin.on('data', onRawData);
    decoded.on('keypress', onKeypress);
    out.on('resize', onResize);
  });
}

function printPlainList(sessions) {
  const width = Math.max(40, (process.stdout.columns || 100) - 6);
  sessions.forEach((s, i) => {
    const idx = String(i + 1).padStart(2, ' ');
    const label = s.title || s.summary;
    const summary = label.length > width ? `${label.slice(0, width - 1)}…` : label;
    console.log(`${idx}) ${s.dir}   ${s.sessionId.slice(0, 8)}   ${daysAgo(s.mtime)}`);
    console.log(`      ${summary}`);
  });
}

function pickNonInteractive(sessions) {
  printPlainList(sessions);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve, reject) => {
    rl.question('\nEscolha o numero (Enter cancela): ', (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (!trimmed) return resolve({ chosen: null, batch: [] });

      const idx = Number(trimmed) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= sessions.length) {
        return reject(new Error(`Opcao invalida: ${trimmed}`));
      }
      resolve({ chosen: sessions[idx], batch: [] });
    });
  });
}

function pickSession(sessions) {
  if (process.stdin.isTTY && process.stdout.isTTY) return pickInteractive(sessions);
  return pickNonInteractive(sessions);
}

module.exports = { pickSession, printPlainList, toRows, viewportFor };
