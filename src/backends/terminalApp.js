const { spawn } = require('child_process');

// Ultimo recurso no macOS: Terminal.app so abre aba nova via um hack de
// System Events (simular Cmd+T) que pede permissao de Acessibilidade - fragil
// demais para fazer sem o usuario pedir. Isto abre uma janela nova, que e o
// caminho suportado de verdade pelo AppleScript.
function available() {
  return process.platform === 'darwin' && process.env.TERM_PROGRAM !== 'iTerm.app';
}

function quoteForShell(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function forAppleScriptString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function open(session, command) {
  const linha = command.map(quoteForShell).join(' ');
  const cd = `cd ${quoteForShell(session.dir)}`;
  const comando = forAppleScriptString(`${cd} && ${linha}`);
  const script = `tell application "Terminal" to do script "${comando}"`;

  const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
  child.unref();
}

module.exports = { name: 'terminal-app', available, open };
