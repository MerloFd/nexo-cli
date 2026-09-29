const { spawn } = require('child_process');

// Fora do Herdr nao existe um jeito confiavel de saber quando o agente
// terminou de carregar (o Herdr tem "agent start", que bloqueia ate o agente
// ficar pronto - nada equivalente existe pra tmux/WezTerm/kitty). Uma espera
// fixa e a unica opcao sem inventar dependencia nova de automacao de
// terminal - curta o bastante pra nao incomodar, longa o bastante pra cobrir
// o boot comum do Claude/Codex, mas e estimativa, nao garantia.
const BOOT_DELAY_MS = 2500;

// Roda os comandos num processo node separado e destacado, depois da espera -
// pra nao travar o nexo pelo tempo todo so pra mandar um texto depois.
function sendLater(steps) {
  const script = `
    setTimeout(() => {
      const { execFileSync } = require('child_process');
      for (const [bin, args] of ${JSON.stringify(steps)}) {
        try { execFileSync(bin, args, { stdio: 'ignore' }); } catch {}
      }
    }, ${BOOT_DELAY_MS});
  `;
  const child = spawn(process.execPath, ['-e', script], { detached: true, stdio: 'ignore' });
  child.unref();
}

module.exports = { sendLater, BOOT_DELAY_MS };
