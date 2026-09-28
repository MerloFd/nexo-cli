const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE_FILE = path.join(os.homedir(), '.nexo-cache.json');
const VERSION = 1;

// Sessao encerrada nunca mais muda, e a maioria das sessoes esta encerrada.
// Chavear por mtime+tamanho deixa o start pagar so pelo que mexeu desde a
// ultima vez; qualquer divergencia invalida a entrada e o arquivo e relido.
function load(cacheFile = CACHE_FILE) {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (raw.version !== VERSION) return new Map();
    return new Map(Object.entries(raw.entries));
  } catch {
    return new Map();
  }
}

function save(entries, cacheFile = CACHE_FILE) {
  try {
    const payload = { version: VERSION, entries: Object.fromEntries(entries) };
    fs.writeFileSync(cacheFile, JSON.stringify(payload), 'utf8');
  } catch {
    // cache e otimizacao: falhar aqui nao pode derrubar a listagem
  }
}

function keyFor(filePath, stat) {
  return `${filePath}|${Math.round(stat.mtimeMs)}|${stat.size}`;
}

module.exports = { load, save, keyFor, CACHE_FILE };
