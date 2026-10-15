// Os agentes gravam o mesmo diretorio ora como "c:\DEV" ora como "C:\DEV", e
// no Windows a barra pode vir normal em vez de invertida. Sem normalizar, o
// mesmo projeto aparece duas vezes na lista e no relatorio de uso - identidade
// de diretorio nao e igualdade de string.
function normalizeDir(dir) {
  if (!dir) return dir;

  let out = String(dir).replace(/^\\\\\?\\/, '');

  if (/^[a-zA-Z]:/.test(out)) {
    out = out[0].toUpperCase() + out.slice(1);
    out = out.replace(/\//g, '\\');
  }

  return out.replace(/[\\/]+$/, '');
}

module.exports = { normalizeDir };
