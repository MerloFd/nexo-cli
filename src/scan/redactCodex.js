const fs = require('fs');
const { findSecretsInValue, redactValue } = require('./redact');

// Colunas de texto curto escrito pelo usuario na tabela `threads`, onde um
// segredo colado pode acabar literalmente. Verificadas contra instalacao real
// (ver specs/003-codex-redact, FR-005). De proposito NAO inclui model,
// git_branch, cwd nem blobs de JSON de configuracao: sao metadado estruturado,
// e reescrever metadado por engano e pior que deixar um falso negativo.
const TEXT_COLUMNS = ['first_user_message', 'title', 'name', 'preview'];

// Nem toda versao do Codex tem as mesmas colunas (a propria documentacao
// avisa que "algumas instalacoes tem conjuntos mais antigos ou mais novos"),
// entao o UPDATE e montado a partir do que o banco realmente tem. Pedir uma
// coluna que nao existe derrubaria a query inteira.
function existingTextColumns(db) {
  const presentes = new Set(db.prepare('PRAGMA table_info(threads)').all().map((c) => c.name));
  return TEXT_COLUMNS.filter((c) => presentes.has(c));
}

// Quanto tempo esperar pelo lock antes de desistir. Curto de proposito: se o
// Codex esta escrevendo agora, a resposta certa e nao mexer, nao esperar.
const LOCK_TIMEOUT_MS = 250;

// O "possivelmente ativa" do Claude e uma heuristica de mtime porque um JSONL
// nao tem como dizer se esta em uso. Um banco tem: BEGIN IMMEDIATE pede o lock
// de escrita e o SQLite responde na hora se outro processo o detem. Isso e
// pergunta, nao adivinhacao - e tambem resolve o problema do WAL, onde o mtime
// do .sqlite principal pode nem mudar enquanto ha escrita acontecendo.
//
// Devolve { busy: true } quando o banco esta em uso, sem ter escrito nada.
function redactCodexDb(dbPath, sessionId, { only = null } = {}) {
  if (!dbPath || !fs.existsSync(dbPath)) return { changed: 0, skipped: 'sem-banco' };

  const { DatabaseSync } = require('node:sqlite');
  let db;

  try {
    db = new DatabaseSync(dbPath, { timeout: LOCK_TIMEOUT_MS });
  } catch (err) {
    return { changed: 0, error: err.message };
  }

  try {
    try {
      db.exec('BEGIN IMMEDIATE');
    } catch {
      // Banco em uso: alguem esta escrevendo. Nada foi tocado.
      return { changed: 0, busy: true };
    }

    const colunas = existingTextColumns(db);
    if (colunas.length === 0) {
      db.exec('ROLLBACK');
      return { changed: 0, skipped: 'sem-colunas-de-texto' };
    }

    const row = db
      .prepare(`SELECT ${colunas.join(', ')} FROM threads WHERE id = ?`)
      .get(sessionId);

    if (!row) {
      db.exec('ROLLBACK');
      return { changed: 0, skipped: 'sessao-nao-esta-no-banco' };
    }

    // Monta so o SET das colunas que de fato mudaram - uma coluna sem segredo
    // nao precisa ser reescrita, e nao reescrever reduz a chance de encostar
    // em algo que nao era o alvo.
    const sets = [];
    const valores = [];
    let total = 0;

    for (const coluna of colunas) {
      const valor = row[coluna];
      if (typeof valor !== 'string' || !valor) continue;

      const secrets = findSecretsInValue(valor, only);
      if (secrets.length === 0) continue;

      const countRef = { count: 0 };
      const limpo = redactValue(valor, secrets, countRef);
      if (countRef.count === 0) continue;

      sets.push(`${coluna} = ?`);
      valores.push(limpo);
      total += countRef.count;
    }

    if (sets.length === 0) {
      db.exec('ROLLBACK');
      return { changed: 0 };
    }

    db.prepare(`UPDATE threads SET ${sets.join(', ')} WHERE id = ?`).run(...valores, sessionId);
    db.exec('COMMIT');

    return { changed: total, columns: sets.length };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ja pode ter saido da transacao; o COMMIT e que importava
    }
    return { changed: 0, error: err.message };
  } finally {
    try {
      db.close();
    } catch {
      // fechar depois de erro pode falhar; nao muda o que ja foi commitado
    }
  }
}

module.exports = { redactCodexDb, existingTextColumns };
