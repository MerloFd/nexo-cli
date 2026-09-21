const test = require('node:test');
const assert = require('node:assert');

const { createState, applyKey, render } = require('../src/selector');

function items(n) {
  return Array.from({ length: n }, (_, i) => ({
    dir: `C:\\DEV\\proj${i}`,
    sessionId: `id${String(i).padStart(6, '0')}`,
    age: `${i}d atras`,
    summary: `resumo da sessao ${i}`,
  }));
}

function press(state, key) {
  return applyKey(state, key);
}

test('S e seta pra baixo descem', () => {
  let state = createState(items(5), { viewport: 3 });
  state = press(state, { name: 's' }).state;
  assert.strictEqual(state.index, 1);
  state = press(state, { name: 'down' }).state;
  assert.strictEqual(state.index, 2);
});

test('W e seta pra cima sobem', () => {
  let state = createState(items(5), { viewport: 3 });
  state = press(state, { name: 's' }).state;
  state = press(state, { name: 's' }).state;
  state = press(state, { name: 'w' }).state;
  assert.strictEqual(state.index, 1);
  state = press(state, { name: 'up' }).state;
  assert.strictEqual(state.index, 0);
});

test('vim keys j/k tambem funcionam', () => {
  let state = createState(items(5), { viewport: 3 });
  state = press(state, { name: 'j' }).state;
  assert.strictEqual(state.index, 1);
  state = press(state, { name: 'k' }).state;
  assert.strictEqual(state.index, 0);
});

test('navegacao circula nas pontas', () => {
  let state = createState(items(3), { viewport: 3 });
  state = press(state, { name: 'w' }).state;
  assert.strictEqual(state.index, 2, 'subir no topo vai pro fim');
  state = press(state, { name: 's' }).state;
  assert.strictEqual(state.index, 0, 'descer no fim volta pro topo');
});

test('viewport acompanha o indice', () => {
  let state = createState(items(20), { viewport: 5 });
  for (let i = 0; i < 7; i++) state = press(state, { name: 's' }).state;
  assert.strictEqual(state.index, 7);
  assert.ok(state.offset <= state.index, 'indice nao fica acima da janela');
  assert.ok(state.index < state.offset + state.viewport, 'indice nao fica abaixo da janela');
});

test('offset nunca passa do limite', () => {
  let state = createState(items(8), { viewport: 5 });
  state = press(state, { name: 'end' }).state;
  assert.strictEqual(state.index, 7);
  assert.strictEqual(state.offset, 3);
});

test('pageup e pagedown nao circulam', () => {
  let state = createState(items(20), { viewport: 5 });
  state = press(state, { name: 'pageup' }).state;
  assert.strictEqual(state.index, 0);
  state = press(state, { name: 'pagedown' }).state;
  assert.strictEqual(state.index, 5);
});

test('home e end vao pras pontas', () => {
  let state = createState(items(10), { viewport: 4 });
  state = press(state, { name: 'end' }).state;
  assert.strictEqual(state.index, 9);
  state = press(state, { name: 'home' }).state;
  assert.strictEqual(state.index, 0);
});

test('Enter seleciona', () => {
  const state = createState(items(3), { viewport: 3 });
  assert.strictEqual(press(state, { name: 'return' }).action, 'select');
  assert.strictEqual(press(state, { sequence: '\r' }).action, 'select');
});

test('Esc, q e ctrl+c cancelam', () => {
  const state = createState(items(3), { viewport: 3 });
  assert.strictEqual(press(state, { name: 'escape' }).action, 'cancel');
  assert.strictEqual(press(state, { name: 'q' }).action, 'cancel');
  assert.strictEqual(press(state, { name: 'c', ctrl: true }).action, 'cancel');
});

test('tecla desconhecida nao faz nada', () => {
  const state = createState(items(3), { viewport: 3 });
  const result = press(state, { name: 'z' });
  assert.strictEqual(result.action, 'none');
  assert.strictEqual(result.state.index, 0);
});

test('keypress sem objeto de tecla nao quebra', () => {
  const state = createState(items(3), { viewport: 3 });
  assert.strictEqual(applyKey(state, {}).action, 'none');
  assert.strictEqual(applyKey(state).action, 'none');
});

test('lista de um item unico nao quebra com navegacao', () => {
  let state = createState(items(1), { viewport: 5 });
  state = press(state, { name: 's' }).state;
  state = press(state, { name: 'w' }).state;
  state = press(state, { name: 'pagedown' }).state;
  assert.strictEqual(state.index, 0);
});

test('lista vazia nao quebra', () => {
  const state = createState([], { viewport: 5 });
  const result = press(state, { name: 's' });
  assert.strictEqual(result.state.index, 0);
  assert.doesNotThrow(() => render(state));
});

test('render marca a linha selecionada e respeita a largura', () => {
  let state = createState(items(10), { viewport: 3, columns: 40, color: false });
  state = press(state, { name: 's' }).state;

  const out = render(state);
  const lines = out.split('\n');
  lines.forEach((line) => assert.ok(line.length <= 40, `linha excede 40 colunas: ${line}`));

  const marked = lines.filter((l) => l.startsWith('> '));
  assert.strictEqual(marked.length, 1);
  assert.ok(marked[0].includes('proj1'));
});

test('render mostra indicadores de rolagem', () => {
  let state = createState(items(30), { viewport: 4, columns: 80, color: false });
  const top = render(state);
  assert.ok(!top.includes('mais 0 acima'));
  assert.ok(top.includes('abaixo'));

  for (let i = 0; i < 10; i++) state = press(state, { name: 's' }).state;
  const mid = render(state);
  assert.ok(mid.includes('acima'));
  assert.ok(mid.includes('abaixo'));
});

test('cores saem quando color=false', () => {
  const state = createState(items(3), { viewport: 3, color: false });
  assert.ok(!render(state).includes('\x1b['));
});

test('cores entram quando color=true', () => {
  const state = createState(items(3), { viewport: 3, color: true });
  assert.ok(render(state).includes('\x1b['));
});
