const { scanSessions } = require('../scan');
const { daysAgo } = require('../scanSessions');
const { t } = require('../i18n');

function contar(results, confidence) {
  return results.reduce(
    (n, r) => n + r.findings.filter((f) => f.confidence === confidence).length,
    0
  );
}

function imprimirGrupo(results, confidence, titulo, nota) {
  const comAchado = results
    .map((r) => ({ ...r, findings: r.findings.filter((f) => f.confidence === confidence) }))
    .filter((r) => r.findings.length > 0);

  if (comAchado.length === 0) return;

  console.log(`${titulo}`);
  if (nota) console.log(`${nota}`);
  console.log('');

  for (const result of comAchado) {
    const rotulo = result.title || result.sessionId.slice(0, 8);
    console.log(`  ${rotulo}`);
    console.log(`    ${result.agent} · ${daysAgo(result.mtime)} · ${result.dir}`);

    for (const f of result.findings) {
      const vezes = f.occurrences > 1 ? ` (${f.occurrences}x)` : '';
      console.log(`      ${f.label}: ${f.masked}${vezes}  linha ${f.firstLine}`);
    }

    console.log(`    ${result.filePath}`);
    console.log('');
  }
}

function printReport(results) {
  if (results.length === 0) {
    console.log(t('scan.clean'));
    return;
  }

  const altas = contar(results, 'alta');
  const resto = contar(results, 'media') + contar(results, 'baixa');
  console.log(t('scan.summary', { high: altas, rest: resto, sessions: results.length }));

  imprimirGrupo(results, 'alta', t('scan.group.high'));
  imprimirGrupo(
    results,
    'media',
    t('scan.group.medium'),
    t('scan.group.medium.note')
  );
  imprimirGrupo(
    results,
    'baixa',
    t('scan.group.low'),
    t('scan.group.low.note')
  );

  if (altas > 0) {
    console.log(t('scan.advice.title'));
    console.log(t('scan.advice.1'));
    console.log(t('scan.advice.2'));
    console.log(t('scan.advice.3'));
    console.log(t('scan.advice.4'));
  }
}

// A saida legivel por maquina carrega apenas metadado: tipo, contagem e
// localizacao. Nunca o valor. Assim ela pode ser agregada por terceiros sem
// transportar o segredo junto.
function printJson(results) {
  const payload = results.map((r) => ({
    agent: r.agent,
    sessionId: r.sessionId,
    dir: r.dir,
    title: r.title,
    mtime: new Date(r.mtime).toISOString(),
    findings: r.findings.map((f) => ({
      rule: f.rule,
      confidence: f.confidence,
      occurrences: f.occurrences,
      firstLine: f.firstLine,
      length: f.length,
    })),
  }));

  console.log(JSON.stringify(payload, null, 2));
}

async function run(sessions, { json = false } = {}) {
  const comArquivo = sessions.filter((s) => s.filePath);

  if (!json) {
    console.log(t('scan.scanning', { n: comArquivo.length }));
  }

  const results = await scanSessions(comArquivo);

  if (json) printJson(results);
  else printReport(results);

  return results.length > 0 ? 2 : 0;
}

module.exports = { run, printReport, printJson };
