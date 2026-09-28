const test = require('node:test');
const assert = require('node:assert');

// Fixa o idioma: sem isso a suite quebraria conforme a preferencia da maquina.
process.env.NEXO_LANG = 'en';

const { createState, applyKey, render, filterItems, normalize } = require('../src/selector');

const SAMPLE = [
  { dir: 'C:\\DEV\\SistemasAntigos', sessionId: 'aaa11111', agent: 'claude', age: 'agora', summary: 'bug no grafico do SO4' },
  { dir: 'C:\\DEV\\YebIN-Internacional', sessionId: 'bbb22222', agent: 'claude', age: '2d atras', branch: 'master', summary: 'traducao no linguas.php' },
  { dir: 'C:\\DEV\\SistemasAtuais\\SO5', sessionId: 'ccc33333', agent: 'codex', age: '5d atras', branch: 'frete-refactor', summary: 'rodar o spec-kit aqui' },
  { dir: 'C:\\DEV', sessionId: 'ddd44444', agent: 'codex', age: '9d atras', summary: 'planilha de ação com acentuação' },
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
  assert.strictEqual(filterItems(SAMPLE, 'spec-kit')[0].sessionId, 'ccc33333');
});

test('filtro casa por id de sessao', () => {
  assert.strictEqual(filterItems(SAMPLE, 'ccc333')[0].sessionId, 'ccc33333');
});

test('filtro casa por agente, que aparece na tela', () => {
  assert.strictEqual(filterItems(SAMPLE, 'codex').length, 2);
  assert.strictEqual(filterItems(SAMPLE, 'claude').length, 2);
});

test('filtro casa por branch, que aparece na tela', () => {
  const result = filterItems(SAMPLE, 'frete');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].sessionId, 'ccc33333');
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

test('digitar direto ja busca, sem prefixo nenhum', () => {
  const state = type(createState(SAMPLE, { viewport: 5 }), 'so5');

  assert.strictEqual(state.query, 'so5');
  assert.strictEqual(state.items.length, 1);
  assert.strictEqual(state.index, 0, 'a selecao volta pro topo a cada busca');
});

test('a barra e um caractere de busca como outro qualquer', () => {
  const state = type(createState(SAMPLE, { viewport: 5 }), '/');
  assert.strictEqual(state.query, '/');
});

test('setas navegam o resultado filtrado', () => {
  let state = type(createState(SAMPLE, { viewport: 5 }), 'a');
  assert.ok(state.items.length > 1, 'o filtro precisa deixar mais de um item');

  state = applyKey(state, { name: 'down' }).state;
  assert.strictEqual(state.index, 1);
});

test('backspace devolve itens', () => {
  let state = type(createState(SAMPLE, { viewport: 5 }), 'so5');
  assert.strictEqual(state.items.length, 1);

  state = applyKey(state, { name: 'backspace' }).state;
  assert.strictEqual(state.query, 'so');
  assert.ok(state.items.length >= 1);
});

test('backspace com busca vazia nao faz nada', () => {
  const state = createState(SAMPLE, { viewport: 5 });
  const result = applyKey(state, { name: 'backspace' });
  assert.strictEqual(result.action, 'none');
});

test('Esc limpa a busca; com a busca ja limpa, sai', () => {
  const state = type(createState(SAMPLE, { viewport: 5 }), 'so5');

  const limpo = applyKey(state, { name: 'escape' });
  assert.strictEqual(limpo.action, 'move');
  assert.strictEqual(limpo.state.query, '');
  assert.strictEqual(limpo.state.items.length, 4);

  assert.strictEqual(applyKey(limpo.state, { name: 'escape' }).action, 'cancel');
});

test('ctrl+u limpa a busca', () => {
  let state = type(createState(SAMPLE, { viewport: 5 }), 'so5');
  state = applyKey(state, { name: 'u', ctrl: true }).state;

  assert.strictEqual(state.query, '');
  assert.strictEqual(state.items.length, 4);
});

test('Enter abre o item filtrado correto', () => {
  const state = type(createState(SAMPLE, { viewport: 5 }), 'linguas');
  const result = applyKey(state, { name: 'return' });

  assert.strictEqual(result.action, 'select');
  assert.strictEqual(result.state.items[result.state.index].sessionId, 'bbb22222');
});

test('Enter sem resultado nao seleciona nada', () => {
  const state = type(createState(SAMPLE, { viewport: 5 }), 'zzzzzz');

  assert.strictEqual(state.items.length, 0);
  assert.strictEqual(applyKey(state, { name: 'return' }).action, 'none');
});

test('ctrl+c sai mesmo com busca digitada', () => {
  const state = type(createState(SAMPLE, { viewport: 5 }), 'so');
  assert.strictEqual(applyKey(state, { name: 'c', ctrl: true }).action, 'cancel');
});

test('render mostra o termo digitado e a contagem no cabecalho', () => {
  const state = type(createState(SAMPLE, { viewport: 5, columns: 70, color: false }), 'so5');
  const out = render(state);

  assert.ok(out.includes('so5'), 'mostra o termo na caixa');
  assert.ok(out.includes('(1 of 1)'), 'o cabecalho reflete o resultado');
});

test('render avisa quando nada casa', () => {
  const state = type(createState(SAMPLE, { viewport: 5, columns: 70, color: false }), 'zzzzzz');
  assert.ok(render(state).includes('no session matches'));
});

test('render respeita largura tambem com busca ativa', () => {
  const state = type(createState(SAMPLE, { viewport: 5, columns: 40, color: false }), 'sistemas');

  render(state)
    .split('\n')
    .forEach((line) => assert.ok(line.length <= 40, `linha excede 40: ${line}`));
});

test('a dica de rodape muda quando ha busca', () => {
  const vazio = createState(SAMPLE, { viewport: 5, columns: 120, color: false });
  assert.ok(render(vazio).includes('type to search'));

  const buscando = type(vazio, 'so');
  assert.ok(render(buscando).includes('clears search'));
});
