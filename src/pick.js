const readline = require('readline');
const { daysAgo } = require('./scanSessions');
const { createState, applyKey, render, syncOffset } = require('./selector');

const ALT_SCREEN_ON = '\x1b[?1049h';
const ALT_SCREEN_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';
const CLEAR = '\x1b[H\x1b[2J';

function toRows(sessions) {
  return sessions.map((s) => ({
    dir: s.dir,
    sessionId: s.sessionId,
    age: daysAgo(s.mtime),
    summary: s.summary,
    ref: s,
  }));
}

function viewportFor(rows) {
  const available = (rows || 24) - 6;
  return Math.max(1, Math.floor(available / 2));
}

function pickInteractive(sessions) {
  const rows = toRows(sessions);
  const out = process.stdout;

  let state = createState(rows, {
    viewport: viewportFor(out.rows),
    columns: out.columns || 80,
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
      state = syncOffset({
        ...state,
        viewport: Math.max(1, viewportFor(out.rows)),
        columns: Math.max(20, out.columns || 80),
      });
      draw();
    };

    const finish = (result) => {
      process.stdin.removeListener('keypress', onKeypress);
      out.removeListener('resize', onResize);
      out.write(CURSOR_SHOW + ALT_SCREEN_OFF);
      if (process.stdin.isTTY) process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      resolve(result);
    };

    function onKeypress(_str, key) {
      const { state: next, action } = applyKey(state, key || {});
      state = next;

      if (action === 'cancel') return finish(null);
      if (action === 'select') return finish(state.items[state.index].ref);
      if (action === 'move') draw();
    }

    process.stdin.on('keypress', onKeypress);
    out.on('resize', onResize);
  });
}

function printPlainList(sessions) {
  const width = Math.max(40, (process.stdout.columns || 100) - 6);
  sessions.forEach((s, i) => {
    const idx = String(i + 1).padStart(2, ' ');
    const summary = s.summary.length > width ? `${s.summary.slice(0, width - 1)}…` : s.summary;
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
      if (!trimmed) return resolve(null);

      const idx = Number(trimmed) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= sessions.length) {
        return reject(new Error(`Opcao invalida: ${trimmed}`));
      }
      resolve(sessions[idx]);
    });
  });
}

function pickSession(sessions) {
  if (process.stdin.isTTY && process.stdout.isTTY) return pickInteractive(sessions);
  return pickNonInteractive(sessions);
}

module.exports = { pickSession, printPlainList, toRows, viewportFor };
