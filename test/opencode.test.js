const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const opencode = require('../src/agents/opencode');

function makeDb(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-opencode-test-'));
  const file = path.join(dir, 'opencode.db');
  const db = new DatabaseSync(file);

  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      directory TEXT,
      title TEXT,
      time_updated INTEGER,
      time_archived INTEGER
    )
  `);

  const insert = db.prepare(
    'INSERT INTO session (id, parent_id, directory, title, time_updated, time_archived) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const row of rows) {
    insert.run(
      row.id,
      row.parent_id ?? null,
      row.directory,
      row.title ?? null,
      row.time_updated,
      row.time_archived ?? null
    );
  }

  db.close();
  return file;
}

test('le sessoes raiz do opencode, mais recente primeiro', () => {
  const file = makeDb([
    { id: 'ses_1', directory: 'C:/DEV/App', title: 'Primeira', time_updated: 1000 },
    { id: 'ses_2', directory: 'C:/DEV/Outro', title: 'Segunda', time_updated: 2000 },
  ]);

  const sessions = opencode.scan(file);
  assert.strictEqual(sessions.length, 2);
  assert.strictEqual(sessions[0].sessionId, 'ses_2', 'mais recente primeiro');
  assert.strictEqual(sessions[0].agent, 'opencode');
});

test('barra normal do diretorio vira barra invertida (Windows grava assim)', () => {
  const file = makeDb([{ id: 'ses_1', directory: 'C:/DEV/App/Sub', title: 't', time_updated: 1 }]);

  const [session] = opencode.scan(file);
  assert.strictEqual(session.dir, 'C:\\DEV\\App\\Sub');
});

test('sessao filha (com parent_id) fica de fora', () => {
  const file = makeDb([
    { id: 'ses_pai', directory: 'C:/DEV', title: 'Pai', time_updated: 2 },
    { id: 'ses_filha', parent_id: 'ses_pai', directory: 'C:/DEV', title: 'Filha', time_updated: 3 },
  ]);

  const sessions = opencode.scan(file);
  assert.strictEqual(sessions.length, 1);
  assert.strictEqual(sessions[0].sessionId, 'ses_pai');
});

test('sessao arquivada fica de fora', () => {
  const file = makeDb([
    { id: 'ses_ativa', directory: 'C:/DEV', title: 'Ativa', time_updated: 1 },
    { id: 'ses_arquivada', directory: 'C:/DEV', title: 'Arquivada', time_updated: 2, time_archived: 999 },
  ]);

  const sessions = opencode.scan(file);
  assert.strictEqual(sessions.length, 1);
  assert.strictEqual(sessions[0].sessionId, 'ses_ativa');
});

test('sessao sem titulo cai no placeholder, igual aos outros agentes', () => {
  const file = makeDb([{ id: 'ses_1', directory: 'C:/DEV', title: null, time_updated: 1 }]);

  const [session] = opencode.scan(file);
  assert.strictEqual(session.title, null);
  assert.strictEqual(session.summary, '(sem mensagens)');
});

test('banco inexistente devolve lista vazia em vez de quebrar', () => {
  assert.deepStrictEqual(opencode.scan('C:\\nao\\existe\\opencode.db'), []);
});

test('sem OPENCODE_DB e sem instalacao, dbPath() nao quebra', () => {
  const antes = process.env.OPENCODE_DB;
  delete process.env.OPENCODE_DB;

  assert.doesNotThrow(() => opencode.dbPath());

  if (antes !== undefined) process.env.OPENCODE_DB = antes;
});

test('OPENCODE_DB sobrescreve o caminho padrao', () => {
  const file = makeDb([{ id: 'ses_1', directory: 'C:/DEV', title: 'Via env', time_updated: 1 }]);
  const antes = process.env.OPENCODE_DB;
  process.env.OPENCODE_DB = file;

  try {
    assert.strictEqual(opencode.dbPath(), file);
  } finally {
    if (antes === undefined) delete process.env.OPENCODE_DB;
    else process.env.OPENCODE_DB = antes;
  }
});

test('resumeArgs monta o comando do opencode', () => {
  const args = opencode.resumeArgs({ sessionId: 'ses_abc123' });
  assert.deepStrictEqual(args, ['opencode', '--session', 'ses_abc123']);
});

test('entra no scanAll junto com os outros agentes', async () => {
  const { AGENTS } = require('../src/agents');
  assert.ok(AGENTS.some((a) => a.id === 'opencode'));
});
