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

// No PowerShell, "claude" resolve pro claude.ps1 do npm antes do claude.cmd
// (script tem prioridade sobre aplicativo na resolucao de comando) - esse
// shim carrega o profile do usuario inteiro so pra repassar pro claude.exe
// de verdade. Achando o .exe real uma vez (via o .cmd, que ja aponta pra ele
// em texto puro) e chamando ele direto, pula essa camada por completo.
let cachedClaudeExe;

function resolveClaudeExe() {
  if (cachedClaudeExe !== undefined) return cachedClaudeExe;
  try {
    const cmdPath = execFileSync('where', ['claude.cmd'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
    const exe =
      cmdPath && path.join(path.dirname(cmdPath), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    cachedClaudeExe = exe && fs.existsSync(exe) ? exe : null;
  } catch {
    cachedClaudeExe = null;
  }
  return cachedClaudeExe;
}

function open(session, command) {
  const [kind, ...resto] = command;
  const claudeExe = kind === 'claude' ? resolveClaudeExe() : null;
  const script = claudeExe ? `& "${claudeExe}" ${resto.join(' ')}` : command.join(' ');

  // wt.exe reparsa os argumentos depois de "new-tab" com as proprias regras,
  // e mastiga aspas aninhadas dentro do -Command - um caminho com espaco
  // (comum: "C:\Users\Nome Sobrenome\...") perdia as aspas no meio do
  // caminho, e o PowerShell tentava rodar so o pedaco antes do espaco como
  // comando (confirmado ao vivo). -EncodedCommand manda o script inteiro em
  // base64: nada pra reinterpretar, nenhuma aspa pra perder.
  const encoded = Buffer.from(script, 'utf16le').toString('base64');

  // -w e opcao global do wt.exe: precisa vir ANTES do subcomando. Depois de
  // new-tab, o parser trata "-w" e "0" como argumentos soltos do subcomando,
  // que os interpreta como o proprio executavel a rodar - e falha tentando
  // iniciar um processo chamado "0".
  const child = spawn('wt.exe', [
    '-w', '0',
    'new-tab',
    '-d', session.dir,
    'powershell', '-NoExit', '-EncodedCommand', encoded,
  ], { detached: true, stdio: 'ignore' });
  child.unref();
}

module.exports = { name: 'windows-terminal', available, open };
