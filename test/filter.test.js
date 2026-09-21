const test = require('node:test');
const assert = require('node:assert');

const { createState, applyKey, render, filterItems, normalize } = require('../src/selector');

const SAMPLE = [
  { dir: 'C:\\DEV\\SistemasAntigos', sessionId: 'aaa11111', age: 'agora', summary: 'bug no grafico do SO4' },
  { dir: 'C:\\DEV\\YebIN-Internacional', sessionId: 'bbb22222', age: '2d atras', summary: 'traducao no linguas.php' },
  { dir: 'C:\\DEV\\SistemasAtuais\\SO5', sessionId: 'ccc33333', age: '5d atras', summary: 'rodar o spec-kit aqui' },
  { dir: 'C:\\DEV', sessionId: 'ddd44444', age: '9d atras', summary: 'planilha de ação com acentuação' },
];

function type(state, text) {
  return text.split('').reduce((acc, ch) => applyKey(acc, { sequence: ch, name: ch }).state, state);
}

test('normalize remove acentos e caixa', () => {
  assert.strictEqual(normalize('Ação PREÇO'), 'acao preco');
});

test('filtro casa por diretorio', () => {
  const result = filterItems(SAMPLE, 'yebin');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].sessionId, 'bbb22222');
});

test('filtro casa por resumo', () => {
  const result = filterItems(SAMPLE, 'spec-kit');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].sessionId, 'ccc33333');
});

test('filtro casa por id de sessao', () => {
  assert.strictEqual(filterItems(SAMPLE, 'ccc333')[0].sessionId, 'ccc33333');
});

test('filtro ignora acentos nos dois lados', () => {
  assert.strictEqual(filterItems(SAMPLE, 'acao').length, 1);
  assert.strictEqual(filterItems(SAMPLE, 'AÇÃO').length, 1);
  assert.strictEqual(filterItems(SAMPLE, 'acentuacao').length, 1);
});

test('varios termos funcionam como E', () => {
  assert.strictEqual(filterItems(SAMPLE, 'so4 grafico').length, 1);
  assert.strictEqual(filterItems(SAMPLE, 'so4 traducao').length, 0);
});

test('filtro vazio devolve tudo', () => {
  assert.strictEqual(filterItems(SAMPLE, '').length, 4);
  assert.strictEqual(filterItems(SAMPLE, '   ').length, 4);
});

test('barra entra no modo filtro sem virar texto', () => {
  const state = applyKey(createState(SAMPLE, { viewport: 5 }), { sequence: '/', name: 'slash' }).state;
  assert.strictEqual(state.mode, 'filter');
  assert.strictEqual(state.query, '');
  assert.strictEqual(state.items.length, 4);
});

test('digitar no modo filtro reduz a lista', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5 }), { sequence: '/', name: 'slash' }).state;
  state = type(state, 'so5');
  assert.strictEqual(state.query, 'so5');
  assert.strictEqual(state.items.length, 1);
  assert.strictEqual(state.index, 0);
});

test('W e S viram texto dentro do filtro, nao navegacao', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5 }), { sequence: '/', name: 'slash' }).state;
  state = type(state, 'ws');
  assert.strictEqual(state.query, 'ws');
  assert.strictEqual(state.index, 0);
});

test('W e S continuam navegando fora do filtro', () => {
  let state = createState(SAMPLE, { viewport: 5 });
  state = applyKey(state, { name: 's' }).state;
  assert.strictEqual(state.index, 1);
  state = applyKey(state, { name: 'w' }).state;
  assert.strictEqual(state.index, 0);
});

test('setas navegam o resultado filtrado', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5 }), { sequence: '/', name: 'slash' }).state;
  state = type(state, 'a');
  const total = state.items.length;
  assert.ok(total > 1, 'filtro deve deixar mais de um item para navegar');

  state = applyKey(state, { name: 'down' }).state;
  assert.strictEqual(state.index, 1);
});

