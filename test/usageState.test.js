const test = require('node:test');
const assert = require('node:assert');

process.env.NEXO_LANG = 'en';

const { createState, applyKey, move, togglePeriodo, drillIn, drillOut, rowsFor, renderDashboard } = require('../src/usageState');
const { emptyTotals, addTotals } = require('../src/usage/collect');

function totals(input) {
  return addTotals(emptyTotals(), { input });
}

function amostra(dia, agent, model, dir, input) {
  return { at: new Date(`${dia}T10:00:00.000Z`).getTime(), agent, model, dir, sessionId: `${dia}-${agent}`, totals: totals(input) };
}

const SAMPLES = [
  amostra('2026-09-20', 'claude', 'sonnet', 'C:\\DEV\\Alpha', 100),
  amostra('2026-09-20', 'codex', 'gpt-5.5', 'C:\\DEV\\Beta', 50),
  amostra('2026-09-21', 'claude', 'sonnet', 'C:\\DEV\\Alpha', 200),
];

test('rowsFor agrupa por dia, ordenado cronologicamente', () => {
  const rows = rowsFor(SAMPLES, 'dia');
  assert.deepStrictEqual(rows.map((r) => r.key), ['2026-09-20', '2026-09-21']);
  assert.strictEqual(rows[0].total, 150, 'soma as duas amostras do mesmo dia');
});

test('move nao passa dos limites da lista de linhas', () => {
  let state = createState(SAMPLES, { periodo: 'dia' });
  state = move(state, -5);
  assert.strictEqual(state.index, 0, 'nao vai antes do primeiro');

  state = move(state, 10);
  assert.strictEqual(state.index, 1, 'para no ultimo, nao estoura');
});

test('togglePeriodo alterna dia/semana e zera o indice destacado', () => {
  let state = createState(SAMPLES, { periodo: 'dia' });
  state = move(state, 1);
  assert.strictEqual(state.index, 1);

  state = togglePeriodo(state);
  assert.strictEqual(state.periodo, 'semana');
  assert.strictEqual(state.index, 0, 'indice do dia nao faz sentido pra semana');
});

test('drillIn entra no dia destacado, drillOut sai', () => {
  let state = createState(SAMPLES, { periodo: 'dia' });
  state = move(state, 1); // destaca 2026-09-21

  const dentro = drillIn(state);
  assert.strictEqual(dentro.drillKey, '2026-09-21');

  const fora = drillOut(dentro);
  assert.strictEqual(fora.drillKey, null);
});

test('drillIn em lista vazia nao quebra, so nao faz nada', () => {
  const state = createState([], { periodo: 'dia' });
  const result = drillIn(state);
  assert.strictEqual(result.drillKey, null);
});

test('applyKey: Enter entra no drill, Esc sai dele antes de cancelar', () => {
  let state = createState(SAMPLES, { periodo: 'dia' });

  let result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'move');
  assert.ok(result.state.drillKey, 'Enter fez o drill');

  result = applyKey(result.state, { name: 'escape' });
  assert.strictEqual(result.action, 'move', 'primeiro Esc so sai do drill');
  assert.strictEqual(result.state.drillKey, null);

  result = applyKey(result.state, { name: 'escape' });
  assert.strictEqual(result.action, 'cancel', 'segundo Esc, sem drill pendente, cancela de vez');
});

test('applyKey: Tab alterna periodo, Ctrl+C cancela de qualquer estado', () => {
  const state = createState(SAMPLES, { periodo: 'dia' });

  const alternado = applyKey(state, { name: 'tab' });
  assert.strictEqual(alternado.state.periodo, 'semana');

  const cancelado = applyKey(state, { name: 'c', ctrl: true });
  assert.strictEqual(cancelado.action, 'cancel');
});

test('renderDashboard mostra a linha destacada e as dicas de tecla', () => {
  const state = createState(SAMPLES, { periodo: 'dia', color: false, columns: 100 });
  const out = renderDashboard(state);

  assert.ok(out.includes('2026-09-20'));
  assert.ok(out.includes('2026-09-21'));
  assert.ok(out.includes('❯ '), 'a primeira linha comeca destacada');
  assert.ok(out.includes('drill into a day'));
});

test('linha destacada vira barra inteira (reverse video)', () => {
  const { ANSI } = require('../src/selector');
  const state = createState(SAMPLES, { periodo: 'dia', color: true, columns: 100 });
  const out = renderDashboard(state);

  const selecionada = out.split('\n').find((l) => l.includes('❯ '));
  assert.ok(selecionada.includes(ANSI.reverse), 'a linha toda vira barra, nao so o texto');
});

test('renderDashboard mostra o percentual de cada dia em relacao ao total geral, nao so a barra relativa', () => {
  const state = createState(SAMPLES, { periodo: 'dia', color: false, columns: 100 });
  const out = renderDashboard(state);

  // Total geral = 350 (100+50+200). 2026-09-20 soma 150 (43%), 2026-09-21 soma 200 (57%).
  assert.ok(out.includes('43% of total'), 'da pra saber que fatia do total aquele dia representa');
  assert.ok(out.includes('57% of total'));
});

test('renderDrill mostra o percentual em relacao ao total DAQUELE dia, nao ao total geral', () => {
  let state = createState(SAMPLES, { periodo: 'dia', color: false, columns: 100 });
  state = move(state, 1); // 2026-09-21, unica amostra do dia = 200
  state = drillIn(state);

  const out = renderDashboard(state);
  assert.ok(out.includes('100% of total'), 'unico agente/modelo/projeto daquele dia = 100% do dia');
});

test('viewport curto rola a lista mas mantem resumo e rodape visiveis', () => {
  const muitosDias = Array.from({ length: 8 }, (_, i) =>
    amostra(`2026-09-${String(i + 1).padStart(2, '0')}`, 'claude', 'sonnet', 'C:\\DEV\\Alpha', 10)
  );

  let state = createState(muitosDias, { periodo: 'dia', color: false, columns: 100, viewport: 3 });
  const out = renderDashboard(state);

  assert.ok(out.includes('Total:'), 'resumo continua visivel com viewport curto');
  assert.ok(out.includes('drill into a day'), 'rodape continua visivel');
  assert.ok(out.includes('below'), 'indicador de rolagem aparece quando sobra linha');
  assert.ok(!out.includes('2026-09-08'), 'linha fora do viewport nao aparece ainda');

  state = move(state, 7); // vai pro ultimo dia
  const depois = renderDashboard(state);
  assert.ok(depois.includes('above'), 'rolou, agora mostra indicador pra cima');
  assert.ok(depois.includes('2026-09-08'), 'a linha destacada ficou visivel de novo');
});

test('renderDashboard no drill mostra so o recorte daquele dia', () => {
  let state = createState(SAMPLES, { periodo: 'dia', color: false, columns: 100 });
  state = drillIn(state);

  const out = renderDashboard(state);
  assert.ok(out.includes(state.drillKey));
  assert.ok(out.includes('back to the full range'));
});
