const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeDir } = require('../paths');

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');

// O Codex atual indexa as sessoes em SQLite; instalacoes antigas so tem os
// rollouts JSONL + session_index.jsonl. Le o SQLite e cai no JSONL se faltar.

// O sufixo e o numero da migracao do Codex (state.sqlite, state_5.sqlite...),
// e o maior e o atual. Ordenar como TEXTO colocaria state_9 acima de state_10
// ("9" > "1" lexicograficamente) e o nexo passaria a ler um banco velho na
// virada da dezena - comparar o numero evita isso. Sem sufixo conta como 0,
// porque o state.sqlite sem numero e o mais antigo de todos.
function migrationNumber(name) {
  const m = /^state(?:_(\d+))?\.sqlite$/.exec(name);
  return m ? Number(m[1] || 0) : -1;
}

function stateDbPath(home) {
  let entries;
  try {
    entries = fs.readdirSync(home);
  } catch {
    return null;
  }

  const candidates = entries
    .filter((name) => migrationNumber(name) >= 0)
    .sort((a, b) => migrationNumber(b) - migrationNumber(a));

  return candidates.length ? path.join(home, candidates[0]) : null;
}

// O processo do Codex mantem o banco aberto em WAL: copiar antes de ler evita
// disputar lock e enxergar um estado pela metade.
function openSnapshot(dbPath) {
  const { DatabaseSync } = require('node:sqlite');
  const snapshot = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-codex-')),
    'state.sqlite'
  );

  for (const suffix of ['', '-wal', '-shm']) {
    const from = `${dbPath}${suffix}`;
    if (fs.existsSync(from)) fs.copyFileSync(from, `${snapshot}${suffix}`);
  }

  return { db: new DatabaseSync(snapshot, { readOnly: true }), snapshot };
}

function fileSize(filePath) {
  if (!filePath) return null;
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

// Colunas opcionais: o Codex muda o schema entre versoes de migracao (a
// propria documentacao avisa que "algumas instalacoes tem conjuntos de coluna
// mais antigos ou mais novos"). Nomear as 10 fixas na query fazia UMA coluna
// ausente derrubar a consulta inteira - e o catch la embaixo mandava o scan
// cair no fallback de JSONL sem avisar nada, perdendo branch, model, tokens e
// o caminho do banco. Mesmo formato de falha silenciosa que inutilizou o
// adaptador do opencode; aqui a query se monta a partir do que o banco tem.
const COLUNAS_OPCIONAIS = [
  'title',
  'name',
  'first_user_message',
  'git_branch',
  'tokens_used',
  'model',
  'rollout_path',
];

function colunasDe(db, tabela) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name));
  } catch {
    return new Set();
  }
}

// id e cwd sao as duas unicas indispensaveis: sem elas a linha nao identifica
// uma sessao nem um projeto, e nesse caso o fallback de JSONL e a resposta certa.
function montarQuery(presentes) {
  if (!presentes.has('id') || !presentes.has('cwd')) return null;

  const campos = ['id', 'cwd', ...COLUNAS_OPCIONAIS.filter((c) => presentes.has(c))];

  // updated_at_ms e updated_at sao duas grafias do mesmo dado em versoes
  // diferentes; usa a que existir, e 0 se nenhuma existir (a lista so perde a
  // ordenacao por recencia, em vez de nao aparecer).
  if (presentes.has('updated_at_ms') && presentes.has('updated_at')) {
    campos.push('COALESCE(updated_at_ms, updated_at * 1000) AS updated');
  } else if (presentes.has('updated_at_ms')) {
    campos.push('updated_at_ms AS updated');
  } else if (presentes.has('updated_at')) {
    campos.push('updated_at * 1000 AS updated');
  } else {
    campos.push('0 AS updated');
  }

  const where = presentes.has('archived') ? 'WHERE archived = 0' : '';
  return `SELECT ${campos.join(', ')} FROM threads ${where} ORDER BY updated DESC`;
}

