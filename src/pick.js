const readline = require('readline');
const { PassThrough } = require('stream');
const { daysAgo } = require('./scanSessions');
const { createState, applyKey, render, syncOffset, markAndAdvance, previewActive } = require('./selector');
const { extractCtrlEnter } = require('./ctrlEnter');
const { openSession } = require('./backends');
const { loadPreview } = require('./preview');
const { AGENTS } = require('./agents');

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
    turns: typeof s.turns === 'number' ? s.turns : null,
    bytes: s.bytes || null,
    tokens: s.tokens || null,
    tokensKind: s.tokensKind || null,
    title: s.title || null,
    summary: s.summary,
    filePath: s.filePath || null,
    ref: s,
  }));
}

// linha em branco + cabecalho + linha em branco + caixa de busca (3) + abas
// de agente + indicadores de rolagem (2) + linha em branco + rodape = 12
// linhas fixas fora da lista (a linha de abas sempre ocupa espaco, mesmo
// vazia com um agente so - ver comentario em selector.js/filterBar), mais 2
// pela linha fixa de "nova sessao" (ela + o respiro em branco depois dela).
function viewportFor(rows) {
  return Math.max(1, Math.floor(((rows || 24) - 14) / 2));
}

// Abre uma sessao marcada como parte do lote final, disparado pelo Enter.
function openInBatch(session, opts) {
  try {
    const { backend, failures, sendSupported } = openSession(session, undefined, opts);
    return { session, backend, failures, sendRequested: Boolean(opts && opts.sendText), sendSupported };
  } catch (err) {
    return { session, backend: null, failures: [err.message], sendRequested: false, sendSupported: false };
  }
}

// So a ultima sessao do lote fica em primeiro plano - as demais sobem em
// segundo plano, senao cada uma rouba o foco da anterior conforme abre e o
// usuario perde de vista a que devia ficar visivel no final. sendText (com
// --send) manda a mesma mensagem pra todas assim que cada uma ficar pronta.
function openBatch(items, sendText) {
  const last = items.length - 1;
  return items.map((session, i) => openInBatch(session, { background: i !== last, sendText: sendText || null }));
}

function pickInteractive(sessions, { sendPrompt = null } = {}) {
  const rows = toRows(sessions);
  const out = process.stdout;
  const batch = [];

  let state = createState(rows, {
    viewport: viewportFor(out.rows),
    columns: out.columns || 80,
    color: !process.env.NO_COLOR,
    cwd: process.cwd(),
    sendPrompt,
    newSessionAgents: AGENTS.map((a) => a.id),
  });

  return new Promise((resolve) => {
    // O Windows Terminal manda Ctrl+Enter como sequencia de escape que o
    // decodificador padrao do readline nao entende (ver src/ctrlEnter.js).
    // Por isso os bytes crus passam primeiro por um filtro proprio, e so o
    // que sobra chega ao decodificador de teclas, via este stream intermediario.
    const decoded = new PassThrough();
    readline.emitKeypressEvents(decoded);

    // Carregar a previa e I/O assincrono, mas o estado do seletor e sincrono
    // e puro de proposito (selector.js nao sabe o que e um arquivo). A previa
    // fica fora do estado, controlada aqui: recarrega so quando o item
    // destacado muda, e descarta resposta atrasada se a selecao ja andou de
    // novo antes dela chegar - sem isso, navegar rapido poderia mostrar a
    // previa de uma sessao que nao e mais a destacada.
    let previewLines;
    let previewFor = null;
    let previewToken = 0;

    function ensurePreview() {
      if (!previewActive(state)) return;
      const atual = state.items[state.index];
      if (!atual || previewFor === atual.sessionId) return;

      previewFor = atual.sessionId;
      previewLines = undefined;
      const meuToken = ++previewToken;

      loadPreview(atual.ref).then((linhas) => {
        if (meuToken !== previewToken) return;
        previewLines = linhas;
        draw();
      });
    }

    let carry = '';
    function onRawData(chunk) {
      const found = extractCtrlEnter(chunk.toString('latin1'), carry);
      carry = found.carry;
      for (let i = 0; i < found.hits; i++) {
        state = markAndAdvance(state);
        ensurePreview();
        draw();
      }
      if (found.remainder) decoded.write(Buffer.from(found.remainder, 'latin1'));
    }

    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    out.write(ALT_SCREEN_ON + CURSOR_HIDE);

    const draw = () => out.write(CLEAR + render(state, previewLines));
    draw();

    const onResize = () => {
      state = syncOffset({
        ...state,
        viewport: Math.max(1, viewportFor(out.rows)),
        columns: Math.max(20, out.columns || 80),
      });
      ensurePreview();
      draw();
    };

    const finish = (result, sendText = null, newSessionAgent = null) => {
      process.stdin.removeListener('data', onRawData);
      decoded.removeListener('keypress', onKeypress);
      out.removeListener('resize', onResize);
      out.write(CURSOR_SHOW + ALT_SCREEN_OFF);
      if (process.stdin.isTTY) process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      resolve({ chosen: result, batch, sendText, newSessionAgent });
    };

    function onKeypress(_str, key) {
      const { state: next, action, items, send, agent } = applyKey(state, key || {});
      state = next;

      if (action === 'cancel') return finish(null);
      if (action === 'select') return finish(state.items[state.index].ref, send ? sendPrompt : null);
      if (action === 'open-batch') {
        batch.push(...openBatch(items, send ? sendPrompt : null));
        return finish(null);
      }
      if (action === 'new-session') return finish(null, null, agent);
      if (action === 'move') {
        ensurePreview();
        draw();
      }
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

function pickSession(sessions, opts) {
  if (process.stdin.isTTY && process.stdout.isTTY) return pickInteractive(sessions, opts);
  return pickNonInteractive(sessions);
}

module.exports = { pickSession, printPlainList, toRows, viewportFor, openInBatch, openBatch };
