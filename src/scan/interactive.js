const readline = require('readline');
const { flattenFindings, createState, applyKey, render } = require('../scanState');
const { isPossiblyActive } = require('./redact');
const { redactSession } = require('./redactSession');
const { ALT_SCREEN_ON, ALT_SCREEN_OFF, CURSOR_HIDE, CURSOR_SHOW, frame } = require('../screen');

// Cabecalho (3) + rodape (3) fixos fora da lista navegavel, e cada achado
// ocupa DUAS linhas de tela (texto + meta), igual a lista de sessoes - sem
// dividir por 2, o viewport calculado sempre estourava a altura real do
// terminal com mais de uma duzia de achados, empurrando o cabecalho pra fora
// da tela e dando a impressao de que as setas nao faziam nada (confirmado
// ao vivo: com 101 achados reais, a tela so mostrava o rodape, sempre).
function viewportFor(rows) {
  return Math.max(1, Math.floor(((rows || 24) - 6) / 2));
}

// Agrupa as chaves selecionadas por sessao - uma sessao pode ter varios
// achados marcados, e cada sessao so deve ser limpa uma vez. Sessao
// possivelmente ativa (mexida ha pouco) fica de fora, mesma protecao que
// "--redact" ja aplica.
function porSessao(rows, keys) {
  const grupos = new Map();
  const puladas = [];

  for (const key of keys) {
    const row = rows.find((r) => r.key === key);
    if (!row) continue;

    // Agrupa por sessionId, nao por filePath: a unidade de redact e a SESSAO
    // (que no Codex sao dois destinos - rollout e banco), e uma sessao do
    // Codex sem rollout tem filePath null. Chavear por null fundia sessoes
    // diferentes no mesmo grupo e a segunda era descartada em silencio.
    if (!grupos.has(row.sessionId)) grupos.set(row.sessionId, { row, only: new Set() });
    grupos.get(row.sessionId).only.add(`${row.rule}|${row.masked}`);
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
// printRedactReport sem duplicar a logica de impressao. A limpeza em si vem
// de redactSession, o mesmo do --redact direto - inclusive o banco do Codex.
function applyRedaction(rows, keys) {
  const { alvo, puladas } = porSessao(rows, keys);
  const resultados = alvo.map(({ row, only }) => ({ result: row, outcome: redactSession(row, only) }));

  // Banco ocupado nao e falha: e "tente de novo com o Codex fechado". Vai
  // para a mesma lista de puladas que a checagem de mtime alimenta.
  const ocupadas = resultados.filter((e) => e.outcome.dbBusy).map((e) => e.result);
  const feitas = resultados.filter((e) => !e.outcome.dbBusy);

  return { feitas, puladas: [...puladas, ...ocupadas] };
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

    const draw = () => out.write(frame(render(state)));
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
