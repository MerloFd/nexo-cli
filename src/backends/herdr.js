const { execFileSync } = require('child_process');

function available() {
  if (process.env.HERDR_ENV !== '1') return false;
  if (!process.env.HERDR_WORKSPACE_ID) return false;
  try {
    execFileSync('herdr', ['--help'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function open(session) {
  const raw = execFileSync('herdr', [
    'tab', 'create',
    '--workspace', process.env.HERDR_WORKSPACE_ID,
    '--cwd', session.dir,
  ], { encoding: 'utf8' });

  const parsed = JSON.parse(raw);
  const paneId = parsed && parsed.result && parsed.result.root_pane && parsed.result.root_pane.pane_id;
  if (!paneId) throw new Error('herdr nao retornou pane_id');

  const agentName = `sw${Date.now().toString().slice(-6)}`;
  execFileSync('herdr', [
    'agent', 'start', agentName,
    '--kind', 'claude',
    '--pane', paneId,
    '--', '-r', session.sessionId,
  ], { stdio: 'ignore' });
}

module.exports = { name: 'herdr', available, open };
