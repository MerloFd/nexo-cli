const { execFileSync, spawn } = require('child_process');

// WEZTERM_PANE so existe quando o processo esta rodando dentro de um pane do
// WezTerm de verdade - diferente de "binario no PATH", que so prova que o
// programa esta instalado, nao que e o terminal atual.
function available() {
  if (!process.env.WEZTERM_PANE) return false;
  try {
    execFileSync('wezterm', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function open(session, command) {
  const child = spawn(
    'wezterm',
    ['cli', 'spawn', '--cwd', session.dir, '--', ...command],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
}

module.exports = { name: 'wezterm', available, open };
