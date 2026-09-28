const { execFileSync, spawn } = require('child_process');

function available() {
  if (process.platform !== 'win32') return false;
  try {
    execFileSync('where', ['wt.exe'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function open(session, command) {
  // -w e opcao global do wt.exe: precisa vir ANTES do subcomando. Depois de
  // new-tab, o parser trata "-w" e "0" como argumentos soltos do subcomando,
  // que os interpreta como o proprio executavel a rodar - e falha tentando
  // iniciar um processo chamado "0".
  const child = spawn('wt.exe', [
    '-w', '0',
    'new-tab',
    '-d', session.dir,
    'powershell', '-NoExit', '-Command', command.join(' '),
  ], { detached: true, stdio: 'ignore' });
  child.unref();
}

module.exports = { name: 'windows-terminal', available, open };
