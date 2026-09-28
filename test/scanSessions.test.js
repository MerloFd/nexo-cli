const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Sem isso a suite escreveria no cache real do usuario em ~/.nexo-cache.json.
process.env.NEXO_NO_CACHE = '1';

const { scanSessions, daysAgo } = require('../src/scanSessions');

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-test-'));
  const projects = path.join(root, 'projects');
  const proj = path.join(projects, 'C--DEV');
  fs.mkdirSync(proj, { recursive: true });
  return { root, projects, proj };
}

function userLine(text, extra = {}) {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: text },
    ...extra,
  });
}

function write(dir, name, lines) {
  fs.writeFileSync(path.join(dir, name), lines.join('\n'), 'utf8');
}

test('diretorio inexistente devolve lista vazia', async () => {
  const sessions = await scanSessions(path.join(os.tmpdir(), 'nao-existe-nexo-xyz'));
  assert.deepStrictEqual(sessions, []);
});

test('sessao valida e lida corretamente', async () => {
  const { projects, proj } = makeFixture();
  write(proj, 'ok.jsonl', [
    JSON.stringify({ type: 'mode', sessionId: 'abc-123' }),
    JSON.stringify({ type: 'system', cwd: 'C:\\DEV' }),
    userLine('primeira mensagem real'),
  ]);

  const sessions = await scanSessions(projects);
  assert.strictEqual(sessions.length, 1);
  assert.strictEqual(sessions[0].dir, 'C:\\DEV');
  assert.strictEqual(sessions[0].sessionId, 'abc-123');
  assert.strictEqual(sessions[0].summary, 'primeira mensagem real');
});

test('arquivo vazio e ignorado', async () => {
  const { projects, proj } = makeFixture();
  fs.writeFileSync(path.join(proj, 'vazio.jsonl'), '', 'utf8');

  const sessions = await scanSessions(projects);
  assert.deepStrictEqual(sessions, []);
});

test('linhas corrompidas nao derrubam o scan', async () => {
  const { projects, proj } = makeFixture();
  write(proj, 'corrompido.jsonl', [
    '{isso nao e json',
    'null',
    '[]',
    '"string solta"',
    JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'id-ok' }),
    userLine('sobrevivi ao lixo'),
  ]);

  const sessions = await scanSessions(projects);
  assert.strictEqual(sessions.length, 1);
  assert.strictEqual(sessions[0].summary, 'sobrevivi ao lixo');
});

test('sessao sem cwd e descartada', async () => {
  const { projects, proj } = makeFixture();
  write(proj, 'sem-cwd.jsonl', [userLine('mensagem sem cwd')]);

  const sessions = await scanSessions(projects);
  assert.deepStrictEqual(sessions, []);
});

test('mensagens de ruido nao viram resumo', async () => {
  const { projects, proj } = makeFixture();
  write(proj, 'ruido.jsonl', [
    JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'ruidoso' }),
    userLine('<ide_opened_file>abriu arquivo</ide_opened_file>'),
    userLine('Caveat: The messages below were generated...'),
    userLine('This session is being continued from a previous conversation'),
    userLine('Base directory for this skill: C:\\algo'),
    userLine('essa aqui e a mensagem de verdade'),
  ]);

  const sessions = await scanSessions(projects);
  assert.strictEqual(sessions[0].summary, 'essa aqui e a mensagem de verdade');
});

test('sessao so com ruido cai no placeholder', async () => {
  const { projects, proj } = makeFixture();
  write(proj, 'so-ruido.jsonl', [
    JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'vazia' }),
    userLine('<ide_opened_file>x</ide_opened_file>'),
  ]);

  const sessions = await scanSessions(projects);
  assert.strictEqual(sessions[0].summary, '(sem mensagens)');
});

test('conteudo em blocos (array) e suportado', async () => {
  const { projects, proj } = makeFixture();
  write(proj, 'blocos.jsonl', [
    JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'blocos' }),
    userLine([{ type: 'image' }, { type: 'text', text: 'texto dentro de bloco' }]),
  ]);

  const sessions = await scanSessions(projects);
  assert.strictEqual(sessions[0].summary, 'texto dentro de bloco');
});

test('acentos e emojis sobrevivem, quebras de linha somem', async () => {
  const { projects, proj } = makeFixture();
  write(proj, 'unicode.jsonl', [
    JSON.stringify({ cwd: 'C:\\DEV\\Ação', sessionId: 'uni' }),
    userLine('linha um\nlinha dois\tcom tab 🚀 çãé'),
  ]);

  const sessions = await scanSessions(projects);
  assert.strictEqual(sessions[0].dir, 'C:\\DEV\\Ação');
  assert.strictEqual(sessions[0].summary, 'linha um linha dois com tab 🚀 çãé');
});

