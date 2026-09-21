const { execFileSync } = require('child_process');

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

function open(session) {
  execFileSync('tmux', [
    'new-window',
    '-c', session.dir,
    `claude -r ${session.sessionId}`,
  ], { stdio: 'inherit' });
}

module.exports = { name: 'tmux', available, open };
