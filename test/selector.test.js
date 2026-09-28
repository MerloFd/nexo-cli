const test = require('node:test');
const assert = require('node:assert');

// Fixa o idioma: sem isso a suite quebraria conforme a preferencia da maquina.
process.env.NEXO_LANG = 'en';

const { createState, applyKey, render } = require('../src/selector');

function items(n) {
  return Array.from({ length: n }, (_, i) => {
    const sessionId = `id${String(i).padStart(6, '0')}`;
    return {
      dir: `C:\\DEV\\proj${i}`,
      sessionId,
      agent: 'claude',
      age: `${i}d atras`,
      summary: `resumo da sessao ${i}`,
      ref: { sessionId, dir: `C:\\DEV\\proj${i}` },
    };
  });
}

function press(state, key) {
  return applyKey(state, key);
}

test('setas navegam a lista', () => {
  let state = createState(items(5), { viewport: 3 });
  state = press(state, { name: 'down' }).state;
  assert.strictEqual(state.index, 1);
  state = press(state, { name: 'down' }).state;
  assert.strictEqual(state.index, 2);
  state = press(state, { name: 'up' }).state;
  assert.strictEqual(state.index, 1);
});

test('ctrl+n e ctrl+p navegam', () => {
  let state = createState(items(5), { viewport: 3 });
  state = press(state, { name: 'n', ctrl: true }).state;
  assert.strictEqual(state.index, 1);
  state = press(state, { name: 'p', ctrl: true }).state;
  assert.strictEqual(state.index, 0);
});

test('letras NAO navegam: viram busca', () => {
  let state = createState(items(5), { viewport: 3 });
  state = press(state, { name: 's', sequence: 's' }).state;

  assert.strictEqual(state.query, 's', 'a letra foi para a busca');
  assert.strictEqual(state.index, 0, 'o indice nao se moveu');
});

test('navegacao circula nas pontas', () => {
  let state = createState(items(3), { viewport: 3 });
  state = press(state, { name: 'up' }).state;
  assert.strictEqual(state.index, 2, 'subir no topo vai pro fim');
  state = press(state, { name: 'down' }).state;
  assert.strictEqual(state.index, 0, 'descer no fim volta pro topo');
});

