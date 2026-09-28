const { collect } = require('../usage/collect');
const { build } = require('../usage/report');

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

  console.log(build(samples, { periodo }));
  return 0;
}

module.exports = { run };
