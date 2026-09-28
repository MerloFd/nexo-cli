const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeDir } = require('../paths');

// O opencode segue a lib xdg-basedir, que NAO trata o Windows como caso
// especial: cai em %USERPROFILE%\.local\share em vez de %APPDATA%. Instalacao
// de canal beta/dev grava em opencode-<canal>.db no lugar de opencode.db.
function defaultDbPath() {
  const dir = path.join(os.homedir(), '.local', 'share', 'opencode');
  const preferido = path.join(dir, 'opencode.db');
  if (fs.existsSync(preferido)) return preferido;

  try {
    const alternativos = fs
      .readdirSync(dir)
      .filter((name) => /^opencode(-\w+)?\.db$/.test(name))
      .map((name) => path.join(dir, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return alternativos[0] || null;
  } catch {
    return null;
  }
}

function dbPath() {
  return process.env.OPENCODE_DB || defaultDbPath();
}

// O opencode mantem o banco aberto durante o uso: copiar antes de ler evita
// disputar lock com o processo ativo, mesmo cuidado do adaptador do Codex.
function openSnapshot(file) {
  const { DatabaseSync } = require('node:sqlite');
  const snapshot = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-opencode-')),
    'opencode.db'
  );

  for (const suffix of ['', '-wal', '-shm']) {
    const from = `${file}${suffix}`;
    if (fs.existsSync(from)) fs.copyFileSync(from, `${snapshot}${suffix}`);
  }

  return { db: new DatabaseSync(snapshot, { readOnly: true }), snapshot };
}

function scan(file = dbPath()) {
  if (!file || !fs.existsSync(file)) return [];

  let handle;
  try {
    handle = openSnapshot(file);
    const rows = handle.db
      .prepare(
        `SELECT id, directory, title, time_updated
         FROM session
         WHERE parent_id IS NULL AND time_archived IS NULL
         ORDER BY time_updated DESC`
      )
      .all();

    return rows.map((row) => ({
      agent: 'opencode',
      sessionId: row.id,
      dir: normalizeDir(row.directory),
      title: row.title || null,
      summary: row.title || '(sem mensagens)',
      mtime: Number(row.time_updated) || 0,
      branch: null,
      model: null,
      tokens: null,
      tokensKind: null,
      bytes: null,
      filePath: null,
    }));
  } catch {
    return [];
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

// Nao comprovado se o opencode re-adota o diretorio gravado na sessao ou
// confia no cwd de quem chama; o backend ja abre o terminal dentro de
// session.dir antes de rodar isso, entao cobre os dois casos de qualquer jeito.
function resumeArgs(session) {
  return ['opencode', '--session', session.sessionId];
}

module.exports = { id: 'opencode', label: 'opencode', scan, resumeArgs, dbPath };
