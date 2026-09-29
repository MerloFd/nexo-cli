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

// Mandar o prompt exige esperar o agente ficar pronto pra digitar - e
// "agent start" so retorna quando isso acontece (pode levar segundos). Rodar
// essa espera + o envio dentro de um processo node proprio, destacado do
// nexo, deixa ele bloquear a vontade: quem espera e esse processo-filho, nao
// o nexo. Os valores dinamicos entram via JSON.stringify (escapa pra sintaxe
// JS valida) - nunca via shell, entao nao ha risco de injecao de comando
// mesmo com texto arbitrario do usuario em --send.
function spawnAgentThenSend({ agentName, kind, paneId, resumeArgs, sendText }) {
  const args = ['agent', 'start', agentName, '--kind', kind, '--pane', paneId, '--', ...resumeArgs];
  const script = `
    const { execFileSync } = require('child_process');
    try {
      execFileSync('herdr', ${JSON.stringify(args)}, { stdio: 'ignore' });
      execFileSync('herdr', ['pane', 'send-text', ${JSON.stringify(paneId)}, ${JSON.stringify(sendText)}], { stdio: 'ignore' });
      execFileSync('herdr', ['pane', 'send-keys', ${JSON.stringify(paneId)}, 'enter'], { stdio: 'ignore' });
    } catch {}
  `;
  const child = spawn(process.execPath, ['-e', script], { detached: true, stdio: 'ignore' });
  child.unref();
}

function open(session, command, { background = false, sendText = null } = {}) {
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
  const tabId = parsed && parsed.result && parsed.result.tab && parsed.result.tab.tab_id;
  if (!paneId) throw new Error('herdr nao retornou pane_id');

  // O titulo visivel na aba vem do TAB, nao do pane - "pane rename" so muda
  // um rotulo interno que nao aparece na barra de abas (confirmado ao vivo:
  // renomear o pane nao mudava nada visualmente, so "tab rename" muda).
  const label = session.title || session.summary;
  if (label && tabId) {
    try {
      execFileSync('herdr', ['tab', 'rename', tabId, label], { stdio: 'ignore' });
    } catch {
      // Rotulo e cosmetico - falhar aqui nao pode impedir a sessao de abrir.
    }
  }

  const [kind, ...resumeArgs] = command;
  const agentName = `sw${Date.now().toString().slice(-6)}`;

  if (sendText) {
    spawnAgentThenSend({ agentName, kind, paneId, resumeArgs, sendText });
    return;
  }

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

module.exports = { name: 'herdr', available, open, supportsSend: true };
