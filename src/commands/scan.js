const { scanSessions } = require('../scan');
const { redactFile, isPossiblyActive } = require('../scan/redact');
const { runInteractiveScan } = require('../scan/interactive');
const { daysAgo } = require('../scanSessions');
const { t } = require('../i18n');

// V1 do redact so cobre Claude: e o unico agente que ainda grava sessao como
// arquivo texto que da para reescrever linha a linha. O Codex atual guarda em
// SQLite, e mexer num banco pede outra abordagem, ainda nao feita.
function redactCandidates(results) {
  return results.filter(
    (r) => r.agent === 'claude' && r.findings.some((f) => f.confidence === 'alta')
  );
}

function applyRedactions(results) {
  const candidatos = redactCandidates(results);
  const puladas = candidatos.filter((r) => isPossiblyActive(r.mtime));
  const alvo = candidatos.filter((r) => !isPossiblyActive(r.mtime));

  const feitas = alvo
    .map((r) => ({ result: r, outcome: redactFile(r.filePath) }))
    .filter((entry) => entry.outcome.changed > 0 || entry.outcome.error);

  return { feitas, puladas };
}

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

function printRedactReport({ feitas, puladas }) {
  console.log('');

  if (feitas.length === 0 && puladas.length === 0) {
    console.log(t('scan.redact.nothing'));
    return;
  }

  console.log(t('scan.redact.title'));
  console.log('');

  for (const { result, outcome } of feitas) {
    const rotulo = result.title || result.sessionId.slice(0, 8);
    if (outcome.error) {
      console.log(`  ${rotulo}: ${t('cli.warning', { message: outcome.error })}`);
    } else {
      console.log(`  ${rotulo}: ${t('scan.redact.count', { n: outcome.changed })}`);
    }
  }

  if (puladas.length > 0) {
    console.log('');
    console.log(t('scan.redact.skippedActive', { n: puladas.length }));
    for (const r of puladas) console.log(`  ${r.title || r.sessionId.slice(0, 8)}`);
  }

  console.log('');
  console.log(t('scan.redact.note1'));
  console.log(t('scan.redact.note2'));
}

// A saida legivel por maquina carrega apenas metadado: tipo, contagem e
// localizacao. Nunca o valor. Assim ela pode ser agregada por terceiros sem
// transportar o segredo junto.
function printJson(results, redacted) {
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

  // Sem --redact, mantem o formato de sempre (lista plana) para nao quebrar
  // quem ja consome esse JSON. So com --redact o formato ganha essa segunda
  // chave, porque so ai existe outra coisa para reportar.
  if (!redacted) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        findings: payload,
        redacted: {
          sessions: redacted.feitas.map(({ result, outcome }) => ({
            sessionId: result.sessionId,
            occurrencesRemoved: outcome.changed || 0,
            error: outcome.error || null,
          })),
          skippedPossiblyActive: redacted.puladas.map((r) => r.sessionId),
        },
      },
      null,
      2
    )
  );
}

// Tela interativa so entra quando faz sentido: terminal de verdade, nada de
// --json (saida pra maquina) nem --redact (esse fica com o comportamento
// direto de sempre, pra automacao/CI) - e so quando ha achado de alta
// confianca de fato selecionavel, senao a tela abriria vazia a toa.
function podeSerInterativo({ json, redact }, results) {
  if (json || redact) return false;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  return results.some((r) => r.agent === 'claude' && r.findings.some((f) => f.confidence === 'alta'));
}

async function run(sessions, { json = false, redact = false } = {}) {
  const comArquivo = sessions.filter((s) => s.filePath);

  if (!json) {
    console.log(t('scan.scanning', { n: comArquivo.length }));
  }

  const results = await scanSessions(comArquivo);

  if (podeSerInterativo({ json, redact }, results)) {
    const redigido = await runInteractiveScan(results);
    if (!redigido) return 0;
    printRedactReport(redigido);
    return redigido.feitas.some((f) => f.outcome.error) ? 1 : 0;
  }

  const redacted = redact ? applyRedactions(results) : null;

  if (json) {
    printJson(results, redacted);
  } else {
    printReport(results);
    if (redacted) printRedactReport(redacted);
  }

  if (redacted) return redacted.feitas.some((f) => f.outcome.error) ? 1 : 0;

  // So achado de alta confianca reprova o exit code - baixa/media confianca
  // sao ruido/hash na maioria das vezes (ver scan.group.low.note), e fazer
  // um pre-commit hook falhar nisso deixaria o gate barulhento demais pra
  // ser adotado de verdade.
  return contar(results, 'alta') > 0 ? 2 : 0;
}

module.exports = { run, printReport, printJson, redactCandidates, applyRedactions };