test('resumo gigante e truncado', async () => {
  const { projects, proj } = makeFixture();
  write(proj, 'gigante.jsonl', [
    JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'big' }),
    userLine('x'.repeat(5000)),
  ]);

  const sessions = await scanSessions(projects);
  assert.strictEqual(sessions[0].summary.length, 300);
});

test('id cai no nome do arquivo quando ausente no json', async () => {
  const { projects, proj } = makeFixture();
  write(proj, 'fallback-id.jsonl', [JSON.stringify({ cwd: 'C:\\DEV' })]);

  const sessions = await scanSessions(projects);
  assert.strictEqual(sessions[0].sessionId, 'fallback-id');
});

test('ordenacao por mtime decrescente', async () => {
  const { projects, proj } = makeFixture();
  write(proj, 'velha.jsonl', [JSON.stringify({ cwd: 'C:\\VELHA', sessionId: 'velha' })]);
  write(proj, 'nova.jsonl', [JSON.stringify({ cwd: 'C:\\NOVA', sessionId: 'nova' })]);

  const antiga = new Date(Date.now() - 5 * 86400000);
  fs.utimesSync(path.join(proj, 'velha.jsonl'), antiga, antiga);

  const sessions = await scanSessions(projects);
  assert.strictEqual(sessions[0].dir, 'C:\\NOVA');
  assert.strictEqual(sessions[1].dir, 'C:\\VELHA');
});

test('arquivos que nao sao .jsonl e subpastas sao ignorados', async () => {
  const { projects, proj } = makeFixture();
  fs.writeFileSync(path.join(proj, 'notas.txt'), 'nada', 'utf8');
  fs.mkdirSync(path.join(proj, 'memory'));
  write(proj, 'real.jsonl', [JSON.stringify({ cwd: 'C:\\DEV', sessionId: 'real' })]);

  const sessions = await scanSessions(projects);
  assert.strictEqual(sessions.length, 1);
});

test('daysAgo formata faixas de tempo', () => {
  assert.strictEqual(daysAgo(Date.now()), 'agora');
  assert.strictEqual(daysAgo(Date.now() - 5 * 60000), '5min atras');
  assert.strictEqual(daysAgo(Date.now() - 3 * 3600000), '3h atras');
  assert.strictEqual(daysAgo(Date.now() - 4 * 86400000), '4d atras');
  assert.strictEqual(daysAgo(Date.now() + 86400000), 'agora');
});

test('conta turnos como pares de user+assistant, ignorando o resto', async () => {
  const { countTurns } = require('../src/scanSessions');
  const { projects, proj } = makeFixture();
  write(proj, 'turnos.jsonl', [
    JSON.stringify({ cwd: 'C:\DEV', sessionId: 'x' }),
    userLine('primeira pergunta'),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'resposta 1' } }),
    JSON.stringify({ type: 'mode', mode: 'normal' }),
    userLine('segunda pergunta'),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'resposta 2' } }),
    JSON.stringify({ type: 'attachment', hookName: 'x' }),
  ]);

  const turns = await countTurns(path.join(proj, 'turnos.jsonl'));
  assert.strictEqual(turns, 4, '2 perguntas + 2 respostas, sem contar ruido');
});

test('sessao sem mensagem nenhuma tem 0 turnos, nao null', async () => {
  const { countTurns } = require('../src/scanSessions');
  const { proj } = makeFixture();
  write(proj, 'vazia.jsonl', [JSON.stringify({ cwd: 'C:\DEV', sessionId: 'x' })]);

  assert.strictEqual(await countTurns(path.join(proj, 'vazia.jsonl')), 0);
});

test('arquivo inexistente devolve null em vez de lancar excecao', async () => {
  const { countTurns } = require('../src/scanSessions');
  assert.strictEqual(await countTurns('C:\\nao\\existe\\arquivo.jsonl'), null);
});

test('scanSessions inclui turns no resultado', async () => {
  const { projects, proj } = makeFixture();
  write(proj, 'com-turnos.jsonl', [
    JSON.stringify({ cwd: 'C:\DEV', sessionId: 'y' }),
    userLine('oi'),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'ola' } }),
  ]);

  const [session] = await scanSessions(projects);
  assert.strictEqual(session.turns, 2);
});
