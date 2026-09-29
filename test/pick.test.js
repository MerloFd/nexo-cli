const test = require('node:test');
const assert = require('node:assert');

const { toRows, viewportFor } = require('../src/pick');
const { createState, applyKey, syncOffset } = require('../src/selector');
const backends = require('../src/backends');

test('toRows converte sessoes em linhas renderizaveis', () => {
  const rows = toRows([{ dir: 'C:\\DEV', sessionId: 'abc', mtime: Date.now(), summary: 'oi' }]);
  assert.strictEqual(rows[0].dir, 'C:\\DEV');
  assert.strictEqual(rows[0].age, 'agora');
  assert.ok(rows[0].ref, 'mantem referencia pra sessao original');
});

test('viewport nunca fica menor que 1, mesmo em terminal minusculo', () => {
  assert.strictEqual(viewportFor(1), 1);
  assert.strictEqual(viewportFor(12), 1);
  assert.strictEqual(viewportFor(32), 10);
  assert.strictEqual(viewportFor(undefined), 6);
});

function manyRows(n) {
  return toRows(
    Array.from({ length: n }, (_, i) => ({
      dir: `C:\\p${i}`,
      sessionId: `id${i}`,
      mtime: Date.now(),
      summary: `s${i}`,
    }))
  );
}

test('resize preserva a selecao em vez de voltar pro topo', () => {
  const rows = manyRows(30);

  let state = createState(rows, { viewport: 10, columns: 80 });
  for (let i = 0; i < 15; i++) state = applyKey(state, { name: 'down' }).state;
  assert.strictEqual(state.index, 15);

  const after = syncOffset({ ...state, viewport: 4, columns: 40 });

  assert.strictEqual(after.index, 15, 'selecao sobrevive ao resize');
  assert.ok(after.offset <= 15 && 15 < after.offset + after.viewport, 'item segue visivel');
});

test('resize preserva a busca digitada', () => {
  const rows = manyRows(30);

  let state = createState(rows, { viewport: 10, columns: 80 });
  state = applyKey(state, { sequence: '1', name: '1' }).state;

  const filtered = state.items.length;
  const after = syncOffset({ ...state, viewport: 3, columns: 40 });

  assert.strictEqual(after.query, '1');
  assert.strictEqual(after.items.length, filtered);
});

test('no lote, so a ultima sessao abre em primeiro plano', (t) => {
  const chamadas = [];
  t.mock.method(backends, 'openSession', (session, _backends, opts) => {
    chamadas.push({ id: session.sessionId, background: Boolean(opts && opts.background) });
    return { backend: 'fake', failures: [] };
  });

  // pick.js desestrutura openSession no momento do require - o mock so tem
  // efeito se o modulo for recarregado depois que ele foi aplicado.
  delete require.cache[require.resolve('../src/pick')];
  const { openBatch } = require('../src/pick');

  const items = [{ sessionId: 'a' }, { sessionId: 'b' }, { sessionId: 'c' }];
  openBatch(items);

  assert.deepStrictEqual(chamadas, [
    { id: 'a', background: true },
    { id: 'b', background: true },
    { id: 'c', background: false },
  ]);
});
