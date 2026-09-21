const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, '..', 'bin', 'ccsw.js');

function makeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsw-cli-'));
  const proj = path.join(home, '.claude', 'projects', 'C--DEV');
  fs.mkdirSync(proj, { recursive: true });

  fs.writeFileSync(
    path.join(proj, 'aaa11111-1111-1111-1111-111111111111.jsonl'),
    [
      JSON.stringify({ cwd: 'C:\\DEV\\Alpha', sessionId: 'aaa11111-1111-1111-1111-111111111111' }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'bug no grafico' } }),
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(proj, 'bbb22222-2222-2222-2222-222222222222.jsonl'),
    [
      JSON.stringify({ cwd: 'C:\\DEV\\Beta', sessionId: 'bbb22222-2222-2222-2222-222222222222' }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'traducao do linguas' } }),
    ].join('\n'),
    'utf8'
  );

  return home;
}

function run(args, { home = makeHome(), expectFail = false } = {}) {
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    HERDR_ENV: '',
    HERDR_WORKSPACE_ID: '',
    TMUX: '',
    CCSW_FORCE_FALLBACK: '1',
  };

  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });
    assert.ok(!expectFail, 'esperava falha mas o comando teve sucesso');
    return stdout;
  } catch (err) {
    assert.ok(expectFail, `comando falhou inesperadamente: ${err.stderr || err.message}`);
    return `${err.stdout || ''}${err.stderr || ''}`;
  }
}

test('--help nao depende de sessoes', () => {
  assert.match(run(['--help']), /ccsw <termo>/);
});

test('--json devolve JSON valido', () => {
  const parsed = JSON.parse(run(['--json']));
  assert.strictEqual(parsed.length, 2);
  assert.ok(parsed[0].sessionId && parsed[0].dir && parsed[0].summary && parsed[0].age);
});

test('--json respeita o termo de busca', () => {
  const parsed = JSON.parse(run(['--json', 'grafico']));
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].dir, 'C:\\DEV\\Alpha');
});

test('--list imprime as duas sessoes', () => {
  const out = run(['--list']);
  assert.match(out, /Alpha/);
  assert.match(out, /Beta/);
});

test('termo sem resultado falha com exit != 0', () => {
  const out = run(['--json', 'zzzzzz'], { expectFail: true });
  assert.match(out, /Nenhuma sessao corresponde/);
});

test('--open aceita id completo', () => {
  const out = run(['--open', 'bbb22222-2222-2222-2222-222222222222']);
  assert.match(out, /Abrindo C:\\DEV\\Beta/);
});

test('--open aceita prefixo do id', () => {
  const out = run(['--open', 'aaa11111']);
  assert.match(out, /Abrindo C:\\DEV\\Alpha/);
});

test('--open com id inexistente falha', () => {
  const out = run(['--open', 'naoexiste'], { expectFail: true });
  assert.match(out, /Sessao nao encontrada/);
});

test('--open sem valor falha', () => {
  const out = run(['--open'], { expectFail: true });
  assert.match(out, /Sessao nao encontrada/);
});

test('sem sessoes nenhuma falha com mensagem clara', () => {
  const vazio = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsw-vazio-'));
  const out = run(['--list'], { home: vazio, expectFail: true });
  assert.match(out, /Nenhuma sessao do Claude Code encontrada/);
});
