const { spawn } = require('child_process');

// TERM_PROGRAM so vira "iTerm.app" quando o processo esta rodando dentro do
// iTerm2 de verdade.
function available() {
  return process.platform === 'darwin' && process.env.TERM_PROGRAM === 'iTerm.app';
}

// AppleScript nao tem um jeito direto de passar array de argumentos para
// "write text" - o comando final e montado como uma unica linha de shell,
// entao cada parte precisa ser citada.
function quoteForShell(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// A linha de shell fica embutida dentro de uma string do AppleScript, que
// tem suas proprias regras de escape - diferentes das do shell. As duas
// camadas precisam ser escapadas em ordem: shell primeiro, AppleScript depois.
function forAppleScriptString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function open(session, command) {
  const linha = command.map(quoteForShell).join(' ');
  const cd = `cd ${quoteForShell(session.dir)}`;
  const comando = forAppleScriptString(`${cd} && ${linha}`);
  const script = `
    tell application "iTerm2"
      tell current window
        set newTab to (create tab with default profile)
        tell current session of newTab
          write text "${comando}"
        end tell
      end tell
    end tell
  `;

  const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
  child.unref();
}

module.exports = { name: 'iterm2', available, open };