test('viewport acompanha o indice', () => {
  let state = createState(items(20), { viewport: 5 });
  for (let i = 0; i < 7; i++) state = press(state, { name: 'down' }).state;

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

test('Esc sai quando a busca esta vazia', () => {
  const state = createState(items(3), { viewport: 3 });
  assert.strictEqual(press(state, { name: 'escape' }).action, 'cancel');
});

test('ctrl+c sempre cancela', () => {
  const state = createState(items(3), { viewport: 3 });
  assert.strictEqual(press(state, { name: 'c', ctrl: true }).action, 'cancel');
});

test('tecla sem efeito nao altera o estado', () => {
  const state = createState(items(3), { viewport: 3 });
  const result = press(state, { name: 'f5' });
  assert.strictEqual(result.action, 'none');
  assert.strictEqual(result.state.index, 0);
  assert.strictEqual(result.state.query, '');
});

test('keypress sem objeto de tecla nao quebra', () => {
  const state = createState(items(3), { viewport: 3 });
  assert.strictEqual(applyKey(state, {}).action, 'none');
  assert.strictEqual(applyKey(state).action, 'none');
});

test('lista de um item unico nao quebra com navegacao', () => {
  let state = createState(items(1), { viewport: 5 });
  state = press(state, { name: 'down' }).state;
  state = press(state, { name: 'up' }).state;
  state = press(state, { name: 'pagedown' }).state;
  assert.strictEqual(state.index, 0);
});

test('lista vazia nao quebra', () => {
  const state = createState([], { viewport: 5 });
  const result = press(state, { name: 'down' });
  assert.strictEqual(result.state.index, 0);
  assert.doesNotThrow(() => render(state));
});

test('render marca a linha selecionada e respeita a largura', () => {
  let state = createState(items(10), { viewport: 3, columns: 80, color: false });
  state = press(state, { name: 'down' }).state;

  const lines = render(state).split('\n');
  lines.forEach((line) => assert.ok(line.length <= 80, `linha excede 80 colunas: ${line}`));

  const marked = lines.filter((l) => l.startsWith('> '));
  assert.strictEqual(marked.length, 1);
  assert.ok(marked[0].includes('resumo da sessao 1'));
});

test('caixa de busca aparece mesmo sem termo digitado', () => {
  const out = render(createState(items(3), { viewport: 3, columns: 80, color: false }));
  assert.ok(out.includes('Search'), 'mostra o placeholder');
  assert.ok(out.includes('\u250c'), 'desenha a caixa');
});

test('cabecalho mostra posicao e total', () => {
  let state = createState(items(9), { viewport: 4, columns: 80, color: false });
  assert.ok(render(state).includes('(1 of 9)'));

  state = press(state, { name: 'down' }).state;
  assert.ok(render(state).includes('(2 of 9)'));
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
  assert.deepStrictEqual(meta.trim().split(' \u00b7 '), [
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

  assert.strictEqual(meta.trim(), 'codex \u00b7 agora');
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
  const topo = render(state);
  assert.ok(!topo.includes('above'));
  assert.ok(topo.includes('below'));

  for (let i = 0; i < 10; i++) state = press(state, { name: 'down' }).state;
  const meio = render(state);
  assert.ok(meio.includes('above'));
  assert.ok(meio.includes('below'));
});

test('cores saem quando color=false', () => {
  const state = createState(items(3), { viewport: 3, color: false });
  assert.ok(!render(state).includes('\x1b['));
});

test('cores entram quando color=true', () => {
  const state = createState(items(3), { viewport: 3, color: true });
  assert.ok(render(state).includes('\x1b['));
});

test('toggleMark adiciona e remove a sessao do conjunto marcado', () => {
  const { createState, toggleMark } = require('../src/selector');
  let state = createState(items(3), { viewport: 3 });

  assert.strictEqual(state.marked.size, 0);
  state = toggleMark(state, 'id000001');
  assert.ok(state.marked.has('id000001'));
  state = toggleMark(state, 'id000001');
  assert.ok(!state.marked.has('id000001'), 'marcar de novo desmarca');
});

test('item marcado ganha check quando nao esta selecionado', () => {
  const { createState, toggleMark, render } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, columns: 80, color: false });
  state = toggleMark(state, 'id000001');

  const linhas = render(state).split('\n');
  const linhaMarcada = linhas.find((l) => l.includes('resumo da sessao 1'));

  assert.ok(linhaMarcada.startsWith('✓ '), 'marca com check quem foi marcado');
});

test('check some quando o item marcado esta selecionado', () => {
  const { createState, toggleMark, render } = require('../src/selector');
  let state = createState(items(3), { viewport: 3, columns: 80, color: false });
  state = toggleMark(state, 'id000000');

  const linhas = render(state).split('\n');
  const atual = linhas.find((l) => l.includes('resumo da sessao 0'));

  assert.ok(atual.startsWith('> '), 'selecao tem prioridade visual sobre o check');
});

test('Tab so marca e avanca - nao abre nada', () => {
  const { createState, applyKey } = require('../src/selector');
  const state = createState(items(3), { viewport: 3 });

  const result = applyKey(state, { name: 'tab' });
  assert.strictEqual(result.action, 'move', 'Tab nunca fecha nem abre sozinho');
  assert.ok(result.state.marked.has('id000000'));
  assert.strictEqual(result.state.index, 1, 'avanca pro proximo depois de marcar');
});

test('Tab marca varios em sequencia', () => {
  const { createState, applyKey } = require('../src/selector');
  let state = createState(items(4), { viewport: 4 });

  state = applyKey(state, { name: 'tab' }).state;
  state = applyKey(state, { name: 'tab' }).state;

  assert.strictEqual(state.marked.size, 2);
  assert.ok(state.marked.has('id000000'));
  assert.ok(state.marked.has('id000001'));
  assert.strictEqual(state.index, 2);
});

test('Tab em lista vazia nao quebra', () => {
  const { createState, applyKey } = require('../src/selector');
  const result = applyKey(createState([], { viewport: 3 }), { name: 'tab' });

  assert.strictEqual(result.action, 'move');
  assert.strictEqual(result.state.marked.size, 0);
});

test('Enter sem nada marcado abre so o item destacado, como sempre', () => {
  const { createState, applyKey } = require('../src/selector');
  const state = createState(items(3), { viewport: 3 });

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'select');
});

test('Enter com marcas pendentes vira lote, ignorando o item so destacado', () => {
  const { createState, applyKey, move } = require('../src/selector');
  let state = createState(items(4), { viewport: 4 });

  state = applyKey(state, { name: 'tab' }).state; // marca 0, vai pro 1
  state = applyKey(state, { name: 'tab' }).state; // marca 1, vai pro 2
  state = move(state, 1); // destaca 3, sem marcar

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'open-batch');
  assert.strictEqual(result.items.length, 2, 'so os marcados entram no lote');
  assert.deepStrictEqual(
    result.items.map((i) => i.sessionId).sort(),
    ['id000000', 'id000001']
  );
});

test('marca sobrevive a busca que esconde o item da tela', () => {
  const { createState, applyKey, setQuery } = require('../src/selector');
  let state = createState(items(4), { viewport: 4 });

  state = applyKey(state, { name: 'tab' }).state; // marca item 0
  state = setQuery(state, 'sessao 3'); // filtro esconde o item 0

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'open-batch');
  assert.strictEqual(result.items[0].sessionId, 'id000000', 'a marca nao se perde com o filtro');
});
