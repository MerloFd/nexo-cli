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

function open(session) {
  const child = spawn('wt.exe', [
    'new-tab',
    '-d', session.dir,
    'powershell', '-NoExit', '-Command', `claude -r ${session.sessionId}`,
  ], { detached: true, stdio: 'ignore' });
  child.unref();
}

module.exports = { name: 'windows-terminal', available, open };
