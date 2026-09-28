const { execFileSync, spawn } = require('child_process');

// --new-tab so vira aba de verdade se "Run all Konsole windows in a single
// process" estiver ligado nas configuracoes do usuario; sem isso o Konsole
// abre janela nova mesmo - degradacao aceitavel, a sessao ainda abre.
function available() {
  if (process.platform !== 'linux') return false;
  try {
    execFileSync('which', ['konsole'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function open(session, command) {
  const child = spawn(
    'konsole',
    ['--new-tab', '--workdir', session.dir, '-e', ...command],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
}

module.exports = { name: 'konsole', available, open };
