const herdr = require('./herdr');
const windowsTerminal = require('./windowsTerminal');
const tmux = require('./tmux');
const fallback = require('./fallback');
const { resumeArgs } = require('../agents');

const BACKENDS = [herdr, windowsTerminal, tmux, fallback];

const SESSION_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

function assertValidSession(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('Sessao invalida.');
  }
  if (typeof session.dir !== 'string' || !session.dir.trim()) {
    throw new Error('Diretorio da sessao invalido.');
  }
  if (typeof session.sessionId !== 'string' || !SESSION_ID_RE.test(session.sessionId)) {
    throw new Error(`Id de sessao invalido: ${String(session.sessionId)}`);
  }
}

function openSession(session, backends = BACKENDS) {
  assertValidSession(session);
  const command = resumeArgs(session);

  // NEXO_FORCE_FALLBACK existe para os testes nao abrirem terminais de verdade.
  const chain = process.env.NEXO_FORCE_FALLBACK ? [fallback] : backends;

  const failures = [];
  for (const backend of chain) {
    let usable = false;
    try {
      usable = backend.available();
    } catch {
      usable = false;
    }
    if (!usable) continue;

    try {
      backend.open(session, command);
      return { backend: backend.name, command, failures };
    } catch (err) {
      failures.push(`${backend.name}: ${err.message}`);
    }
  }

  throw new Error(`Nenhum backend conseguiu abrir a sessao. ${failures.join(' | ')}`);
}

module.exports = { openSession, assertValidSession, BACKENDS, SESSION_ID_RE };
