const { execFileSync, spawn } = require('child_process');

function available() {
  if (process.platform !== 'win32') return false;
  try {
    execFileSync('where', ['wt.exe'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function open(session, command) {
  const child = spawn('wt.exe', [
    'new-tab',
    '-w', '0',
    '-d', session.dir,
    'powershell', '-NoExit', '-Command', command.join(' '),
  ], { detached: true, stdio: 'ignore' });
  child.unref();
}

module.exports = { name: 'windows-terminal', available, open };
