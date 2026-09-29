const { execFileSync } = require('child_process');
const { sendLater } = require('./sendLater');

function available() {
  if (process.platform === 'win32') return false;
  if (!process.env.TMUX) return false;
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function open(session, command, { sendText = null } = {}) {
  if (sendText) {
    // -P -F devolve o id do pane recem-criado - sem ele nao da pra mirar o
    // "send-keys" na janela certa depois.
    const paneId = execFileSync('tmux', [
      'new-window',
      '-c', session.dir,
      '-P', '-F', '#{pane_id}',
      command.join(' '),
    ], { encoding: 'utf8' }).trim();

    sendLater([['tmux', ['send-keys', '-t', paneId, sendText, 'Enter']]]);
    return;
  }

  execFileSync('tmux', [
    'new-window',
    '-c', session.dir,
    command.join(' '),
  ], { stdio: 'inherit' });
}

module.exports = { name: 'tmux', available, open, supportsSend: true };