function scanSqlite(home) {
  const dbPath = stateDbPath(home);
  if (!dbPath) return null;

  let handle;
  try {
    handle = openSnapshot(dbPath);

    const query = montarQuery(colunasDe(handle.db, 'threads'));
    if (!query) return null;

    const rows = handle.db.prepare(query).all();

    return rows.map((row) => ({
      agent: 'codex',
      sessionId: row.id,
      dir: normalizeDir(row.cwd),
      title: row.name || row.title || null,
      summary: row.first_user_message || row.title || '(sem mensagens)',
      mtime: Number(row.updated) || 0,
      branch: row.git_branch || null,
      model: row.model || null,
      // Diferente do Claude: aqui e o consumo acumulado da sessao inteira,
      // nao o contexto ocupado agora.
      tokens: Number(row.tokens_used) || null,
      tokensKind: row.tokens_used ? 'cumulative' : null,
      bytes: fileSize(row.rollout_path),
      filePath: row.rollout_path || null,
      // O banco de onde a linha veio - o redact precisa dele para limpar
      // tambem as colunas de texto (o segredo fica no rollout E aqui). E o
      // original, nao o snapshot: o snapshot morre no fim desta funcao.
      dbPath,
    }));
  } catch {
    return null;
  } finally {
    if (handle) {
      try {
        handle.db.close();
        fs.rmSync(path.dirname(handle.snapshot), { recursive: true, force: true });
      } catch {
        // snapshot e temporario, some com o sistema
      }
    }
  }
}

// O /rename faz append de uma linha nova com o mesmo id: vale a ultima.
function readTitleIndex(home) {
  const titles = new Map();
  const indexPath = path.join(home, 'session_index.jsonl');
  if (!fs.existsSync(indexPath)) return titles;

  let content;
  try {
    content = fs.readFileSync(indexPath, 'utf8');
  } catch {
    return titles;
  }

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.id && entry.thread_name) titles.set(entry.id, entry.thread_name);
    } catch {
      continue;
    }
  }

  return titles;
}

function collectRollouts(dir, found = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectRollouts(full, found);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push(full);
  }

  return found;
}

// Cada session_meta embute o system prompt inteiro (~10KB) e se repete a cada
// resume, entao extrai id/cwd por regex em vez de parsear a linha toda.
const ID_RE = /"id":"([0-9a-fA-F-]{16,})"/;
const CWD_RE = /"cwd":"((?:[^"\\]|\\.)*)"/g;

function readRolloutMeta(filePath) {
  let head;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    const read = fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);
    head = buffer.toString('utf8', 0, read);
  } catch {
    return null;
  }

  const id = head.match(ID_RE);
  if (!id) return null;

  let cwd = null;
  for (const match of head.matchAll(CWD_RE)) cwd = match[1];
  if (!cwd) return null;

  return { id: id[1], cwd: normalizeDir(JSON.parse(`"${cwd}"`)) };
}

function scanRollouts(home) {
  const sessionsDir = path.join(home, 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];

  const titles = readTitleIndex(home);

  return collectRollouts(sessionsDir)
    .map((filePath) => {
      try {
        const meta = readRolloutMeta(filePath);
        if (!meta) return null;

        return {
          agent: 'codex',
          sessionId: meta.id,
          dir: meta.cwd,
          title: titles.get(meta.id) || null,
          summary: titles.get(meta.id) || '(sem mensagens)',
          mtime: fs.statSync(filePath).mtimeMs,
          filePath,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function scan(home = CODEX_HOME) {
  if (!fs.existsSync(home)) return [];

  const fromDb = scanSqlite(home);
  if (fromDb && fromDb.length) return fromDb;

  return scanRollouts(home);
}

// `codex resume` adota o cwd de quem chamou, nao o da sessao (issue #4791),
// entao quem abre o terminal precisa entrar no diretorio antes.
function resumeArgs(session) {
  return ['codex', 'resume', session.sessionId];
}

module.exports = {
  id: 'codex',
  label: 'codex',
  scan,
  resumeArgs,
  stateDbPath,
  migrationNumber,
  montarQuery,
  CODEX_HOME,
};
