const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// "where wt.exe" spawna um processo so pra checar isso - custa ~300ms de
// verdade no Windows, em toda chamada do nexo, so pra confirmar algo que
// quase nunca muda. Instalacao pela Store (a mais comum) sempre cai nesse
// caminho fixo via App Execution Alias.
//
// Um App Execution Alias e um reparse point de 0 bytes, nao um arquivo de
// verdade: fs.existsSync/statSync tentam um stat generico e o Windows nega
// (EACCES), entao existsSync silenciosamente devolve false - medido e
// confirmado, essa era a primeira tentativa e nao funcionava. So um pedido
// de acesso de EXECUCAO (X_OK) e permitido nesse tipo de arquivo; e o que
// "where" acaba fazendo por baixo, so que via um processo novo.
function fastPath() {
  const local = process.env.LOCALAPPDATA;
  if (!local) return null;
  return path.join(local, 'Microsoft', 'WindowsApps', 'wt.exe');
}

function canExecute(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function available() {
  if (process.platform !== 'win32') return false;

  const known = fastPath();
  if (known && canExecute(known)) return true;

  // So cai aqui para instalacao fora da Store (winget/scoop/zip em outro
  // caminho do PATH) - mais lento, mas nao e o caso comum.
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
