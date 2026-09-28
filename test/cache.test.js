const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scanSessions } = require('../src/scanSessions');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-cache-'));
  const projects = path.join(root, 'projects');
  const proj = path.join(projects, 'C--DEV');
  fs.mkdirSync(proj, { recursive: true });
  return { root, projects, proj, cacheFile: path.join(root, 'cache.json') };
}

function writeSession(proj, name, { cwd = 'C:\\DEV', title = null, message = 'primeira' } = {}) {
  const lines = [
    JSON.stringify({ cwd, sessionId: name }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: message } }),
  ];
  if (title) lines.push(JSON.stringify({ type: 'custom-title', customTitle: title }));
  fs.writeFileSync(path.join(proj, `${name}.jsonl`), lines.join('\n'), 'utf8');
}

test('segunda leitura usa o cache e devolve o mesmo resultado', async () => {
  const { projects, proj, cacheFile } = fixture();
  writeSession(proj, 'a', { title: 'TITULO A' });

  const first = await scanSessions(projects, { cacheFile });
  assert.ok(fs.existsSync(cacheFile), 'cache foi gravado');

  const second = await scanSessions(projects, { cacheFile });
  assert.deepStrictEqual(second, first);
});

test('cache nao mascara conteudo novo quando o arquivo muda', async () => {
  const { projects, proj, cacheFile } = fixture();
  writeSession(proj, 'a', { title: 'ANTIGO' });

  const before = await scanSessions(projects, { cacheFile });
  assert.strictEqual(before[0].title, 'ANTIGO');

  writeSession(proj, 'a', { title: 'NOVO', message: 'outra mensagem bem maior para mudar o tamanho' });
  const after = await scanSessions(projects, { cacheFile });

  assert.strictEqual(after[0].title, 'NOVO', 'mudanca no arquivo invalida a entrada');
});

test('sessao removida some do cache', async () => {
  const { projects, proj, cacheFile } = fixture();
  writeSession(proj, 'a');
  writeSession(proj, 'b');

  assert.strictEqual((await scanSessions(projects, { cacheFile })).length, 2);

  fs.unlinkSync(path.join(proj, 'b.jsonl'));
  const after = await scanSessions(projects, { cacheFile });

  assert.strictEqual(after.length, 1);
  const saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  assert.strictEqual(Object.keys(saved.entries).length, 1, 'cache nao acumula entradas mortas');
});

test('cache corrompido nao derruba o scan', async () => {
  const { projects, proj, cacheFile } = fixture();
  writeSession(proj, 'a', { title: 'VALE' });
  fs.writeFileSync(cacheFile, '{isso nao e json', 'utf8');

  const sessions = await scanSessions(projects, { cacheFile });
  assert.strictEqual(sessions[0].title, 'VALE');
});

test('cache de versao antiga e ignorado', async () => {
  const { projects, proj, cacheFile } = fixture();
  writeSession(proj, 'a', { title: 'ATUAL' });
  fs.writeFileSync(cacheFile, JSON.stringify({ version: 0, entries: { x: { title: 'LIXO' } } }), 'utf8');

  const sessions = await scanSessions(projects, { cacheFile });
  assert.strictEqual(sessions.length, 1);
  assert.strictEqual(sessions[0].title, 'ATUAL');
});

test('NEXO_NO_CACHE desliga a escrita do cache', async () => {
  const { projects, proj, cacheFile } = fixture();
  writeSession(proj, 'a');

  process.env.NEXO_NO_CACHE = '1';
  try {
    const sessions = await scanSessions(projects, { cacheFile });
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(fs.existsSync(cacheFile), false);
  } finally {
    delete process.env.NEXO_NO_CACHE;
  }
});
