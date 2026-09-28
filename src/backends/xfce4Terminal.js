const { execFileSync, spawn } = require('child_process');

function available() {
  if (process.platform !== 'linux') return false;
  try {
    execFileSync('which', ['xfce4-terminal'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function open(session, command) {
  const child = spawn(
    'xfce4-terminal',
    ['--tab', `--working-directory=${session.dir}`, '-x', ...command],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
}

module.exports = { name: 'xfce4-terminal', available, open };
