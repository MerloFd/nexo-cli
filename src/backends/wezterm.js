const { execFileSync, spawn } = require('child_process');
const { sendLater } = require('./sendLater');

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

function open(session, command, { sendText = null } = {}) {
  if (sendText) {
    // "wezterm cli spawn" imprime o id do pane novo no stdout.
    const paneId = execFileSync(
      'wezterm',
      ['cli', 'spawn', '--cwd', session.dir, '--', ...command],
      { encoding: 'utf8' }
    ).trim();

    // --no-paste manda cada caractere como tecla de verdade, nao como um
    // colar - sem isso o \r final vira quebra de linha dentro do texto
    // colado em vez de um Enter que envia a mensagem.
    sendLater([
      ['wezterm', ['cli', 'send-text', '--pane-id', paneId, '--no-paste', `${sendText}\r`]],
    ]);
    return;
  }

  const child = spawn(
    'wezterm',
    ['cli', 'spawn', '--cwd', session.dir, '--', ...command],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
}

module.exports = { name: 'wezterm', available, open, supportsSend: true };
