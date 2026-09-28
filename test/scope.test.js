const test = require('node:test');
const assert = require('node:assert');

// Fixa o idioma: sem isso a suite quebraria conforme a preferencia da maquina.
process.env.NEXO_LANG = 'en';

const { createState, applyKey, render, inScope } = require('../src/selector');

const ITENS = [
  { dir: 'C:\\DEV\\App', sessionId: 'a1', agent: 'claude', age: 'agora', summary: 'aqui' },
  { dir: 'c:\\dev\\app', sessionId: 'a2', agent: 'codex', age: 'agora', summary: 'mesma pasta, outra caixa' },
  { dir: 'C:\\DEV\\Outro', sessionId: 'b1', agent: 'claude', age: 'agora', summary: 'outra pasta' },
  { dir: 'C:\\DEV', sessionId: 'c1', agent: 'claude', age: 'agora', summary: 'pasta acima' },
];

const AQUI = 'C:\\DEV\\App';

test('escopo global e o padrao', () => {
  const state = createState(ITENS, { viewport: 5, cwd: AQUI });
  assert.strictEqual(state.scope, 'global');
  assert.strictEqual(state.items.length, 4);
});

test('ctrl+a restringe a pasta atual', () => {
  let state = createState(ITENS, { viewport: 5, cwd: AQUI });
  state = applyKey(state, { name: 'a', ctrl: true }).state;

  assert.strictEqual(state.scope, 'local');
  assert.strictEqual(state.items.length, 2, 'as duas sessoes da pasta, ignorando a caixa');
});

test('ctrl+a de novo volta para todas as pastas', () => {
  let state = createState(ITENS, { viewport: 5, cwd: AQUI });
  state = applyKey(state, { name: 'a', ctrl: true }).state;
  state = applyKey(state, { name: 'a', ctrl: true }).state;

  assert.strictEqual(state.scope, 'global');
  assert.strictEqual(state.items.length, 4);
});

test('pasta acima nao entra no escopo local', () => {
  const locais = inScope(ITENS, 'local', AQUI);
  assert.ok(!locais.some((i) => i.sessionId === 'c1'), 'C:\\DEV nao e a pasta atual');
});

test('sem cwd conhecido o escopo local nao filtra nada', () => {
  assert.strictEqual(inScope(ITENS, 'local', null).length, 4);
});

test('busca e escopo se combinam', () => {
  let state = createState(ITENS, { viewport: 5, cwd: AQUI });
  state = applyKey(state, { name: 'a', ctrl: true }).state;
  state = applyKey(state, { sequence: 'c', name: 'c' }).state;
  state = applyKey(state, { sequence: 'o', name: 'o' }).state;

  assert.strictEqual(state.scope, 'local', 'a busca nao desfaz o escopo');
  assert.ok(state.items.every((i) => i.dir.toLowerCase() === AQUI.toLowerCase()));
});

test('trocar o escopo devolve a selecao para o topo', () => {
  let state = createState(ITENS, { viewport: 5, cwd: AQUI });
  state = applyKey(state, { name: 'down' }).state;
  assert.strictEqual(state.index, 1);

  state = applyKey(state, { name: 'a', ctrl: true }).state;
  assert.strictEqual(state.index, 0, 'indice antigo poderia apontar para fora da lista nova');
});

test('o cabecalho diz qual escopo esta ativo', () => {
  let state = createState(ITENS, { viewport: 5, columns: 90, color: false, cwd: AQUI });
  assert.ok(render(state).includes('global'), 'global aparece por extenso');

  state = applyKey(state, { name: 'a', ctrl: true }).state;
  assert.ok(render(state).includes(AQUI), 'o caminho atual aparece no lugar de "global"');
});

test('escopo local sem sessao explica como sair dele', () => {
  const state = createState(ITENS, { viewport: 5, columns: 90, color: false, cwd: 'C:\\DEV\\Vazio' });
  const local = applyKey(state, { name: 'a', ctrl: true }).state;

  assert.strictEqual(local.items.length, 0);
  assert.ok(render(local).includes('ctrl+a'), 'a saida sugere o atalho');
});
