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

function open(session, command, { background = false } = {}) {
  const args = [
    'tab', 'create',
    '--workspace', process.env.HERDR_WORKSPACE_ID,
    '--cwd', session.dir,
  ];
  // Ctrl+Enter mantem o seletor aberto para escolher mais sessoes: sem
  // --no-focus a aba nova rouba o foco e as teclas seguintes vao parar nela
  // em vez de continuar navegando a lista.
  if (background) args.push('--no-focus');

  const raw = execFileSync('herdr', args, { encoding: 'utf8' });

  const parsed = JSON.parse(raw);
  const paneId = parsed && parsed.result && parsed.result.root_pane && parsed.result.root_pane.pane_id;
  if (!paneId) throw new Error('herdr nao retornou pane_id');

  const [kind, ...resumeArgs] = command;
  const agentName = `sw${Date.now().toString().slice(-6)}`;

  execFileSync('herdr', [
    'agent', 'start', agentName,
    '--kind', kind,
    '--pane', paneId,
    '--', ...resumeArgs,
  ], { stdio: 'ignore' });
}

module.exports = { name: 'herdr', available, open };
