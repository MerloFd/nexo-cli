const { redactFile } = require('./redact');
const { redactCodexDb } = require('./redactCodex');

// Orquestracao de "limpar uma sessao", compartilhada pelo --redact direto
// (src/commands/scan.js) e pela tela interativa (src/scan/interactive.js).
// Mora num modulo proprio porque os dois caminhos precisam do MESMO
// comportamento: duplicar isso significaria um dos dois esquecer o banco do
// Codex e reportar sucesso com o segredo ainda em disco.

// O banco entra PRIMEIRO de proposito. Ele e o unico dos dois destinos que
// sabe dizer "estou em uso agora" (via lock de escrita), e isso vale como
// porta de entrada: se estiver ocupado, nada e tocado - nem o rollout - e a
// sessao sai como pulada em vez de ficar meio limpa. O inverso (rollout
// primeiro) nao da essa garantia, porque um arquivo nao recusa escrita.
function redactCodexSession(result, only) {
  const banco = redactCodexDb(result.dbPath, result.sessionId, { only });
  if (banco.busy) return { changed: 0, dbBusy: true };
  if (banco.error) return { changed: 0, dbError: banco.error };

  const rollout = result.filePath ? redactFile(result.filePath, { only }) : { changed: 0 };

  return {
    changed: rollout.changed + banco.changed,
    rolloutChanged: rollout.changed,
    dbChanged: banco.changed,
    // Erro no rollout DEPOIS do banco ja ter sido commitado: estado parcial de
    // verdade, e o relatorio precisa dizer isso em vez de reportar sucesso.
    error: rollout.error,
    partial: Boolean(rollout.error) && banco.changed > 0,
  };
}

// `only` restringe a limpeza aos achados que o usuario marcou na tela
// interativa; null (o caminho do --redact) cobre todo achado de alta
// confianca encontrado.
function redactSession(result, only = null) {
  if (result.agent === 'codex') return redactCodexSession(result, only);
  return redactFile(result.filePath, { only });
}

module.exports = { redactSession };
