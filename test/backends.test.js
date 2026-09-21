const test = require('node:test');
const assert = require('node:assert');

const { openSession, assertValidSession } = require('../src/backends');

const valid = { dir: 'C:\\DEV', sessionId: 'e05d7ab3-bf50-4d3c-b408-8c0f9164f268' };

function stub(name, { available = true, fail = false } = {}) {
  const calls = [];
  return {
    name,
    calls,
    available: () => available,
    open: (session) => {
      calls.push(session);
      if (fail) throw new Error(`${name} quebrou`);
    },
  };
}

test('sessao valida passa na validacao', () => {
  assert.doesNotThrow(() => assertValidSession(valid));
});

test('ids com shell metacharacters sao rejeitados', () => {
  const perigosos = [
    'abc; rm -rf /',
    '$(whoami)',
    '`id`',
    'a | curl evil.com',
    'a && shutdown',
    "a'; DROP TABLE--",
    'a\nrm -rf /',
    '../../etc/passwd',
  ];

  perigosos.forEach((sessionId) => {
    assert.throws(
      () => assertValidSession({ dir: 'C:\\DEV', sessionId }),
      /Id de sessao invalido/,
      `deveria rejeitar: ${sessionId}`
    );
  });
});

test('id curto demais ou longo demais e rejeitado', () => {
  assert.throws(() => assertValidSession({ dir: 'C:\\DEV', sessionId: 'ab' }), /Id de sessao/);
  assert.throws(() => assertValidSession({ dir: 'C:\\DEV', sessionId: 'a'.repeat(65) }), /Id de sessao/);
});

test('diretorio vazio e rejeitado', () => {
  assert.throws(() => assertValidSession({ dir: '   ', sessionId: valid.sessionId }), /Diretorio/);
});

test('sessao nula e rejeitada', () => {
  assert.throws(() => assertValidSession(null), /Sessao invalida/);
});

test('usa o primeiro backend disponivel', () => {
  const primeiro = stub('primeiro');
  const segundo = stub('segundo');

  const result = openSession(valid, [primeiro, segundo]);
  assert.strictEqual(result.backend, 'primeiro');
  assert.strictEqual(segundo.calls.length, 0);
});

test('pula backend indisponivel', () => {
  const indisponivel = stub('indisponivel', { available: false });
  const disponivel = stub('disponivel');

  const result = openSession(valid, [indisponivel, disponivel]);
  assert.strictEqual(result.backend, 'disponivel');
  assert.strictEqual(indisponivel.calls.length, 0);
});

test('backend que falha cai pro proximo e reporta o erro', () => {
  const quebrado = stub('quebrado', { fail: true });
  const bom = stub('bom');

  const result = openSession(valid, [quebrado, bom]);
  assert.strictEqual(result.backend, 'bom');
  assert.strictEqual(result.failures.length, 1);
  assert.match(result.failures[0], /quebrado/);
});

test('available que lanca excecao nao derruba a cadeia', () => {
  const explosivo = {
    name: 'explosivo',
    available: () => {
      throw new Error('boom');
    },
    open: () => {},
  };
  const bom = stub('bom');

  const result = openSession(valid, [explosivo, bom]);
  assert.strictEqual(result.backend, 'bom');
});

test('todos falhando gera erro final', () => {
  const a = stub('a', { fail: true });
  const b = stub('b', { fail: true });

  assert.throws(() => openSession(valid, [a, b]), /Nenhum backend conseguiu abrir/);
});

test('backend real de fallback nunca quebra', () => {
  const fallback = require('../src/backends/fallback');
  assert.strictEqual(fallback.available(), true);
  assert.doesNotThrow(() => fallback.open(valid));
});

test('herdr fica indisponivel sem as variaveis de ambiente', () => {
  const herdr = require('../src/backends/herdr');
  const before = { env: process.env.HERDR_ENV, ws: process.env.HERDR_WORKSPACE_ID };

  delete process.env.HERDR_ENV;
  delete process.env.HERDR_WORKSPACE_ID;
  assert.strictEqual(herdr.available(), false);

  process.env.HERDR_ENV = '1';
  assert.strictEqual(herdr.available(), false, 'sem workspace id nao deve estar disponivel');

  if (before.env === undefined) delete process.env.HERDR_ENV;
  else process.env.HERDR_ENV = before.env;
  if (before.ws === undefined) delete process.env.HERDR_WORKSPACE_ID;
  else process.env.HERDR_WORKSPACE_ID = before.ws;
});

test('tmux fica indisponivel fora de sessao tmux', () => {
  const tmux = require('../src/backends/tmux');
  const before = process.env.TMUX;
  delete process.env.TMUX;
  assert.strictEqual(tmux.available(), false);
  if (before !== undefined) process.env.TMUX = before;
});
