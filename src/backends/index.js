const herdr = require('./herdr');
const wezterm = require('./wezterm');
const kitty = require('./kitty');
const iterm2 = require('./iterm2');
const windowsTerminal = require('./windowsTerminal');
const tmux = require('./tmux');
const windowsConsole = require('./windowsConsole');
const gnomeTerminal = require('./gnomeTerminal');
const konsole = require('./konsole');
const xfce4Terminal = require('./xfce4Terminal');
const terminalApp = require('./terminalApp');
const fallback = require('./fallback');
const { resumeArgs, newSessionArgs } = require('../agents');

// Do mais certo para o menos certo. wezterm/kitty/iTerm2 prova por variavel de
// ambiente que E aquele terminal rodando agora, nao so que o binario existe -
// vem antes dos que so adivinham pela presenca do programa no PATH
// (gnome-terminal/konsole/xfce4-terminal). Quem abre aba vem antes de quem so
// abre janela, e imprimir o comando e o ultimo recurso.
const BACKENDS = [
  herdr,
  wezterm,
  kitty,
  iterm2,
  windowsTerminal,
  tmux,
  windowsConsole,
  gnomeTerminal,
  konsole,
  xfce4Terminal,
  terminalApp,
  fallback,
];

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

// Mesma cadeia pra abrir sessao existente ou nova - cada backend so sabe
// abrir um terminal com um comando dentro de um diretorio, nunca soube (nem
// precisa saber) se o comando resume algo ou comeca do zero. E o que deixa
// "nova sessao" automaticamente agnostico de terminal, sem nada especifico
// por backend.
function tryBackends(session, command, backends, opts) {
  assertValidSession(session);

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
      backend.open(session, command, opts);
      return { backend: backend.name, command, failures, sendSupported: Boolean(backend.supportsSend) };
    } catch (err) {
      failures.push(`${backend.name}: ${err.message}`);
    }
  }

  throw new Error(`Nenhum backend conseguiu abrir a sessao. ${failures.join(' | ')}`);
}

function openSession(session, backends = BACKENDS, opts = {}) {
  return tryBackends(session, resumeArgs(session), backends, opts);
}

// Sem sessao de verdade ainda, so um id sintetico (valido pro formato que
// assertValidSession exige) pra reaproveitar a mesma cadeia de backends -
// nenhum backend le esse id pra nada alem de validacao de formato.
function openNewSession(agentId, dir, backends = BACKENDS, opts = {}) {
  const session = { dir, sessionId: 'new-session', agent: agentId };
  return tryBackends(session, newSessionArgs(agentId), backends, opts);
}

module.exports = { openSession, openNewSession, assertValidSession, BACKENDS, SESSION_ID_RE };
