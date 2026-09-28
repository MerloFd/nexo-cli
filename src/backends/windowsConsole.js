const { spawn } = require('child_process');

// Console classico (conhost) nao tem abas: o melhor possivel e janela nova.
// So entra quando o Windows Terminal nao esta em jogo.
function available() {
  if (process.platform !== 'win32') return false;
  return !process.env.WT_SESSION;
}

function open(session, command) {
  const child = spawn(
    'cmd',
    ['/c', 'start', '', 'cmd', '/k', `cd /d "${session.dir}" && ${command.join(' ')}`],
    { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }
  );
  child.unref();
}

module.exports = { name: 'windows-console', available, open };
