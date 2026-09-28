const { execFileSync, spawn } = require('child_process');

// Sem env var confiavel para provar "e este terminal que esta rodando agora"
// (diferente de wezterm/kitty/iTerm2) - so da para checar se o binario existe.
// --tab abre na janela usada mais recentemente do gnome-terminal.
function available() {
  if (process.platform !== 'linux') return false;
  try {
    execFileSync('which', ['gnome-terminal'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function open(session, command) {
  const child = spawn(
    'gnome-terminal',
    ['--tab', `--working-directory=${session.dir}`, '--', ...command],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
}

module.exports = { name: 'gnome-terminal', available, open };
