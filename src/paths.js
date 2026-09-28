// Os agentes gravam o mesmo diretorio ora como "c:\DEV" ora como "C:\DEV",
// e o opencode usa barra normal no Windows. Sem normalizar, o mesmo projeto
// aparece duas vezes na lista e no relatorio de uso.
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
