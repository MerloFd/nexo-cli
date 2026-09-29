const { execFileSync, spawn } = require('child_process');

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

  // Sem isso a aba fica com o rotulo generico do herdr ate o agente terminar
  // de carregar e escrever seu proprio titulo via OSC - com --no-focus (abrir
  // varias de uma vez) isso demora ainda mais por rodar em segundo plano.
  const label = session.title || session.summary;
  if (label) {
    try {
      execFileSync('herdr', ['pane', 'rename', paneId, label], { stdio: 'ignore' });
    } catch {
      // Rotulo e cosmetico - falhar aqui nao pode impedir a sessao de abrir.
    }
  }

  const [kind, ...resumeArgs] = command;
  const agentName = `sw${Date.now().toString().slice(-6)}`;

  // "herdr agent start" so retorna depois que o agente esta pronto para
  // interagir - para o Claude isso mede segundos, nao milissegundos. Esperar
  // isso de forma sincrona travava o nexo inteiro ate a sessao carregar.
  // Como o pane ja existe e ja e valido (acabou de ser criado), o start pode
  // rodar em segundo plano: a aba abre e carrega sozinha, sem prender o nexo.
  const child = spawn(
    'herdr',
    ['agent', 'start', agentName, '--kind', kind, '--pane', paneId, '--', ...resumeArgs],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
}

module.exports = { name: 'herdr', available, open };
