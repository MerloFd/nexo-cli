const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeDir } = require('../paths');

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');

// O Codex atual indexa as sessoes em SQLite; instalacoes antigas so tem os
// rollouts JSONL + session_index.jsonl. Le o SQLite e cai no JSONL se faltar.
function stateDbPath(home) {
  let entries;
  try {
    entries = fs.readdirSync(home);
  } catch {
    return null;
  }

  const candidates = entries
    .filter((name) => /^state(_\d+)?\.sqlite$/.test(name))
    .sort()
    .reverse();

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

function scanSqlite(home) {
  const dbPath = stateDbPath(home);
  if (!dbPath) return null;

  let handle;
  try {
    handle = openSnapshot(dbPath);
    const rows = handle.db
      .prepare(
        `SELECT id, cwd, title, name, first_user_message, git_branch,
                tokens_used, model, rollout_path,
                COALESCE(updated_at_ms, updated_at * 1000) AS updated
         FROM threads
         WHERE archived = 0
         ORDER BY updated DESC`
      )
      .all();

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
      filePath: row.rollout_path || null,
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

module.exports = { id: 'codex', label: 'codex', scan, resumeArgs, CODEX_HOME };
