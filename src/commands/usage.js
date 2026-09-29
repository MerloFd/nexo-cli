const { collect } = require('../usage/collect');
const { build } = require('../usage/report');
const { runDashboard } = require('../usage/interactive');

async function run(sessions, { json = false, periodo = 'dia' } = {}) {
  const samples = await collect(sessions);

  if (json) {
    console.log(
      JSON.stringify(
        samples.map((s) => ({
          agent: s.agent,
          model: s.model,
          dir: s.dir,
          sessionId: s.sessionId,
          at: new Date(s.at).toISOString(),
          approximate: Boolean(s.approximate),
          ...s.totals,
        })),
        null,
        2
      )
    );
    return 0;
  }

  // Sem TTY (pipe, script, CI) nao ha como navegar nada - mantem a saida
  // estatica de sempre, scriptavel como qualquer outro comando de texto.
  if (process.stdin.isTTY && process.stdout.isTTY) {
    await runDashboard(samples, { periodo });
    return 0;
  }

  console.log(build(samples, { periodo }));
  return 0;
}

module.exports = { run };
