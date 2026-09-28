const { scanSessions } = require('../scan');
const { daysAgo } = require('../scanSessions');

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
    console.log('Nenhum segredo encontrado nos logs de sessao.');
    return;
  }

  const altas = contar(results, 'alta');
  const resto = contar(results, 'media') + contar(results, 'baixa');
  console.log(`${altas} achado(s) de alta confianca e ${resto} a conferir, em ${results.length} sessao(oes).\n`);

  imprimirGrupo(results, 'alta', 'ALTA CONFIANCA - formato so existe em credencial de verdade:');
  imprimirGrupo(
    results,
    'media',
    'A CONFERIR - atribuicao com cara de segredo:',
    '  Pode ser codigo citado ou exemplo. Olhe antes de agir.'
  );
  imprimirGrupo(
    results,
    'baixa',
    'RUIDO PROVAVEL - string aleatoria perto de palavra sensivel:',
    '  Costuma ser hash, id ou caminho. Listado para nao esconder nada.'
  );

  if (altas > 0) {
    console.log('O que fazer, nesta ordem:');
    console.log('  1. ROTACIONE as credenciais de alta confianca. Elas ja foram enviadas ao');
    console.log('     provedor junto com a conversa - apagar o arquivo local nao desfaz isso.');
    console.log('  2. Depois limpe o log local, que fica em texto puro no seu perfil e pode');
    console.log('     ser lido por qualquer processo rodando com o seu usuario.');
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
    console.log(`Varrendo ${comArquivo.length} sessao(oes)...`);
  }

  const results = await scanSessions(comArquivo);

  if (json) printJson(results);
  else printReport(results);

  return results.length > 0 ? 2 : 0;
}

module.exports = { run, printReport, printJson };
