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
  let state = createState(items(10), { viewport: 3, columns: 80, color: false });
  state = press(state, { name: 's' }).state;

  const out = render(state);
  const lines = out.split('\n');
  lines.forEach((line) => assert.ok(line.length <= 80, `linha excede 80 colunas: ${line}`));

  const marked = lines.filter((l) => l.startsWith('> '));
  assert.strictEqual(marked.length, 1);
  assert.ok(marked[0].includes('resumo da sessao 1'));
});

test('cada sessao ocupa duas linhas: rotulo em cima, metadados embaixo', () => {
  const rich = [
    {
      dir: 'C:\\DEV',
      sessionId: 'id1',
      agent: 'claude',
      age: '2d atras',
      branch: 'master',
      bytes: 1677721,
      tokens: 291000,
      tokensKind: 'context',
      title: 'BUG GRAFICO',
      summary: 'mensagem crua',
    },
  ];

  const lines = render(createState(rich, { viewport: 1, columns: 90, color: false }))
    .split('\n')
    .filter((l) => l.trim());

  const head = lines.find((l) => l.includes('BUG GRAFICO'));
  const meta = lines.find((l) => l.includes('claude'));

  assert.ok(head.startsWith('> '), 'a primeira linha traz o marcador e o rotulo');
  assert.deepStrictEqual(meta.trim().split(' · '), [
    'claude',
    '2d atras',
    'master',
    '1.6MB',
    '291k ctx',
  ]);
});

test('metadados ausentes somem em vez de virar campo vazio', () => {
  const magro = [{ dir: 'C:\\DEV', sessionId: 'id1', agent: 'codex', age: 'agora', summary: 'oi' }];
  const out = render(createState(magro, { viewport: 1, columns: 80, color: false }));
  const meta = out.split('\n').find((l) => l.includes('codex'));

  assert.strictEqual(meta.trim(), 'codex · agora');
});

test('tokens de contexto e acumulados nao se confundem', () => {
  const build = (tokens, tokensKind) => [
    { dir: 'C:\\DEV', sessionId: 'i', agent: 'a', age: 'agora', summary: 's', tokens, tokensKind },
  ];

  const ctx = render(createState(build(291000, 'context'), { viewport: 1, columns: 80, color: false }));
  const cum = render(createState(build(3672898, 'cumulative'), { viewport: 1, columns: 80, color: false }));

  assert.ok(ctx.includes('291k ctx'));
  assert.ok(cum.includes('3.7M usados'));
});

test('titulo tem prioridade sobre resumo na linha', () => {
  const withTitle = [
    { dir: 'C:\\DEV', sessionId: 'id1', agent: 'claude', age: 'agora', title: 'MEU TITULO', summary: 'mensagem crua' },
  ];
  const out = render(createState(withTitle, { viewport: 1, columns: 80, color: false }));

  assert.ok(out.includes('MEU TITULO'));
  assert.ok(!out.includes('mensagem crua'));
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