test('backspace devolve itens', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5 }), { sequence: '/', name: 'slash' }).state;
  state = type(state, 'so5');
  assert.strictEqual(state.items.length, 1);

  state = applyKey(state, { name: 'backspace' }).state;
  assert.strictEqual(state.query, 'so');
  assert.ok(state.items.length >= 1);
});

test('backspace com filtro vazio volta pro modo navegacao', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5 }), { sequence: '/', name: 'slash' }).state;
  state = applyKey(state, { name: 'backspace' }).state;
  assert.strictEqual(state.mode, 'nav');
});

test('Esc limpa o filtro, segundo Esc sai', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5 }), { sequence: '/', name: 'slash' }).state;
  state = type(state, 'so5');

  const cleared = applyKey(state, { name: 'escape' });
  assert.strictEqual(cleared.action, 'move');
  assert.strictEqual(cleared.state.query, '');
  assert.strictEqual(cleared.state.mode, 'nav');
  assert.strictEqual(cleared.state.items.length, 4);

  assert.strictEqual(applyKey(cleared.state, { name: 'escape' }).action, 'cancel');
});

test('ctrl+u limpa o filtro sem sair do modo', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5 }), { sequence: '/', name: 'slash' }).state;
  state = type(state, 'so5');
  state = applyKey(state, { name: 'u', ctrl: true }).state;

  assert.strictEqual(state.query, '');
  assert.strictEqual(state.mode, 'filter');
  assert.strictEqual(state.items.length, 4);
});

test('Enter abre o item filtrado correto', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5 }), { sequence: '/', name: 'slash' }).state;
  state = type(state, 'linguas');

  const result = applyKey(state, { name: 'return' });
  assert.strictEqual(result.action, 'select');
  assert.strictEqual(result.state.items[result.state.index].sessionId, 'bbb22222');
});

test('Enter sem resultado nao seleciona nada', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5 }), { sequence: '/', name: 'slash' }).state;
  state = type(state, 'zzzzzz');

  assert.strictEqual(state.items.length, 0);
  assert.strictEqual(applyKey(state, { name: 'return' }).action, 'none');
});

test('ctrl+c sai mesmo dentro do filtro', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5 }), { sequence: '/', name: 'slash' }).state;
  state = type(state, 'so');
  assert.strictEqual(applyKey(state, { name: 'c', ctrl: true }).action, 'cancel');
});

test('ctrl+n e ctrl+p navegam', () => {
  let state = createState(SAMPLE, { viewport: 5 });
  state = applyKey(state, { name: 'n', ctrl: true }).state;
  assert.strictEqual(state.index, 1);
  state = applyKey(state, { name: 'p', ctrl: true }).state;
  assert.strictEqual(state.index, 0);
});

test('render mostra a barra de filtro com contagem', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5, columns: 70, color: false }), {
    sequence: '/',
    name: 'slash',
  }).state;
  state = type(state, 'so5');

  const out = render(state);
  assert.ok(out.includes('/ so5'), 'mostra o termo digitado');
  assert.ok(out.includes('1 de 4'), 'mostra quantos casaram');
});

test('render avisa quando nada casa', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5, columns: 70, color: false }), {
    sequence: '/',
    name: 'slash',
  }).state;
  state = type(state, 'zzzzzz');

  assert.ok(render(state).includes('nenhuma sessao corresponde'));
});

test('render respeita largura tambem com filtro ativo', () => {
  let state = applyKey(createState(SAMPLE, { viewport: 5, columns: 40, color: false }), {
    sequence: '/',
    name: 'slash',
  }).state;
  state = type(state, 'sistemas');

  render(state)
    .split('\n')
    .forEach((line) => assert.ok(line.length <= 40, `linha excede 40: ${line}`));
});

test('dica muda conforme o modo', () => {
  const nav = createState(SAMPLE, { viewport: 5, columns: 90, color: false });
  assert.ok(render(nav).includes('/ filtrar'));

  const filtering = applyKey(nav, { sequence: '/', name: 'slash' }).state;
  assert.ok(render(filtering).includes('digite para filtrar'));
});
