const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, '..', 'bin', 'nexo.js');

function makeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-cli-'));
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

function run(args, { home = makeHome(), expectFail = false, input } = {}) {
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    HERDR_ENV: '',
    HERDR_WORKSPACE_ID: '',
    TMUX: '',
    NEXO_FORCE_FALLBACK: '1',
    NEXO_LANG: 'en',
  };

  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8', input });
    assert.ok(!expectFail, 'esperava falha mas o comando teve sucesso');
    return stdout;
  } catch (err) {
    assert.ok(expectFail, `comando falhou inesperadamente: ${err.stderr || err.message}`);
    return `${err.stdout || ''}${err.stderr || ''}`;
  }
}

test('--help nao depende de sessoes', () => {
  assert.match(run(['--help']), /nexo <term>/);
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
  assert.match(out, /No session matches/);
});

test('--open aceita id completo', () => {
  const out = run(['--open', 'bbb22222-2222-2222-2222-222222222222']);
  assert.match(out, /Opening C:\\DEV\\Beta/);
});

test('--open aceita prefixo do id', () => {
  const out = run(['--open', 'aaa11111']);
  assert.match(out, /Opening C:\\DEV\\Alpha/);
});

test('--send avisa quando o backend nao suporta, em vez de ficar quieto', () => {
  const out = run(['--open', 'aaa11111', '--send', 'onde paramos?']);
  assert.match(out, /--send is not supported by fallback/, 'NEXO_FORCE_FALLBACK cai no fallback, que nao manda texto');
});

test('--open com id inexistente falha', () => {
  const out = run(['--open', 'naoexiste'], { expectFail: true });
  assert.match(out, /Session not found/);
});

test('--open sem valor falha', () => {
  const out = run(['--open'], { expectFail: true });
  assert.match(out, /Session not found/);
});

test('sem sessoes nenhuma falha com mensagem clara', () => {
  const vazio = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-vazio-'));
  const out = run(['--list'], { home: vazio, expectFail: true });
  assert.match(out, /No agent session found/);
});

test('fluxo sem args funciona no modo nao interativo (pipe) e resolve {chosen,batch}', () => {
  const out = run([], { input: '1\n' });
  assert.match(out, /Alpha/, 'lista as sessoes antes de perguntar');
  assert.match(out, /Beta/);
  assert.match(out, /Opening C:\\DEV\\Beta/, 'abre a escolhida (item 1 da lista)');
});

test('cancelar no modo nao interativo nao imprime nada do lote', () => {
  const out = run([], { input: '\n' });
  assert.match(out, /Cancelled\./);
  assert.doesNotMatch(out, /Opening/);
});

function makeHomeWithSecret() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-cli-secret-'));
  const proj = path.join(home, '.claude', 'projects', 'C--DEV');
  fs.mkdirSync(proj, { recursive: true });

  // Valor sintetico montado em runtime: formato valido, conteudo inventado.
  // Ver test/scan.test.js - uma string com formato real de credencial,
  // mesmo falsa, ja disparou o scanner de segredo do GitHub neste repo.
  const fakeAws = `AK${'IA'}${'Q'.repeat(16)}`;
  const file = path.join(proj, 'ccc33333-3333-3333-3333-333333333333.jsonl');

  fs.writeFileSync(
    file,
    [
      JSON.stringify({ cwd: 'C:\DEV\Gamma', sessionId: 'ccc33333-3333-3333-3333-333333333333' }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: `minha chave: ${fakeAws}` } }),
    ].join('\n'),
    'utf8'
  );

  // Sessao fora da janela de "possivelmente ativa" (5 minutos) do redact.
  const antiga = new Date(Date.now() - 10 * 60 * 1000);
  fs.utimesSync(file, antiga, antiga);

  return { home, file, fakeAws };
}

test('scan encontra o segredo sem imprimir o valor', () => {
  const { home, fakeAws } = makeHomeWithSecret();
  const out = run(['scan'], { home, expectFail: true });

  assert.match(out, /AWS access key/i);
  assert.doesNotMatch(out, new RegExp(fakeAws), 'o valor never aparece no relatorio');
});

test('scan --redact remove o segredo do arquivo de verdade', () => {
  const { home, file, fakeAws } = makeHomeWithSecret();

  run(['scan', '--redact'], { home });

  const depois = fs.readFileSync(file, 'utf8');
  assert.ok(!depois.includes(fakeAws), 'o valor sumiu do arquivo');
  assert.ok(depois.includes('[REDACTED]'));
  assert.doesNotThrow(() => depois.split('\n').filter(Boolean).forEach((l) => JSON.parse(l)), 'continua JSON valido');
});

test('scan --redact --json nunca inclui o valor do segredo', () => {
  const { home, fakeAws } = makeHomeWithSecret();
  const out = run(['scan', '--redact', '--json'], { home });

  assert.doesNotMatch(out, new RegExp(fakeAws));
  const parsed = JSON.parse(out);
  assert.ok(parsed.redacted.sessions[0].occurrencesRemoved >= 1);
});
