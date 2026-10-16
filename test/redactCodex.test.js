const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const { redactCodexDb, existingTextColumns } = require('../src/scan/redactCodex');
const { redactSession } = require('../src/scan/redactSession');

// Credencial sintetica montada em runtime: formato valido, conteudo inventado.
// Ver test/scan.test.js - uma string com formato real de credencial, mesmo
// falsa, ja disparou o scanner de segredo do GitHub neste repo.
const AWS = `AK${'IA'}${'Q'.repeat(16)}`;
const ID = '0199aaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const COLUNAS_COMPLETAS = `CREATE TABLE threads (
  id TEXT PRIMARY KEY, cwd TEXT, title TEXT, name TEXT, first_user_message TEXT,
  preview TEXT, git_branch TEXT, tokens_used INTEGER, model TEXT,
  rollout_path TEXT, updated_at_ms INTEGER, archived INTEGER DEFAULT 0
)`;

function fazerBanco({ schema = COLUNAS_COMPLETAS, linha } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-codexdb-'));
  const file = path.join(dir, 'state_5.sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec(schema);

  const campos = Object.keys(linha);
  db.prepare(
    `INSERT INTO threads (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`
  ).run(...campos.map((c) => linha[c]));
  db.close();

  return { dir, file };
}

function dirTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-vazio-'));
}

function ler(file, coluna) {
  const db = new DatabaseSync(file, { readOnly: true });
  const row = db.prepare(`SELECT ${coluna} AS v FROM threads WHERE id = ?`).get(ID);
  db.close();
  return row ? row.v : null;
}

test('limpa o segredo das colunas de texto do banco', () => {
  const { file } = fazerBanco({
    linha: { id: ID, cwd: 'C:\\DEV', first_user_message: `minha chave: ${AWS}`, title: 'Refatora frete' },
  });

  const r = redactCodexDb(file, ID);

  assert.strictEqual(r.changed, 1);
  assert.strictEqual(ler(file, 'first_user_message'), 'minha chave: [REDACTED]');
  assert.strictEqual(ler(file, 'title'), 'Refatora frete', 'coluna sem segredo fica intacta');
});

test('limpa mais de uma coluna quando o segredo esta em varias', () => {
  const { file } = fazerBanco({
    linha: { id: ID, cwd: 'C:\\DEV', first_user_message: `chave ${AWS}`, name: `nota ${AWS}`, preview: `p ${AWS}` },
  });

  const r = redactCodexDb(file, ID);

  assert.strictEqual(r.changed, 3);
  assert.strictEqual(r.columns, 3);
  for (const c of ['first_user_message', 'name', 'preview']) {
    assert.ok(!ler(file, c).includes(AWS), `${c} foi limpa`);
  }
});

test('sessao sem segredo nenhum nao reescreve nada', () => {
  const { file } = fazerBanco({
    linha: { id: ID, cwd: 'C:\\DEV', first_user_message: 'conversa comum, sem credencial' },
  });

  const r = redactCodexDb(file, ID);

  assert.strictEqual(r.changed, 0);
  assert.strictEqual(ler(file, 'first_user_message'), 'conversa comum, sem credencial');
});

// A documentacao do Codex avisa que "algumas instalacoes tem conjuntos de
// coluna mais antigos ou mais novos" - pedir uma coluna que nao existe
// derrubaria a query inteira e o redact falharia por completo.
test('schema sem algumas colunas de texto nao quebra: usa so as que existem', () => {
  const schema = 'CREATE TABLE threads (id TEXT PRIMARY KEY, cwd TEXT, first_user_message TEXT)';
  const { file } = fazerBanco({ schema, linha: { id: ID, cwd: 'C:\\DEV', first_user_message: `k ${AWS}` } });

  const db = new DatabaseSync(file, { readOnly: true });
  assert.deepStrictEqual(existingTextColumns(db), ['first_user_message']);
  db.close();

  const r = redactCodexDb(file, ID);
  assert.strictEqual(r.changed, 1);
  assert.ok(!ler(file, 'first_user_message').includes(AWS));
});

test('schema sem coluna de texto alguma sai sem tocar no banco', () => {
  const schema = 'CREATE TABLE threads (id TEXT PRIMARY KEY, cwd TEXT, model TEXT)';
  const { file } = fazerBanco({ schema, linha: { id: ID, cwd: 'C:\\DEV', model: 'gpt-5-codex' } });

  const r = redactCodexDb(file, ID);
  assert.strictEqual(r.changed, 0);
  assert.strictEqual(r.skipped, 'sem-colunas-de-texto');
});

test('sessao que nao esta no banco nao e erro, e so nada a fazer', () => {
  const { file } = fazerBanco({ linha: { id: 'outro-id', cwd: 'C:\\DEV', first_user_message: 'x' } });

  const r = redactCodexDb(file, ID);
  assert.strictEqual(r.changed, 0);
  assert.strictEqual(r.skipped, 'sessao-nao-esta-no-banco');
});

test('banco inexistente devolve skipped, nao excecao', () => {
  const r = redactCodexDb(path.join(os.tmpdir(), 'nao-existe-nexo.sqlite'), ID);
  assert.strictEqual(r.changed, 0);
  assert.strictEqual(r.skipped, 'sem-banco');
});

test('dbPath null (instalacao antiga, so rollout) devolve skipped', () => {
  const r = redactCodexDb(null, ID);
  assert.strictEqual(r.skipped, 'sem-banco');
});

test('banco em uso por outro processo devolve busy, sem escrever nada', async () => {
  const { file } = fazerBanco({
    linha: { id: ID, cwd: 'C:\\DEV', first_user_message: `minha chave: ${AWS}` },
  });

  // Processo concorrente segura uma transacao de ESCRITA - exatamente o que o
  // Codex faz ao gravar um turno. E o cenario que a trava de lock existe pra
  // detectar: sem ela, o redact escreveria por baixo de um agente ativo.
  const script = `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(${JSON.stringify(file)});
    db.exec('BEGIN IMMEDIATE');
    db.exec("UPDATE threads SET cwd = 'travado'");
    setTimeout(() => { try { db.exec('ROLLBACK'); db.close(); } catch {} }, 4000);
  `;
  const kid = spawn(process.execPath, ['-e', script], { stdio: 'ignore' });

  try {
    await new Promise((r) => setTimeout(r, 500));

    const r = redactCodexDb(file, ID);
    assert.strictEqual(r.busy, true, 'reconhece que o banco esta em uso');
    assert.strictEqual(r.changed, 0);
    assert.ok(ler(file, 'first_user_message').includes(AWS), 'o segredo NAO foi tocado');
  } finally {
    kid.kill();
  }
});

test('redactSession no Codex limpa rollout E banco, e reporta cada um', () => {
  const { dir, file } = fazerBanco({
    linha: { id: ID, cwd: 'C:\\DEV', first_user_message: `minha chave: ${AWS}` },
  });

  const rollout = path.join(dir, 'rollout.jsonl');
  fs.writeFileSync(
    rollout,
    [
      JSON.stringify({ type: 'session_meta', payload: { id: ID, cwd: 'C:\\DEV' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `chave: ${AWS}` }] } }),
    ].join('\n'),
    'utf8'
  );

  const outcome = redactSession({ agent: 'codex', sessionId: ID, filePath: rollout, dbPath: file });

  assert.strictEqual(outcome.dbChanged, 1, 'limpou o banco');
  assert.strictEqual(outcome.rolloutChanged, 1, 'limpou o rollout');
  assert.strictEqual(outcome.changed, 2, 'o total soma os dois destinos');
  assert.ok(!outcome.partial);

  const depois = fs.readFileSync(rollout, 'utf8');
  assert.ok(!depois.includes(AWS), 'segredo sumiu do rollout');
  assert.ok(!ler(file, 'first_user_message').includes(AWS), 'segredo sumiu do banco');
  assert.ok(
    depois.split('\n').every((l) => !l.trim() || (() => { try { JSON.parse(l); return true; } catch { return false; } })()),
    'toda linha do rollout segue JSON valido'
  );
  assert.strictEqual(JSON.parse(depois.split('\n')[0]).payload.id, ID, 'session_meta intacto');
});

// Se o banco esta ocupado, o rollout tambem nao pode ser tocado: meia limpeza
// e pior que nenhuma, porque o relatorio diria sucesso com copia ainda em
// disco. O banco entra primeiro justamente para servir de porta.
test('banco ocupado impede ate a limpeza do rollout - nada fica parcial', async () => {
  const { dir, file } = fazerBanco({
    linha: { id: ID, cwd: 'C:\\DEV', first_user_message: `minha chave: ${AWS}` },
  });

  const rollout = path.join(dir, 'rollout.jsonl');
  const conteudo = JSON.stringify({ type: 'response_item', payload: { text: `chave: ${AWS}` } });
  fs.writeFileSync(rollout, conteudo, 'utf8');

  const script = `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(${JSON.stringify(file)});
    db.exec('BEGIN IMMEDIATE');
    db.exec("UPDATE threads SET cwd = 'travado'");
    setTimeout(() => { try { db.exec('ROLLBACK'); db.close(); } catch {} }, 4000);
  `;
  const kid = spawn(process.execPath, ['-e', script], { stdio: 'ignore' });

  try {
    await new Promise((r) => setTimeout(r, 500));

    const outcome = redactSession({ agent: 'codex', sessionId: ID, filePath: rollout, dbPath: file });

    assert.strictEqual(outcome.dbBusy, true);
    assert.strictEqual(outcome.changed, 0);
    assert.strictEqual(fs.readFileSync(rollout, 'utf8'), conteudo, 'o rollout ficou exatamente como estava');
  } finally {
    kid.kill();
  }
});

test('redactSession no Claude continua so no arquivo, sem campo de banco', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-cl-'));
  const file = path.join(dir, 'sessao.jsonl');
  fs.writeFileSync(file, JSON.stringify({ message: { content: `chave: ${AWS}` } }), 'utf8');

  const outcome = redactSession({ agent: 'claude', sessionId: 'abc', filePath: file });

  assert.strictEqual(outcome.changed, 1);
  assert.strictEqual(outcome.dbChanged, undefined, 'Claude nao tem banco - o campo nem aparece');
  assert.ok(!fs.readFileSync(file, 'utf8').includes(AWS));
});

test('only restringe a limpeza do banco ao achado selecionado', () => {
  const GH = `ghp_${'b'.repeat(36)}`;
  const { file } = fazerBanco({
    linha: { id: ID, cwd: 'C:\\DEV', first_user_message: `aws ${AWS} e github ${GH}` },
  });

  const { mask } = require('../src/scan');
  const so = new Set([`aws-access-key|${mask(AWS)}`]);

  const r = redactCodexDb(file, ID, { only: so });

  const depois = ler(file, 'first_user_message');
  assert.strictEqual(r.changed, 1);
  assert.ok(!depois.includes(AWS), 'o achado selecionado saiu');
  assert.ok(depois.includes(GH), 'o que nao foi selecionado permanece');
});

// Regressao: a query do adaptador nomeava 10 colunas fixas, e UMA ausente
// derrubava a consulta inteira - o catch devolvia null e o scan caia no
// fallback de JSONL em silencio, perdendo branch, model, tokens e o dbPath
// (sem o qual o redact nao limpa o banco). A doc do Codex avisa que o
// conjunto de colunas varia entre instalacoes.
test('montarQuery se adapta ao schema em vez de exigir as 10 colunas', () => {
  const { montarQuery } = require('../src/agents/codex');
  const set = (...c) => new Set(c);

  const completo = montarQuery(set('id', 'cwd', 'title', 'name', 'first_user_message', 'git_branch', 'tokens_used', 'model', 'rollout_path', 'updated_at_ms', 'updated_at', 'archived'));
  assert.match(completo, /COALESCE\(updated_at_ms, updated_at \* 1000\)/);
  assert.match(completo, /WHERE archived = 0/);

  // So updated_at_ms (o caso que quebrava antes)
  const soMs = montarQuery(set('id', 'cwd', 'first_user_message', 'updated_at_ms'));
  assert.match(soMs, /updated_at_ms AS updated/);
  assert.doesNotMatch(soMs, /COALESCE/);
  assert.doesNotMatch(soMs, /archived/, 'sem a coluna archived, nao filtra por ela');
  assert.doesNotMatch(soMs, /git_branch/, 'coluna ausente nao entra no SELECT');

  // So updated_at (instalacao antiga)
  assert.match(montarQuery(set('id', 'cwd', 'updated_at')), /updated_at \* 1000 AS updated/);

  // Sem nenhuma das duas: ainda lista, so sem ordenar por recencia
  assert.match(montarQuery(set('id', 'cwd')), /0 AS updated/);

  // id ou cwd ausente: a linha nao identifica sessao/projeto, o fallback de
  // JSONL e a resposta certa.
  assert.strictEqual(montarQuery(set('cwd', 'title')), null);
  assert.strictEqual(montarQuery(set('id', 'title')), null);
});

test('schema sem updated_at ainda produz sessao com dbPath - o redact depende dele', () => {
  const schema = `CREATE TABLE threads (
    id TEXT PRIMARY KEY, cwd TEXT, first_user_message TEXT, rollout_path TEXT,
    updated_at_ms INTEGER, archived INTEGER DEFAULT 0
  )`;
  const { dir, file } = fazerBanco({
    schema,
    linha: { id: ID, cwd: 'C:\DEV\P', first_user_message: `chave ${AWS}`, updated_at_ms: Date.now(), archived: 0 },
  });

  const codex = require('../src/agents/codex');
  const sessoes = codex.scan(dir);

  assert.strictEqual(sessoes.length, 1, 'leu do SQLite, nao caiu no fallback');
  assert.strictEqual(sessoes[0].dbPath, file, 'dbPath presente, senao o redact nao limpa o banco');
  assert.strictEqual(sessoes[0].sessionId, ID);
});

// Ponto cego: o scan varria so o arquivo. Se o rollout foi rotacionado ou
// apagado e a linha do banco ficou, o relatorio dizia "nada encontrado"
// enquanto a lista do nexo exibia a credencial na tela como resumo da sessao.
// Achar e dizer que esta limpo e pior que nao achar.
test('scan acha segredo que esta SO no metadado, sem rollout em disco', async () => {
  const schema = `CREATE TABLE threads (
    id TEXT PRIMARY KEY, cwd TEXT, first_user_message TEXT, rollout_path TEXT,
    updated_at_ms INTEGER, archived INTEGER DEFAULT 0
  )`;
  const { dir, file } = fazerBanco({
    schema,
    linha: {
      id: ID,
      cwd: 'C:\DEV\P',
      first_user_message: `minha chave: ${AWS}`,
      rollout_path: path.join(dirTemp(), 'nao-existe.jsonl'),
      updated_at_ms: Date.now() - 3600000,
      archived: 0,
    },
  });

  const codex = require('../src/agents/codex');
  const { scanSessions } = require('../src/scan');
  const [sessao] = codex.scan(dir);

  const results = await scanSessions([sessao], { cacheFile: path.join(dir, 'c.json') });

  assert.strictEqual(results.length, 1, 'o segredo do banco nao passa batido');
  const f = results[0].findings[0];
  assert.strictEqual(f.confidence, 'alta');
  assert.strictEqual(f.firstLine, 0, 'line 0 marca "veio do metadado, nao de uma linha"');
  assert.strictEqual(f.inMetadata, true);

  // E o redact resolve, mesmo sem rollout nenhum para reescrever.
  const outcome = redactSession({ agent: 'codex', sessionId: ID, filePath: null, dbPath: file });
  assert.strictEqual(outcome.dbChanged, 1);
  assert.strictEqual(outcome.rolloutChanged, 0);
  assert.ok(!ler(file, 'first_user_message').includes(AWS));
});

test('groupFindings nao deixa o metadado apagar o numero de linha real', () => {
  const { groupFindings } = require('../src/scan');
  const grupos = groupFindings([
    { line: 7, rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: 'AKI***QQ', length: 20 },
    { line: 0, rule: 'aws-access-key', label: 'AWS', confidence: 'alta', masked: 'AKI***QQ', length: 20, inMetadata: true },
  ]);

  assert.strictEqual(grupos.length, 1, 'mesmo segredo nos dois lugares agrupa');
  assert.strictEqual(grupos[0].firstLine, 7, 'mantem a linha REAL, nao o 0 do metadado');
  assert.strictEqual(grupos[0].inMetadata, true, 'e ainda registra que esta no metadado tambem');
  assert.strictEqual(grupos[0].occurrences, 2);
});
